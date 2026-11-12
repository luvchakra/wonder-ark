import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestInboundEmail } from "../conversations/ingest-inbound-email";
import { readInbox, type ImapDeps } from "./imap";
import type { SendingMailbox } from "./mailbox";
import { recordBounce } from "./stops";

/**
 * DISC-CAMP-P0-04.1 / 04.2: what the tick does with a workspace's mailbox before it
 * sends anything: reads the replies and bounces that arrived, so a prospect who
 * answered, or whose address failed, is stopped before its next step.
 *
 *  - A reply from someone the workspace enrolled goes through the same ingest as a reply
 *    from the inbound webhook, held to this workspace: it is stored once (by its
 *    Message-ID), stops the follow-ups, is classified, and an unsubscribe request puts
 *    the address on the opt-out list.
 *  - A failure notice naming an address the workspace sent to marks that email bounced,
 *    stops the enrollment and puts the address on the opt-out list.
 *  - Everything else in the mailbox is not read (`readInbox`).
 *
 * If the mailbox is set to be read and cannot be, the caller must not send for that
 * workspace in this tick: whether someone replied is a check, and a check that cannot
 * be made means no send. The reason is kept on the mailbox for the campaign page.
 */

export type InboxSync = { ok: true; replies: number; bounces: number; ignored: number } | { ok: false; reason: string };

const lower = (value: string | null | undefined) => value?.trim().toLowerCase() || null;

export async function syncMailboxInbox(db: SupabaseClient, workspaceId: string, mailbox: SendingMailbox, deps: ImapDeps = {}, now: Date = new Date()): Promise<InboxSync> {
  if (!mailbox.imap) return { ok: true, replies: 0, bounces: 0, ignored: 0 };

  const [enrollments, sends, campaigns] = await Promise.all([
    db.from("outreach_enrollments").select("id, prospect_id, contact_id, recipient").eq("workspace_id", workspaceId),
    db.from("outreach_sends").select("enrollment_id, status").eq("workspace_id", workspaceId),
    db.from("outreach_campaigns").select("launched_at").eq("workspace_id", workspaceId),
  ]);
  for (const result of [enrollments, sends, campaigns]) if (result.error) throw result.error;
  const enrolled = (enrollments.data ?? []) as { id: string; prospect_id: string; contact_id: string | null; recipient: string }[];
  if (enrolled.length === 0) return { ok: true, replies: 0, bounces: 0, ignored: 0 };

  // Who was enrolled, by address. Only these addresses are ever matched against the inbox.
  const contactIds = enrolled.filter((row) => row.contact_id).map((row) => row.contact_id as string);
  const generalOf = enrolled.filter((row) => row.recipient === "company_email").map((row) => row.prospect_id);
  const [contacts, prospects] = await Promise.all([
    contactIds.length ? db.from("contacts").select("id, prospect_id, email").in("id", contactIds) : { data: [], error: null },
    generalOf.length ? db.from("prospects").select("id, company_email").in("id", generalOf) : { data: [], error: null },
  ]);
  if (contacts.error) throw contacts.error;
  if (prospects.error) throw prospects.error;
  const addressOf = new Map<string, string>();
  const contactRows = (contacts.data ?? []) as { id: string; prospect_id: string; email: string | null }[];
  const prospectRows = (prospects.data ?? []) as { id: string; company_email: string | null }[];
  for (const row of enrolled) {
    const address = row.contact_id ? lower(contactRows.find((contact) => contact.id === row.contact_id)?.email) : lower(prospectRows.find((prospect) => prospect.id === row.prospect_id)?.company_email);
    if (address) addressOf.set(row.id, address);
  }
  const sentEnrollments = new Set(((sends.data ?? []) as { enrollment_id: string; status: string }[]).filter((send) => send.status !== "skipped").map((send) => send.enrollment_id));
  const launched = ((campaigns.data ?? []) as { launched_at: string | null }[]).map((row) => row.launched_at).filter((value): value is string => Boolean(value)).sort();

  const inbox = await readInbox(
    { host: mailbox.imap.host, port: mailbox.imap.port, username: mailbox.connection.username, password: mailbox.connection.password },
    {
      since: new Date(launched[0] ?? now.getTime() - 7 * 24 * 60 * 60 * 1000),
      lastSeenUid: mailbox.imap.lastSeenUid,
      uidValidity: mailbox.imap.uidValidity,
      knownSenders: new Set(addressOf.values()),
      sentTo: new Set([...addressOf.entries()].filter(([enrollmentId]) => sentEnrollments.has(enrollmentId)).map(([, address]) => address)),
    },
    deps,
  );
  if (!inbox.ok) {
    const { error } = await db.from("sender_mailboxes").update({ last_error: `Replies couldn't be read, so nothing was sent. ${inbox.reason}`.slice(0, 500) }).eq("id", mailbox.id);
    if (error) throw error;
    return { ok: false, reason: inbox.reason };
  }

  let replies = 0;
  let bounces = 0;
  for (const message of inbox.messages) {
    if (message.kind === "reply") {
      const result = await ingestInboundEmail({
        from: message.from,
        subject: message.subject,
        text: message.text,
        // Without a Message-ID the mailbox's own id for the message stands in for it.
        messageId: message.messageId ?? `imap:${inbox.uidValidity}:${message.uid}`,
        workspaceId,
      });
      if (result.matched && !result.duplicate) replies += 1;
      continue;
    }
    for (const address of message.failedRecipients) {
      const sent = await latestMessageTo(db, workspaceId, address, enrolled, contactRows, prospectRows);
      if (!sent) continue;
      const { error } = await db.from("messages").update({ status: "failed", failure_reason: "The email bounced." }).eq("id", sent.id).eq("status", "sent");
      if (error) throw error;
      await recordBounce(db, sent, "bounce");
      bounces += 1;
    }
  }

  // Only once everything read has been dealt with: an error above leaves the position
  // where it was, and the next tick reads the same messages again (each is idempotent).
  const { error: positionError } = await db
    .from("sender_mailboxes")
    .update({ last_seen_uid: inbox.lastUid ?? mailbox.imap.lastSeenUid, last_seen_uid_validity: inbox.uidValidity, last_error: null })
    .eq("id", mailbox.id);
  if (positionError) throw positionError;
  return { ok: true, replies, bounces, ignored: inbox.ignored };
}

/** The most recent email this workspace sent to an address, if any. */
async function latestMessageTo(
  db: SupabaseClient,
  workspaceId: string,
  address: string,
  enrolled: { prospect_id: string; contact_id: string | null; recipient: string }[],
  contacts: { id: string; prospect_id: string; email: string | null }[],
  prospects: { id: string; company_email: string | null }[],
): Promise<{ id: string; workspace_id: string; prospect_id: string; contact_id: string | null } | null> {
  const contactIds = contacts.filter((contact) => lower(contact.email) === address).map((contact) => contact.id);
  const prospectIds = [
    ...contacts.filter((contact) => contactIds.includes(contact.id)).map((contact) => contact.prospect_id),
    ...prospects.filter((prospect) => lower(prospect.company_email) === address).map((prospect) => prospect.id),
  ].filter((id) => enrolled.some((row) => row.prospect_id === id));
  if (prospectIds.length === 0) return null;
  const { data, error } = await db
    .from("messages")
    .select("id, workspace_id, prospect_id, contact_id")
    .eq("workspace_id", workspaceId)
    .in("prospect_id", prospectIds)
    .eq("direction", "outbound")
    .eq("channel", "email")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; workspace_id: string; prospect_id: string; contact_id: string | null }[];
  return rows.find((row) => (row.contact_id ? contactIds.includes(row.contact_id) : prospects.some((prospect) => prospect.id === row.prospect_id && lower(prospect.company_email) === address))) ?? null;
}

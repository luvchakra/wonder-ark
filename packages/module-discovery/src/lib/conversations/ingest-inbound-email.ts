import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../db/admin";
import { classifyReply } from "../ai/classify-reply";
import { STOP_REASON, recipientOfMessage, stopEnrollmentsForProspect, suppressAddress } from "../campaigns/stops";
import type { Message } from "../messages/types";

export type InboundEmailPayload = {
  from: string;
  subject?: string | null;
  text: string;
  /** The email's own Message-ID, when the provider gives it. Used to store a redelivered
   * reply once. */
  messageId?: string | null;
  /** Only look in this workspace: the mailbox reader knows whose mailbox it read. */
  workspaceId?: string;
  /**
   * DISC-CAMP-P0-04.2: set by the mailbox reader, with `workspaceId`, when the reply was
   * recognised by the email it answers (its In-Reply-To) rather than by its sender. The
   * reply then belongs to the prospect that email was sent to, whatever address it came
   * from. Never taken from a webhook body.
   */
  answersProspect?: { prospectId: string; contactId: string | null };
};

export type IngestResult =
  | { matched: true; message: Message; duplicate?: boolean }
  | { matched: false; reason: string };

type Sender = { contactId: string | null; workspaceId: string; prospectId: string };

/**
 * DISC-CAMP-P0-04.2: whose reply is this? Several workspaces may hold a contact with
 * the same address, so the first one found is not good enough. The reply belongs to the
 * workspace that most recently sent that address an email. With a single candidate
 * there is nothing to choose. With several and no email sent by any of them, the reply
 * is not attributed to anyone.
 *
 * A campaign may also write to a prospect's general company email, which has no contact
 * row, so those are candidates too.
 */
async function findSender(admin: SupabaseClient, fromEmail: string, workspaceId?: string): Promise<Sender | null> {
  let contactQuery = admin.from("contacts").select("id, workspace_id, prospect_id").ilike("email", fromEmail);
  if (workspaceId) contactQuery = contactQuery.eq("workspace_id", workspaceId);
  const { data: contactData, error: contactError } = await contactQuery.limit(25);
  if (contactError) throw contactError;
  const contacts = (Array.isArray(contactData) ? contactData : contactData ? [contactData] : []) as { id: string; workspace_id: string; prospect_id: string }[];
  const candidates: Sender[] = contacts.map((contact) => ({ contactId: contact.id, workspaceId: contact.workspace_id, prospectId: contact.prospect_id }));

  if (candidates.length === 0) {
    let prospectQuery = admin.from("prospects").select("id, workspace_id").ilike("company_email", fromEmail);
    if (workspaceId) prospectQuery = prospectQuery.eq("workspace_id", workspaceId);
    const { data: prospectData, error: prospectError } = await prospectQuery.limit(25);
    if (prospectError) throw prospectError;
    const prospects = (Array.isArray(prospectData) ? prospectData : prospectData ? [prospectData] : []) as { id: string; workspace_id: string }[];
    candidates.push(...prospects.map((prospect) => ({ contactId: null, workspaceId: prospect.workspace_id, prospectId: prospect.id })));
  }
  if (candidates.length <= 1) return candidates[0] ?? null;

  const { data: latest, error: latestError } = await admin
    .from("messages")
    .select("prospect_id, contact_id, workspace_id")
    .in("prospect_id", candidates.map((candidate) => candidate.prospectId))
    .eq("direction", "outbound")
    .eq("channel", "email")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latest) return null;
  return candidates.find((candidate) => candidate.prospectId === latest.prospect_id && candidate.workspaceId === latest.workspace_id) ?? null;
}

/** The key that makes a redelivered reply recognisable: its Message-ID, or else a hash
 * of who sent it, what it says and the day. */
function inboundKey(payload: InboundEmailPayload, fromEmail: string, now: Date): string {
  const id = payload.messageId?.trim();
  if (id) return `id:${id.slice(0, 400)}`;
  const day = now.toISOString().slice(0, 10);
  return `content:${createHash("sha256").update(`${fromEmail}\u0000${payload.subject ?? ""}\u0000${payload.text}\u0000${day}`).digest("hex")}`;
}

/**
 * Matches an inbound email reply to a contact by "from" address, then appends it to that
 * contact's open (or newly opened) email conversation. There's no automated send
 * integration (lib/messages/mutations.ts) and so no Message-ID/In-Reply-To we control to
 * thread on -- the contact's email address is the only signal available, which is
 * sufficient since a contact has at most one open (non-closed) email conversation at a
 * time.
 *
 * Runs with the admin client (no logged-in user in a webhook request) and does its own
 * tenant resolution via the contact lookup, per lib/supabase/admin.ts's contract.
 *
 * DISC-CAMP-P0-04.1 / 04.2:
 *  - the reply goes to the workspace that last wrote to that address (`findSender`);
 *  - a reply delivered twice is stored once: the second insert meets the unique key and
 *    the row already there is returned;
 *  - any reply stops the prospect's campaign follow-ups;
 *  - a reply classified as asking to unsubscribe puts the address on the business's
 *    opt-out list, so no later email from the business reaches it.
 */
export async function ingestInboundEmail(payload: InboundEmailPayload): Promise<IngestResult> {
  const fromEmail = payload.from.trim().toLowerCase();
  if (!fromEmail) return { matched: false, reason: "Missing sender address." };

  const admin = createAdminClient();

  const sender =
    payload.answersProspect && payload.workspaceId
      ? { contactId: payload.answersProspect.contactId, workspaceId: payload.workspaceId, prospectId: payload.answersProspect.prospectId }
      : await findSender(admin, fromEmail, payload.workspaceId);
  if (!sender) return { matched: false, reason: `No contact found for ${fromEmail}.` };
  const contact = { id: sender.contactId, workspace_id: sender.workspaceId, prospect_id: sender.prospectId };

  const { data: existingConversation, error: findError } = await admin
    .from("conversations")
    .select("*")
    .eq("prospect_id", contact.prospect_id)
    .eq("channel", "email")
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  let conversation = existingConversation;
  if (!conversation) {
    const { data, error } = await admin
      .from("conversations")
      .insert({
        workspace_id: contact.workspace_id,
        prospect_id: contact.prospect_id,
        contact_id: contact.id,
        channel: "email",
      })
      .select()
      .single();
    if (error) throw error;
    conversation = data;
  }

  const key = inboundKey(payload, fromEmail, new Date());
  const content = payload.subject
    ? `Subject: ${payload.subject}\n\n${payload.text}`
    : payload.text;

  const { data: message, error: insertError } = await admin
    .from("messages")
    .insert({
      workspace_id: contact.workspace_id,
      prospect_id: contact.prospect_id,
      contact_id: contact.id,
      conversation_id: conversation.id,
      channel: "email",
      direction: "inbound",
      content,
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: key,
    })
    .select()
    .single();
  if (insertError) {
    // The same reply, delivered again: the unique key refused it. Return the one stored.
    if ((insertError as { code?: string }).code !== "23505") throw insertError;
    const { data: existing, error: existingError } = await admin
      .from("messages")
      .select("*")
      .eq("workspace_id", contact.workspace_id)
      .eq("direction", "inbound")
      .eq("provider_message_id", key)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw insertError;
    return { matched: true, message: existing, duplicate: true };
  }

  const { error: updateError } = await admin
    .from("conversations")
    .update({ status: "replied", last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);
  if (updateError) throw updateError;

  // A reply of any kind ends the campaign's follow-ups to this prospect.
  await stopEnrollmentsForProspect(admin, contact.prospect_id, "replied", STOP_REASON.replied);

  // Best-effort -- an ingested reply is worth keeping even if classification fails (rate
  // limit, model error). The founder can still read it, just without the AI's suggested
  // next step.
  try {
    const classified = await classifyReply(message.id);
    if (classified.classification === "unsubscribe") {
      // They asked to stop: the address goes on the business's opt-out list, which every
      // outreach send checks. The classification only decides that this list is written
      // to; it cannot send, delete or reach another workspace.
      try {
        await suppressAddress(contact.workspace_id, fromEmail, "unsubscribe", admin);
        // Answered from another address: the one that was written to is opted out too.
        if (payload.answersProspect) {
          await suppressAddress(contact.workspace_id, await recipientOfMessage(admin, { contact_id: contact.id, prospect_id: contact.prospect_id }), "unsubscribe", admin);
        }
      } catch (suppressError) {
        console.error("An unsubscribe request could not be added to the opt-out list:", suppressError instanceof Error ? suppressError.message : suppressError);
      }
    }
    return { matched: true, message: classified };
  } catch (error) {
    console.error("Failed to classify inbound reply:", error);
    return { matched: true, message };
  }
}

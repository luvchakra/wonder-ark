import { createClient } from "../../db/server";
import { listMessages } from "../messages/queries";
import { approveMessage } from "../messages/mutations";
import { sendMessage } from "../messages/send";
import { getSenderMailbox, MAILBOX_DAILY_LIMIT_DEFAULT } from "../campaigns/mailbox";

/**
 * DISC-AUTO-P0-03.1: sends a prospect's first email draft without a separate Send press,
 * for a business that turned on "Send automatically". Only an email draft that was never
 * approved or tried (status `draft`): a failed or uncertain send is never retried on its own,
 * and anything else (LinkedIn, WhatsApp) stays for the person. It goes through `sendMessage`,
 * the Send button's own path, so the suppression list, an address marked invalid or risky
 * (which needs the person's confirmation, so it is left for them), the idempotent claim and
 * the audit log all apply, with `automatic: true` on the audit row.
 *
 * At most the mailbox's daily limit (30 unless changed) of emails go out per workspace per
 * UTC day, counting every email sent that day, campaign ones included.
 */
export class DailySendLimitReached extends Error {
  constructor(limit: number) {
    super(`Today's limit of ${limit} emails is reached. Automatic sending carries on tomorrow; you can still send by hand.`);
    this.name = "DailySendLimitReached";
  }
}

export class LeftForPerson extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "LeftForPerson";
  }
}

export async function sentToday(workspaceId: string, now: Date = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("channel", "email")
    .eq("status", "sent")
    .gte("sent_at", start);
  if (error) throw error;
  return count ?? 0;
}

export async function sendFirstEmailAutomatically(workspaceId: string, prospectId: string): Promise<void> {
  const mailbox = await getSenderMailbox(workspaceId);
  const limit = mailbox?.dailyLimit ?? MAILBOX_DAILY_LIMIT_DEFAULT;
  if ((await sentToday(workspaceId)) >= limit) throw new DailySendLimitReached(limit);

  const messages = await listMessages(prospectId);
  // First emails only: once anything was sent to this prospect, a new draft is a follow-up.
  if (messages.some((m) => m.direction !== "inbound" && m.status === "sent")) {
    throw new LeftForPerson("A follow-up waits for you to send.");
  }
  const drafts = messages.filter((m) => m.direction !== "inbound" && !m.conversation_id && m.status === "draft");
  const draft = drafts.find((m) => m.channel === "email");
  if (!draft) {
    throw new LeftForPerson(drafts.length ? "Not an email, so it waits for you to send." : "No email draft to send; it waits for you.");
  }
  await approveMessage(draft.id);
  let sent;
  try {
    sent = await sendMessage(draft.id, { automatic: true });
  } catch (error) {
    // Refused before anything went out (no address, an address to confirm, suppressed):
    // the approved draft waits for the person, and is never tried again on its own.
    throw new LeftForPerson(`${error instanceof Error ? error.message : "Couldn't send"} It waits for you.`);
  }
  // A send that failed is recorded as failed on the message and in the audit log; it is
  // reported, never retried on its own.
  if (sent.status !== "sent") throw new LeftForPerson(`Not sent: ${sent.failure_reason ?? "the send failed"}. It waits for you.`);
}

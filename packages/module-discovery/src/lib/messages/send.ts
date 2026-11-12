import { Resend } from "resend";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { loadMailboxForSending } from "../campaigns/mailbox";
import { OUTCOME_UNKNOWN_REASON, sendViaSmtp, type SendResult, type SmtpDeps } from "../campaigns/smtp";
import { listContacts } from "../contacts/queries";
import { getProspect } from "../prospects/queries";
import { getBusiness, getProduct, getWorkspace } from "../tenancy/queries";
import { getOrCreateConversation, markConversationAwaitingReply } from "../conversations/mutations";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { prepareOutreachEmail } from "@cofounderai/core/privacy/suppression";
import { INVALID_ADDRESS_MESSAGE, emailSendCheck, unconfirmedAddressMessage } from "./email-status";
import type { Message } from "./types";

/** Sends an approved outbound email via Resend and records the real outcome on the
 * message row (docs/prospects-pipeline-redesign-requirements.md R1/R2) -- status
 * becomes the provider's actual result ('sent' or 'failed' with a reason), never a
 * manual self-report. Only the email channel has a send integration; linkedin/whatsapp
 * messages are still marked sent by the founder by hand after delivering them.
 *
 * A message generated from a Resend template (`resend_template_id` set -- see
 * lib/ai/generate-message.ts) sends via Resend's own `template: { id, variables }` API
 * instead of our rendered html/text -- Resend substitutes the variables and applies the
 * template's own subject/from at send time, so `message.subject`/content are display-only
 * for these.
 *
 * DISC-CAMP-P0-02.3 / 02.4:
 *  - **One send per message.** Before the provider is called the message is claimed with
 *    a compare-and-set (`send_claimed_at` set only where it was empty). A second click,
 *    or a second request for the same click, does not get the claim and sends nothing.
 *    The write goes through the person's own session, so RLS (Discovery licensed and
 *    discovery.manage) decides whether they may send at all.
 *  - **Where it goes from.** When the workspace has a verified mailbox the email goes
 *    through it. Without one, it goes through the platform's provider as before.
 *  - **Idempotency.** On the provider path the request carries an idempotency key made of
 *    the message and its attempt number, so a repeat of the same attempt is recognised
 *    by the provider. SMTP has no such key: if the outcome is not known the message is
 *    marked failed with "Outcome unknown" and is never retried here; a person may choose
 *    to send it again.
 *  - **Audit.** The outcome is written to `core.audit_log`, without the address or the
 *    text.
 */
export async function sendMessage(
  messageId: string,
  /** DISC-DATA-P0-04.2: set when the person confirmed sending to an address a lookup
   * marked risky or left unverified. It has no effect on an invalid address. */
  options: { confirmedUnverified?: boolean; smtp?: SmtpDeps } = {},
): Promise<Message> {
  const supabase = await createClient();
  const { data: message, error: fetchError } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .single();
  if (fetchError) throw fetchError;

  if (message.channel !== "email") {
    throw new Error("Automatic sending is only available for the email channel.");
  }
  if (message.status !== "approved" && message.status !== "failed") {
    throw new Error("Approve the message before sending.");
  }

  const prospect = await getProspect(message.prospect_id);
  if (!prospect) throw new Error("Prospect not found.");

  const contacts = await listContacts(message.prospect_id);
  const recipient = message.contact_id
    ? contacts.find((c) => c.id === message.contact_id)
    : contacts.find((c) => c.email);
  const toEmail = recipient?.email ?? null;
  if (!toEmail) {
    throw new Error("No contact email on file -- add a contact with an email before sending.");
  }

  // DISC-DATA-P0-04.2: an address a lookup marked invalid is never sent to; one it marked
  // risky, or could not verify, needs the person's confirmation. Decided here, on the
  // server, whatever the form showed. A contact a person typed has no status and sends
  // as before.
  const check = emailSendCheck(recipient?.email_status);
  if (check === "blocked") throw new Error(INVALID_ADDRESS_MESSAGE);
  if (check === "confirm" && !options.confirmedUnverified) {
    throw new Error(unconfirmedAddressMessage(recipient!.email_status!));
  }

  // A send still in flight (or one whose outcome was never recorded) holds the claim.
  if (message.send_claimed_at) {
    const claimedAt = new Date(message.send_claimed_at).getTime();
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < SEND_CLAIM_STALE_MS) {
      throw new Error("This message is already being sent. Refresh the page to see how it went.");
    }
    // The earlier send never reported back: what happened to it is not known. Say so,
    // and send nothing now; the person can decide to send it again.
    const { data: unknown, error: unknownError } = await supabase
      .from("messages")
      .update({ status: "failed", failure_reason: OUTCOME_UNKNOWN_REASON, send_claimed_at: null })
      .eq("id", messageId)
      .eq("send_claimed_at", message.send_claimed_at)
      .select()
      .maybeSingle();
    if (unknownError) throw unknownError;
    if (!unknown) throw new Error("This message is already being sent. Refresh the page to see how it went.");
    return unknown;
  }

  // DISC-CAMP-P0-02.4: a verified mailbox of the workspace's own carries the email.
  // Reading it needs the service role (a member cannot read the password); the person's
  // right to send is established by the claim below, which goes through their session.
  const mailbox = await loadMailboxForSending(message.workspace_id);
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = mailbox?.fromEmail ?? process.env.RESEND_FROM_EMAIL;
  if (!mailbox && (!apiKey || !fromAddress)) {
    throw new Error(
      "Email sending isn't configured yet -- set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }
  if (!fromAddress) throw new Error("Email sending isn't configured yet.");

  const workspace = await getWorkspace(message.workspace_id);
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const business = product ? await getBusiness(product.business_id) : null;
  const brandName = product?.name ?? business?.name ?? prospect.company_name;
  const websiteUrl = product?.website ?? business?.website ?? null;
  if (!business) throw new Error("This workspace isn't linked to a business, so it can't send email.");

  // PRIV-1: never email someone who opted out of this business's mail -- recorded as a
  // failure with the real reason, not skipped silently or reported as sent.
  const compliance = await prepareOutreachEmail(business.id, toEmail);
  if (compliance.suppressed) {
    const { data, error } = await supabase
      .from("messages")
      .update({ status: "failed", failure_reason: "This contact unsubscribed from your emails, so it wasn't sent." })
      .eq("id", messageId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // The claim: only one request gets it. Compare-and-set on the column being empty,
  // through the person's session, so RLS also decides whether they may send.
  const { data: claimed, error: claimError } = await supabase
    .from("messages")
    .update({ send_claimed_at: new Date().toISOString() })
    .eq("id", messageId)
    .in("status", ["approved", "failed"])
    .is("send_claimed_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error("This message is already being sent, or was sent. Refresh the page to see how it went.");

  const attempt = typeof message.send_attempt === "number" ? message.send_attempt : 0;
  const subject = message.subject ?? `Quick note for ${prospect.company_name}`;
  const via = mailbox ? "mailbox" : "platform";

  let result: SendResult;
  if (mailbox) {
    result = await sendViaSmtp(
      mailbox.connection,
      {
        fromName: mailbox.fromName,
        fromEmail: mailbox.fromEmail,
        to: toEmail,
        subject,
        headers: compliance.headers,
        text: renderEmailText(message.content, compliance.unsubscribeUrl),
        html: renderEmailHtml({
          brandName,
          body: message.content,
          websiteUrl,
          replyToEmail: mailbox.fromEmail,
          unsubscribeUrl: compliance.unsubscribeUrl,
        }),
      },
      options.smtp,
    );
  } else {
    result = await sendViaPlatform(apiKey!, `discovery-message/${messageId}/${attempt}`, {
      from: fromAddress,
      to: toEmail,
      headers: compliance.headers,
      ...(message.resend_template_id
        ? { template: { id: message.resend_template_id, variables: message.template_variables ?? undefined } }
        : {
            subject,
            text: renderEmailText(message.content, compliance.unsubscribeUrl),
            html: renderEmailHtml({
              brandName,
              body: message.content,
              websiteUrl,
              replyToEmail: fromAddress,
              unsubscribeUrl: compliance.unsubscribeUrl,
            }),
          }),
    });
  }

  const audit = async (action: "discovery.message.sent" | "discovery.message.send_failed", reason?: string) => {
    try {
      await writeAuditLog({
        businessId: business.id,
        action,
        entityType: "discovery_message",
        entityId: messageId,
        // What was sent to whom is on the message; the trail keeps neither address nor text.
        after: { via, prospectId: message.prospect_id, contactId: recipient?.id ?? null, ...(reason ? { reason } : {}) },
      });
    } catch (auditError) {
      console.error("Could not record a send in the audit log:", auditError instanceof Error ? auditError.message : auditError);
    }
  };

  if (result.status !== "sent") {
    const { data, error } = await supabase
      .from("messages")
      .update({
        status: "failed",
        failure_reason: result.reason,
        // The claim is released so a person can send again. A definite failure starts a
        // new attempt (a new idempotency key); an unknown outcome on the provider path
        // keeps the attempt, so sending again is recognised as the same request.
        send_claimed_at: null,
        ...(result.status === "failed" || via === "mailbox" ? { send_attempt: attempt + 1 } : {}),
      })
      .eq("id", messageId)
      .select()
      .single();
    if (error) throw error;
    await audit("discovery.message.send_failed", result.status === "unknown" ? "outcome_unknown" : "refused");
    return data;
  }

  const conversation = await getOrCreateConversation(
    message.workspace_id,
    message.prospect_id,
    message.contact_id,
    message.channel,
  );

  const { data, error } = await supabase
    .from("messages")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      conversation_id: conversation.id,
      provider_message_id: result.messageId,
      failure_reason: null,
    })
    .eq("id", messageId)
    .select()
    .single();
  if (error) throw error;

  await markConversationAwaitingReply(conversation.id);
  await audit("discovery.message.sent");
  return data;
}

/** How long a claim with no recorded outcome is taken to mean "still sending". */
const SEND_CLAIM_STALE_MS = 10 * 60 * 1000;

/**
 * The platform's provider, with an idempotency key. Its own rejection is "failed" with
 * its reason, as before; a request that threw says nothing about what the provider did
 * with it, so that is "unknown".
 */
export async function sendViaPlatform(apiKey: string, idempotencyKey: string, payload: Record<string, unknown>): Promise<SendResult> {
  const resend = new Resend(apiKey);
  try {
    const result = await resend.emails.send(payload as unknown as Parameters<typeof resend.emails.send>[0], { idempotencyKey });
    if (result.error) return { status: "failed", reason: result.error.message };
    return { status: "sent", messageId: result.data?.id ?? null };
  } catch {
    return { status: "unknown", reason: OUTCOME_UNKNOWN_REASON };
  }
}

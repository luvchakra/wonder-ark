import { Resend } from "resend";
import { createClient } from "../../db/server";
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
 * for these. */
export async function sendMessage(
  messageId: string,
  /** DISC-DATA-P0-04.2: set when the person confirmed sending to an address a lookup
   * marked risky or left unverified. It has no effect on an invalid address. */
  options: { confirmedUnverified?: boolean } = {},
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

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    throw new Error(
      "Email sending isn't configured yet -- set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }

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

  const resend = new Resend(apiKey);
  const result = message.resend_template_id
    ? await resend.emails.send({
        from: fromAddress,
        to: toEmail,
        headers: compliance.headers,
        template: {
          id: message.resend_template_id,
          variables: message.template_variables ?? undefined,
        },
      })
    : await resend.emails.send({
        from: fromAddress,
        to: toEmail,
        subject: message.subject ?? `Quick note for ${prospect.company_name}`,
        headers: compliance.headers,
        text: renderEmailText(message.content, compliance.unsubscribeUrl),
        html: renderEmailHtml({
          brandName,
          body: message.content,
          websiteUrl,
          replyToEmail: fromAddress,
          unsubscribeUrl: compliance.unsubscribeUrl,
        }),
      });

  if (result.error) {
    const { data, error } = await supabase
      .from("messages")
      .update({ status: "failed", failure_reason: result.error.message })
      .eq("id", messageId)
      .select()
      .single();
    if (error) throw error;
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
      provider_message_id: result.data?.id ?? null,
      failure_reason: null,
    })
    .eq("id", messageId)
    .select()
    .single();
  if (error) throw error;

  await markConversationAwaitingReply(conversation.id);
  return data;
}

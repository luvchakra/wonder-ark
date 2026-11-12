import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { prepareOutreachEmail } from "@cofounderai/core/privacy/suppression";
import { SITE_URL } from "@cofounderai/core/site";
import { loadMailboxForSending } from "../campaigns/mailbox";
import { sendViaSmtp, type SendResult, type SmtpDeps } from "../campaigns/smtp";
import { sendViaPlatform } from "../messages/send";
import { messagingRefusal } from "./rules";

/**
 * DISC-CONS-P0-03.3 / 05.2: every email to a person on an offering's list goes through
 * here, along the existing send path: the workspace's verified mailbox when it has one,
 * otherwise the platform's provider with an idempotency key; the business's opt-out
 * list is checked first (PRIV-1, `prepareOutreachEmail`), and the footer and the
 * List-Unsubscribe headers carry the person's own unsubscribe link.
 *
 * Refused, before anything is sent, when the person has not consented, has unsubscribed,
 * or is on the business's opt-out list (the person is then marked unsubscribed too).
 * The caller has already authorised the request: a signed-in member's session, or the
 * public page's token. Reads here use the service role, scoped to the lead's workspace.
 */

export type LeadForSending = {
  id: string;
  workspace_id: string;
  email: string;
  consent_at: string | null;
  status: string;
  lead_token: string;
};

export type LeadEmailOutcome = { status: "sent" } | { status: "refused"; message: string } | { status: "failed"; message: string };

export function unsubscribeUrlFor(leadToken: string): string {
  return `${SITE_URL}/api/audience/unsubscribe?t=${encodeURIComponent(leadToken)}`;
}

export function answerUrlFor(leadToken: string): string {
  return `${SITE_URL}/p/s/${encodeURIComponent(leadToken)}`;
}

export async function businessForWorkspace(
  workspaceId: string,
  client: SupabaseClient,
): Promise<{ businessId: string; businessName: string; offeringName: string; website: string | null } | null> {
  const { data: workspace } = await client.from("workspaces").select("product_id").eq("id", workspaceId).maybeSingle();
  if (!workspace) return null;
  const { data: product } = await client
    .from("products")
    .select("name, website, business_id")
    .eq("id", workspace.product_id)
    .maybeSingle();
  if (!product) return null;
  const core = createCoreAdminClient({ schema: "core" });
  const { data: business } = await core.from("businesses").select("name, website").eq("id", product.business_id).maybeSingle();
  if (!business) return null;
  return {
    businessId: product.business_id as string,
    businessName: business.name as string,
    offeringName: product.name as string,
    website: (product.website as string | null) ?? (business.website as string | null) ?? null,
  };
}

export async function sendLeadEmail(input: {
  client: SupabaseClient;
  lead: LeadForSending;
  subject: string;
  body: string;
  /** The same key for a repeat of the same email, so the provider sends it once. */
  idempotencyKey: string;
  smtp?: SmtpDeps;
}): Promise<LeadEmailOutcome> {
  const { client, lead } = input;
  const refusal = messagingRefusal(lead);
  if (refusal) return { status: "refused", message: refusal };

  const context = await businessForWorkspace(lead.workspace_id, client);
  if (!context) return { status: "failed", message: "This offering isn't linked to a business, so it can't send email." };

  const core = createCoreAdminClient({ schema: "core" });
  const compliance = await prepareOutreachEmail(context.businessId, lead.email, core);
  if (compliance.suppressed) {
    await client.from("audience_leads").update({ status: "unsubscribed", survey: null }).eq("id", lead.id).eq("workspace_id", lead.workspace_id);
    return { status: "refused", message: "This person unsubscribed from your emails, so it wasn't sent." };
  }

  const unsubscribeUrl = unsubscribeUrlFor(lead.lead_token);
  const headers = { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  const mailbox = await loadMailboxForSending(lead.workspace_id);
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = mailbox?.fromEmail ?? process.env.RESEND_FROM_EMAIL;
  if (!mailbox && (!apiKey || !fromAddress)) {
    return { status: "failed", message: "Needs setup: email sending isn't configured yet." };
  }

  const brandName = context.businessName;
  const text = renderEmailText(input.body, unsubscribeUrl);
  const html = renderEmailHtml({ brandName, body: input.body, websiteUrl: context.website, replyToEmail: fromAddress!, unsubscribeUrl });

  let result: SendResult;
  if (mailbox) {
    result = await sendViaSmtp(
      mailbox.connection,
      { fromName: mailbox.fromName, fromEmail: mailbox.fromEmail, to: lead.email, subject: input.subject, headers, text, html },
      input.smtp,
    );
  } else {
    result = await sendViaPlatform(apiKey!, input.idempotencyKey, { from: fromAddress, to: lead.email, subject: input.subject, headers, text, html });
  }

  const sent = result.status === "sent";
  // The audit trail names the person's record, never the address or the text.
  const { error: auditError } = await core.rpc("append_audit_log", {
    p_business_id: context.businessId,
    p_actor_id: null,
    p_action: sent ? "discovery.audience_email.sent" : "discovery.audience_email.send_failed",
    p_entity_type: "discovery_audience_lead",
    p_entity_id: lead.id,
    p_before: null,
    p_after: { via: mailbox ? "mailbox" : "platform", key: input.idempotencyKey.split("/")[0] },
  });
  if (auditError) console.error("Could not record an audience email in the audit log:", auditError.message);

  if (result.status === "sent") return { status: "sent" };
  if (result.status === "unknown") return { status: "failed", message: "It isn't known whether the email went. It won't be retried." };
  return { status: "failed", message: result.reason };
}

import { EMAIL_NOT_SET_UP, platformSender, sendPlatformEmail } from "@cofounderai/core/email/platform-mailer";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { prepareOutreachEmail } from "@cofounderai/core/privacy/suppression";

/**
 * FND-11 — the investor-outreach delivery adapter (§27.3). Sent through the platform's SMTP
 * mailbox (EMAIL-SMTP-01), with the same email rendering as Discovery's prospect outreach.
 * It reports only what the mail server said: success carries its message id, anything
 * else is a failure with its reason (an unknown outcome included: it may have gone, and is
 * never retried on its own).
 */
export type DeliveryResult = { ok: true; provider: string; messageId: string } | { ok: false; provider: string; reason: string };

export async function deliverInvestorEmail(input: {
  businessId: string;
  to: string;
  subject: string;
  body: string;
  brandName: string;
  websiteUrl: string | null;
}): Promise<DeliveryResult> {
  // EMAIL-SMTP-01: the platform's SMTP mailbox (Platform admin → Keys).
  const from = (await platformSender())?.fromEmail;
  if (!from) {
    return { ok: false, provider: "smtp", reason: EMAIL_NOT_SET_UP };
  }
  // PRIV-1: an investor who opted out of this business's email isn't emailed again.
  const compliance = await prepareOutreachEmail(input.businessId, input.to);
  if (compliance.suppressed) {
    return { ok: false, provider: "smtp", reason: "This investor unsubscribed from your emails, so it wasn't sent." };
  }
  const result = await sendPlatformEmail({
    to: input.to,
    subject: input.subject,
    headers: compliance.headers,
    text: renderEmailText(input.body, compliance.unsubscribeUrl),
    html: renderEmailHtml({
      brandName: input.brandName,
      body: input.body,
      websiteUrl: input.websiteUrl,
      replyToEmail: from,
      unsubscribeUrl: compliance.unsubscribeUrl,
    }),
  });
  if (result.status !== "sent") return { ok: false, provider: "smtp", reason: result.reason };
  return { ok: true, provider: "smtp", messageId: result.messageId ?? "" };
}

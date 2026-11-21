import { Resend } from "resend";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

const NOTIFY_EMAIL = "kunalc.iit@gmail.com";

/**
 * Emails the founder when someone shows interest on the landing page (CoFounderAI UI & CTA
 * Enhancement doc §3). Reuses the same Resend configuration lib/messages/send.ts already
 * sends outbound prospect email through -- no new provider, no new secret, RESEND_API_KEY/
 * RESEND_FROM_EMAIL are already documented in .env.example.
 *
 * Never throws -- a notification failure shouldn't turn into a visitor-facing error when
 * their email was already recorded successfully; it's logged server-side instead so it can
 * be resent by querying interest_signups directly if needed.
 */
export async function notifyInterestSignup(email: string): Promise<void> {
  const apiKey = await platformKey("RESEND_API_KEY");
  const fromAddress = await platformKey("RESEND_FROM_EMAIL");
  if (!apiKey || !fromAddress) {
    console.error(
      `[interest] RESEND_API_KEY/RESEND_FROM_EMAIL not configured -- skipped notification for ${email}`,
    );
    return;
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: fromAddress,
    to: NOTIFY_EMAIL,
    subject: `New ${BRAND_NAME} interest signup`,
    text: `${email} just signed up via the landing page's "Show Interest" form.`,
  });

  if (result.error) {
    console.error("[interest] failed to send notification email:", result.error);
  }
}

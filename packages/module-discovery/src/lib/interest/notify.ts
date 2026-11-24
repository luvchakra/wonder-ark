import { platformSender, sendPlatformEmail } from "@cofounderai/core/email/platform-mailer";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";

const NOTIFY_EMAIL = "kunalc.iit@gmail.com";

/**
 * Emails the founder when someone shows interest on the landing page (CoFounderAI UI & CTA
 * Enhancement doc §3). Sent through the platform's SMTP mailbox (EMAIL-SMTP-01).
 *
 * Never throws -- a notification failure shouldn't turn into a visitor-facing error when
 * their email was already recorded successfully; it's logged server-side instead so it can
 * be resent by querying interest_signups directly if needed.
 */
export async function notifyInterestSignup(email: string): Promise<void> {
  // EMAIL-SMTP-01: the platform's SMTP mailbox (Platform admin → Keys).
  const fromAddress = (await platformSender())?.fromEmail;
  if (!fromAddress) {
    console.error(
      "[interest] the platform's SMTP mailbox isn't set up -- skipped a signup notification",
    );
    return;
  }
  const result = await sendPlatformEmail({
    to: NOTIFY_EMAIL,
    subject: `New ${BRAND_NAME} interest signup`,
    text: `${email} just signed up via the landing page's "Show Interest" form.`,
    html: `<p>${email.replace(/[<>&"']/g, "")} just signed up via the landing page's "Show Interest" form.</p>`,
  });

  if (result.status !== "sent") {
    console.error("[interest] the signup notification email wasn't sent:", result.reason);
  }
}

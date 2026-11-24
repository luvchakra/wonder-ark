import { createAdminClient } from "../db/admin";
import { platformSender, sendPlatformEmail } from "../email/platform-mailer";
import { renderEmailHtml, renderEmailText } from "../email/render";
import { registerEventHandler } from "../events/registry";
import type { DomainEvent } from "../events/types";
import { SITE_URL } from "../site";
import { BRAND_NAME } from "../lib/brand";
import { BILLING_NOTIFICATION_TYPES, type BillingNotificationType } from "./notifications";
import { getLifecyclePolicy } from "./lifecycle-policy";
import { logBilling } from "./observability";

/**
 * BILL-35 -- billing emails, sent by the domain-event drain (§61), to the account owners
 * and admins of the business (the people who manage billing). Sent through the platform's
 * SMTP mailbox (EMAIL-SMTP-01, `email/platform-mailer.ts`), the same sender every other
 * platform email uses. When email isn't configured the event is acknowledged and
 * nothing is sent -- the in-app billing page and bell (BILL-34) still say the same thing.
 * Imported for its side effect from apps/web/app/api/cron/drain-events/route.ts.
 */

type Payload = { plan?: string; amount?: string; date?: string };

const COPY: Record<BillingNotificationType, (p: Payload, business: string, graceDays: number) => { subject: string; body: string }> = {
  "billing.subscription_activated": (p, b) => ({
    subject: `Your ${p.plan ?? ""} plan is active`,
    body: `Your **${p.plan ?? "new"}** plan for ${b} is now active, and the modules it includes are ready to use.`,
  }),
  "billing.subscription_cancelled": (p, b, graceDays) => ({
    subject: `Your ${p.plan ?? ""} plan has ended`,
    body: `The ${p.plan ?? ""} plan for ${b} has ended. Its modules stay readable for ${graceDays} days, and your data is never deleted -- choose a plan anytime to restore full access.`,
  }),
  "billing.cancellation_scheduled": (p, b) => ({
    subject: "Your plan won't renew",
    body: `You cancelled the ${p.plan ?? ""} plan for ${b}. You keep full access until **${p.date ?? "the end of the current period"}**, and there will be no further charges.`,
  }),
  "billing.plan_changed": (p, b) => ({
    subject: `You're now on ${p.plan ?? "a new plan"}`,
    body: `${b} is now on the **${p.plan ?? ""}** plan.`,
  }),
  "billing.plan_change_scheduled": (p, b) => ({
    subject: `Plan change scheduled for ${p.date ?? "your next billing date"}`,
    body: `${b} moves to the **${p.plan ?? ""}** plan on ${p.date ?? "your next billing date"}. Nothing changes until then.`,
  }),
  "billing.payment_succeeded": (p, b) => ({
    subject: `Payment received${p.amount ? `: ${p.amount}` : ""}`,
    body: `We received your payment${p.amount ? ` of **${p.amount}**` : ""} for ${b}'s subscription. Thank you!`,
  }),
  "billing.payment_failed": (p, b) => ({
    subject: "Payment needs attention",
    body: `We couldn't take the latest payment${p.amount ? ` of ${p.amount}` : ""} for ${b}. Your subscription stays active while we retry -- please update your payment method from the billing page.`,
  }),
  "billing.payment_action_required": (_p, b) => ({
    subject: "Please confirm your payment",
    body: `Your bank needs you to confirm the latest payment for ${b}'s subscription. Open the billing page to complete it.`,
  }),
};

async function recipients(businessId: string): Promise<{ emails: string[]; businessName: string; slug: string | null }> {
  const core = createAdminClient({ schema: "core" });
  const { data: business, error } = await core.from("businesses").select("name, account_id").eq("id", businessId).single();
  if (error) throw error;
  const [{ data: members, error: membersError }, { data: settings }] = await Promise.all([
    core.from("account_members").select("user_id").eq("account_id", business.account_id).in("role", ["owner", "admin"]),
    core.from("business_settings").select("slug").eq("business_id", businessId).maybeSingle(),
  ]);
  if (membersError) throw membersError;
  const auth = createAdminClient();
  const emails: string[] = [];
  for (const m of (members ?? []) as { user_id: string }[]) {
    const { data } = await auth.auth.admin.getUserById(m.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return { emails, businessName: business.name as string, slug: (settings?.slug as string | undefined) ?? null };
}

export async function sendBillingEmail(event: DomainEvent): Promise<"sent" | "skipped"> {
  // EMAIL-SMTP-01: through the platform's SMTP mailbox; not set up, skipped.
  const sender = await platformSender();
  if (!sender) return "skipped";
  const type = event.type as BillingNotificationType;
  const { emails, businessName, slug } = await recipients(event.business_id);
  if (emails.length === 0) return "skipped";

  const { featureGraceDays } = await getLifecyclePolicy();
  const { subject, body } = COPY[type](event.payload as Payload, businessName, featureGraceDays);
  const link = slug ? `${SITE_URL}/${slug}/billing` : `${SITE_URL}/dashboard/settings/billing`;
  const fullBody = `${body}\n\nManage your plan: ${link}`;
  // Thrown only when it surely didn't go, so the event's retry can't send it twice.
  const result = await sendPlatformEmail({
    to: emails,
    subject,
    html: renderEmailHtml({ brandName: BRAND_NAME, body: fullBody, websiteUrl: SITE_URL, replyToEmail: sender.fromEmail, platform: true }),
    text: renderEmailText(fullBody),
  });
  if (result.status === "failed") {
    logBilling("billing.notification", { business_id: event.business_id, operation: type, status: "failed", error_code: "smtp_failed" });
    throw new Error(`Billing email failed: ${result.reason}`);
  }
  return "sent";
}

for (const type of BILLING_NOTIFICATION_TYPES) {
  registerEventHandler(type, async (event) => {
    await sendBillingEmail(event);
  });
}

import { platformSender, sendPlatformEmail } from "@cofounderai/core/email/platform-mailer";
import { createAdminClient as createCoreAdmin } from "@cofounderai/core/db/admin";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { createAdminClient as createGstAdmin } from "../../db/admin";
import { parseGstRegistrationProfile } from "../tax-registrations/gst-registration-profile";
import { generateMonthlyPeriods, generateQrmpQuarters, generateFinancialYears, type Period } from "../calendar/periods";
import { gstr1DueDate, gstr3bDueDate, gstr9DueDate, type Gstr1DueDateRuleValue, type Gstr3bDueDateRuleValue, type Gstr9DueDateRuleValue } from "../calendar/due-dates";
import type { ReturnType as GstReturnType } from "../returns/lifecycle/types";
import { pendingReminderLeadDays } from "./schedule";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

/**
 * COMPLY-P0-09.3 (Reminder Engine): the cron entry point -- call this from
 * `apps/web/app/api/cron/send-compliance-reminders/route.ts` on a schedule. Mirrors
 * `module-fsm`'s own `sendDueReminders()` shape exactly (see that file's own docstring,
 * and `gst.filing_reminders_sent`'s own migration comment for why this pattern was
 * reused rather than reinvented): admin clients throughout (no signed-in user in a cron
 * invocation), module-license-gated per business, idempotent via a persisted "already
 * sent" marker, one business's own failure never aborting the rest of the run.
 *
 * Deliberately does NOT reuse `lib/calendar/queries.ts#getFilingCalendar` -- that
 * orchestrator's own `createClient()` is the request-scoped, cookie-based client (RLS as
 * whichever user is signed in), which has no meaning for a cron run that must scan EVERY
 * licensed business's own obligations, not one signed-in user's. The actual DUE-DATE
 * MATH is still fully reused (`../calendar/periods`, `../calendar/due-dates`) -- only the
 * "which businesses, which client" orchestration is written fresh here for the
 * admin-client context, matching `sendDueReminders()`'s own precedent of not forcing one
 * code path to serve both a request and a cron.
 */

const RULE_KEYS = { gstr1: "gstr1_filing_due_dates", gstr3b: "gstr3b_filing_due_dates", gstr9: "gstr9_filing_due_date" } as const;

export async function sendDueComplianceReminders(): Promise<{ sent: number; skipped: number }> {
  const gst = createGstAdmin();
  const core = createCoreAdmin({ schema: "core" });
  const today = new Date().toISOString().slice(0, 10);

  const [rulesRes, registrationsRes] = await Promise.all([
    gst.from("tax_rules").select("rule_key, value").eq("country", "IN").eq("regime", "GST").is("jurisdiction", null).lte("effective_from", today).or(`effective_to.is.null,effective_to.gt.${today}`).order("version", { ascending: false }),
    gst
      .from("tax_registrations")
      .select("business_id, jurisdiction, metadata")
      .eq("country", "IN")
      .eq("regime", "GST")
      .eq("is_primary", true)
      .eq("registration_status", "active"),
  ]);
  if (rulesRes.error) throw rulesRes.error;
  if (registrationsRes.error) throw registrationsRes.error;

  const ruleByKey = new Map<string, Record<string, unknown>>();
  for (const row of rulesRes.data) {
    if (!ruleByKey.has(row.rule_key)) ruleByKey.set(row.rule_key, row.value as Record<string, unknown>);
  }
  const gstr1Rule = ruleByKey.get(RULE_KEYS.gstr1) as Gstr1DueDateRuleValue | undefined;
  const gstr3bRule = ruleByKey.get(RULE_KEYS.gstr3b) as Gstr3bDueDateRuleValue | undefined;
  const gstr9Rule = ruleByKey.get(RULE_KEYS.gstr9) as Gstr9DueDateRuleValue | undefined;

  let sent = 0;
  let skipped = 0;

  for (const registration of registrationsRes.data) {
    const businessId = registration.business_id as string;

    const { data: licensed, error: licenseError } = await core.rpc("has_module", { p_business_id: businessId, p_key: "gst" });
    if (licenseError) throw licenseError;
    if (!licensed) {
      skipped++;
      continue;
    }

    const profile = parseGstRegistrationProfile((registration.metadata as Record<string, unknown>) ?? {});
    const jurisdiction = registration.jurisdiction as string | null;

    const obligations: { returnType: GstReturnType; period: Period; dueDate: string }[] = [];
    const filingPeriods = profile.returnFrequency === "monthly" ? generateMonthlyPeriods(today, 0, 1) : generateQrmpQuarters(today, 0, 1);

    if (gstr1Rule) {
      for (const period of filingPeriods) obligations.push({ returnType: "gstr1", period, dueDate: gstr1DueDate(period.periodEnd, profile.returnFrequency, gstr1Rule) });
    }
    if (gstr3bRule) {
      for (const period of filingPeriods) obligations.push({ returnType: "gstr3b", period, dueDate: gstr3bDueDate(period.periodEnd, profile.returnFrequency, jurisdiction, gstr3bRule) });
    }
    if (gstr9Rule) {
      for (const period of generateFinancialYears(today, 0, 0)) obligations.push({ returnType: "gstr9", period, dueDate: gstr9DueDate(period.periodEnd, gstr9Rule) });
    }

    for (const obligation of obligations) {
      const result = await processObligation(gst, core, businessId, obligation, today);
      sent += result.sent;
      skipped += result.skipped;
    }
  }

  return { sent, skipped };
}

async function processObligation(
  gst: ReturnType<typeof createGstAdmin>,
  core: ReturnType<typeof createCoreAdmin>,
  businessId: string,
  obligation: { returnType: GstReturnType; period: Period; dueDate: string },
  today: string,
): Promise<{ sent: number; skipped: number }> {
  const { data: existingPeriod } = await gst
    .from("return_periods")
    .select("status")
    .eq("business_id", businessId)
    .eq("return_type", obligation.returnType)
    .eq("period_start", obligation.period.periodStart)
    .eq("period_end", obligation.period.periodEnd)
    .maybeSingle();
  if (existingPeriod?.status === "filed") return { sent: 0, skipped: 1 };

  const { data: alreadySent, error: sentError } = await gst
    .from("filing_reminders_sent")
    .select("lead_days")
    .eq("business_id", businessId)
    .eq("return_type", obligation.returnType)
    .eq("period_end", obligation.period.periodEnd);
  if (sentError) throw sentError;

  const pending = pendingReminderLeadDays(
    obligation.dueDate,
    today,
    (alreadySent ?? []).map((r) => r.lead_days as number),
  );
  if (pending.length === 0) return { sent: 0, skipped: 0 };

  const { data: business } = await core.from("businesses").select("name, website").eq("id", businessId).maybeSingle();
  const { data: members } = await core.from("business_members").select("user_id").eq("business_id", businessId).in("role", ["owner", "admin", "accountant"]);
  const userIds = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } = userIds.length ? await core.from("user_profiles").select("email").in("id", userIds) : { data: [] as { email: string | null }[] };
  const emails = (profiles ?? []).map((p) => p.email).filter((e): e is string => Boolean(e));

  let sentCount = 0;
  let skippedCount = 0;

  for (const leadDays of pending) {
    const ok = emails.length > 0 ? await sendReminderEmail(emails, business?.name ?? "Your business", business?.website ?? null, obligation, leadDays) : false;
    if (!ok) {
      skippedCount++;
      continue;
    }
    const { error: insertError } = await gst
      .from("filing_reminders_sent")
      .insert({ business_id: businessId, return_type: obligation.returnType, period_end: obligation.period.periodEnd, lead_days: leadDays });
    // A unique-violation race (two overlapping cron runs) means someone else already
    // recorded this exact reminder -- not a real failure, nothing more to do.
    if (insertError && insertError.code !== "23505") throw insertError;
    sentCount++;
  }

  return { sent: sentCount, skipped: skippedCount };
}

async function sendReminderEmail(
  toEmails: string[],
  brandName: string,
  website: string | null,
  obligation: { returnType: GstReturnType; period: Period; dueDate: string },
  leadDays: number,
): Promise<boolean> {
  // EMAIL-SMTP-01: the platform's SMTP mailbox (Platform admin → Keys).
  const fromAddress = (await platformSender())?.fromEmail;
  // Nothing to send without the mailbox, and a cron run shouldn't throw over missing config.
  if (!fromAddress) return false;

  const returnLabel = obligation.returnType.toUpperCase();
  const daysLabel = leadDays === 0 ? "today" : `in ${leadDays} day${leadDays === 1 ? "" : "s"}`;
  const body = `Your **${returnLabel}** return for the period ${obligation.period.periodStart} to ${obligation.period.periodEnd} is due **${daysLabel}** (${obligation.dueDate}).`;
  const result = await sendPlatformEmail({
    to: toEmails,
    subject: `${returnLabel} filing due ${daysLabel} (${obligation.dueDate})`,
    text: renderEmailText(body),
    html: renderEmailHtml({ brandName, body, websiteUrl: website, replyToEmail: fromAddress }),
  });
  // An unknown outcome is marked as sent, so the next run never sends a second reminder.
  return result.status !== "failed";
}

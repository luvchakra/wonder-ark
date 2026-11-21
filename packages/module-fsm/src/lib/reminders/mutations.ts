import { Resend } from "resend";
import { createAdminClient as createCoreAdmin } from "@cofounderai/core/db/admin";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { createAdminClient as createFsmAdmin } from "../../db/admin";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

const DEFAULT_LEAD_HOURS = 48;
// How far ahead the scan looks for candidate events -- generous enough that no
// business's configured reminder_lead_hours (an unbounded integer column) is ever missed,
// bounded so the query itself stays small regardless of how far out jobs get scheduled.
const HORIZON_HOURS = 24 * 14;

type EventRow = {
  id: string;
  business_id: string;
  kind: "work" | "estimate" | "reminder";
  job_id: string | null;
  opportunity_id: string | null;
  starts_at: string;
  description: string | null;
  status: string;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  customer_reminder_sent_at: string | null;
  internal_reminder_sent_at: string | null;
};

/**
 * The cron entry point for both reminder kinds in one pass (PRD §1.5) -- call this from
 * `apps/web/app/api/cron/send-reminders/route.ts` on a schedule. Runs with the admin
 * client (a cron invocation has no signed-in user, same reasoning as
 * `core/events/drain.ts#drainDomainEvents`), scanning across every business rather than
 * one at a time, and checks `core.has_module()` per event's own business before sending
 * anything -- an unlicensed business's events are silently skipped, same "unlicensed
 * parks/skips rather than errors" treatment `drainDomainEvents` already gives license
 * gaps.
 *
 * Idempotent via `customer_reminder_sent_at`/`internal_reminder_sent_at` (new columns,
 * this story): a re-run (including a Vercel Hobby-plan cron's daily-only cadence
 * re-scanning a window it already covered) never double-sends. No per-employee
 * "notification lead time" exists anywhere in the schema (PRD §1.5 mentions one for
 * internal reminders specifically) -- both reminder kinds use the same business-wide
 * `fsm.settings.reminder_lead_hours` (default 48, matching the PRD's own customer-reminder
 * default) rather than inventing a preference column this story didn't ask for.
 */
export async function sendDueReminders(): Promise<{ internalSent: number; customerSent: number; skipped: number }> {
  const fsm = createFsmAdmin();
  const core = createCoreAdmin({ schema: "core" });
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_HOURS * 60 * 60 * 1000);

  const [eventsRes, settingsRes] = await Promise.all([
    fsm
      .from("events")
      .select(
        "id, business_id, kind, job_id, opportunity_id, starts_at, description, status, arrival_window_start, arrival_window_end, customer_reminder_sent_at, internal_reminder_sent_at",
      )
      .in("kind", ["reminder", "work", "estimate"])
      .not("status", "in", "(cancelled,done)")
      .gt("starts_at", now.toISOString())
      .lte("starts_at", horizon.toISOString()),
    fsm.from("settings").select("business_id, reminder_lead_hours"),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  if (settingsRes.error) throw settingsRes.error;

  const leadHoursByBusiness = new Map(settingsRes.data.map((s) => [s.business_id as string, s.reminder_lead_hours as number]));
  const apiKey = await platformKey("RESEND_API_KEY");
  const fromAddress = await platformKey("RESEND_FROM_EMAIL");
  if (!apiKey || !fromAddress) {
    // Same documented gap every other Resend-sending mutation in this module has --
    // nothing to send without it, and a cron run shouldn't throw over missing config.
    return { internalSent: 0, customerSent: 0, skipped: eventsRes.data.length };
  }
  const resend = new Resend(apiKey);

  let internalSent = 0;
  let customerSent = 0;
  let skipped = 0;
  const licensedCache = new Map<string, boolean>();

  for (const event of eventsRes.data as EventRow[]) {
    const already = event.kind === "reminder" ? event.internal_reminder_sent_at : event.customer_reminder_sent_at;
    if (already) continue;

    const leadHours = leadHoursByBusiness.get(event.business_id) ?? DEFAULT_LEAD_HOURS;
    const dueAt = new Date(new Date(event.starts_at).getTime() - leadHours * 60 * 60 * 1000);
    if (dueAt > now) continue;

    let licensed = licensedCache.get(event.business_id);
    if (licensed === undefined) {
      const { data, error } = await core.rpc("has_module", { p_business_id: event.business_id, p_key: "fsm" });
      if (error) throw error;
      licensed = Boolean(data);
      licensedCache.set(event.business_id, licensed);
    }
    if (!licensed) {
      skipped++;
      continue;
    }

    try {
      if (event.kind === "reminder") {
        const sent = await sendInternalReminder(fsm, core, resend, fromAddress, event);
        if (sent) {
          internalSent++;
          await fsm.from("events").update({ internal_reminder_sent_at: new Date().toISOString() }).eq("id", event.id);
        } else {
          skipped++;
        }
      } else if (event.status === "scheduled") {
        const sent = await sendCustomerReminder(fsm, core, resend, fromAddress, event);
        if (sent) {
          customerSent++;
          await fsm.from("events").update({ customer_reminder_sent_at: new Date().toISOString() }).eq("id", event.id);
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    } catch {
      // One event's failure (no email on file, Resend error, etc.) shouldn't abort the
      // rest of the cron run -- it stays unmarked and is simply retried on the next run.
      skipped++;
    }
  }

  return { internalSent, customerSent, skipped };
}

async function resolveSubjectLabelAndParty(
  fsm: ReturnType<typeof createFsmAdmin>,
  event: EventRow,
): Promise<{ subjectLabel: string; partyId: string; primaryContactId: string | null } | null> {
  if (event.job_id) {
    const { data } = await fsm.from("jobs").select("number, party_id, primary_contact_id").eq("id", event.job_id).maybeSingle();
    if (!data) return null;
    return { subjectLabel: data.number ?? "a job", partyId: data.party_id, primaryContactId: data.primary_contact_id };
  }
  if (event.opportunity_id) {
    const { data } = await fsm.from("opportunities").select("number, party_id, primary_contact_id").eq("id", event.opportunity_id).maybeSingle();
    if (!data) return null;
    return { subjectLabel: data.number ?? "an opportunity", partyId: data.party_id, primaryContactId: data.primary_contact_id };
  }
  return null;
}

async function sendCustomerReminder(
  fsm: ReturnType<typeof createFsmAdmin>,
  core: ReturnType<typeof createCoreAdmin>,
  resend: Resend,
  fromAddress: string,
  event: EventRow,
): Promise<boolean> {
  const subject = await resolveSubjectLabelAndParty(fsm, event);
  if (!subject) return false;

  let toEmail: string | null = null;
  if (subject.primaryContactId) {
    const { data: contact } = await core.from("party_contacts").select("email").eq("id", subject.primaryContactId).maybeSingle();
    toEmail = contact?.email ?? null;
  }
  if (!toEmail) {
    const { data: party } = await core.from("parties").select("email").eq("id", subject.partyId).maybeSingle();
    toEmail = party?.email ?? null;
  }
  if (!toEmail) return false;

  const { data: business } = await core.from("businesses").select("name, website").eq("id", event.business_id).maybeSingle();
  const brandName = business?.name ?? "Your service provider";
  const when = new Date(event.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const arrivalWindow =
    event.arrival_window_start && event.arrival_window_end
      ? `, between ${new Date(event.arrival_window_start).toLocaleTimeString("en-IN", { timeStyle: "short" })} and ${new Date(event.arrival_window_end).toLocaleTimeString("en-IN", { timeStyle: "short" })}`
      : "";

  const result = await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: `Upcoming appointment reminder from ${brandName}`,
    text: renderEmailText(`This is a reminder about your upcoming appointment on ${when}${arrivalWindow}.`),
    html: renderEmailHtml({
      brandName,
      body: `This is a reminder about your **upcoming appointment** on ${when}${arrivalWindow}.`,
      websiteUrl: business?.website ?? null,
      replyToEmail: fromAddress,
    }),
  });
  return !result.error;
}

async function sendInternalReminder(
  fsm: ReturnType<typeof createFsmAdmin>,
  core: ReturnType<typeof createCoreAdmin>,
  resend: Resend,
  fromAddress: string,
  event: EventRow,
): Promise<boolean> {
  const { data: assignees } = await fsm.from("event_assignees").select("employee_id").eq("event_id", event.id);
  if (!assignees || assignees.length === 0) return false;

  const { data: employees } = await core.from("employees").select("id, user_id").in("id", assignees.map((a) => a.employee_id));
  const userIds = (employees ?? []).map((e) => e.user_id).filter((id): id is string => Boolean(id));
  if (userIds.length === 0) return false;

  const { data: profiles } = await core.from("user_profiles").select("email").in("id", userIds);
  const emails = (profiles ?? []).map((p) => p.email).filter((e): e is string => Boolean(e));
  if (emails.length === 0) return false;

  const { data: business } = await core.from("businesses").select("name, website").eq("id", event.business_id).maybeSingle();
  const brandName = business?.name ?? "Your business";
  const when = new Date(event.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const body = event.description ? `Reminder: ${event.description} -- ${when}.` : `Reminder for ${when}.`;

  const result = await resend.emails.send({
    from: fromAddress,
    to: emails,
    subject: `Reminder: ${when}`,
    text: renderEmailText(body),
    html: renderEmailHtml({ brandName, body, websiteUrl: business?.website ?? null, replyToEmail: fromAddress }),
  });
  return !result.error;
}

import { platformSender, sendPlatformEmail } from "@cofounderai/core/email/platform-mailer";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { reserveJobParts } from "../inventory-integration/mutations";
import type { CreateEventInput, RescheduleEventInput } from "./types";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** `unscheduled -> scheduled` for real, now that events actually exist -- jobs/
 * mutations.ts#markJobScheduled documented this exact gap when F-5 landed ("F-6 will
 * additionally drive this transition for real once it starts creating events"). A
 * plain filtered update rather than importing that function's own throw-on-no-match
 * `transition()` helper: this is a best-effort side effect of creating a work event, not
 * a user-initiated action that should surface an error if the job had already moved on
 * (e.g. scheduling a second work event against an already-`in_progress` job is normal,
 * not a failure). */
async function tryAdvanceJobToScheduled(businessId: string, jobId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: "scheduled" })
    .eq("id", jobId)
    .eq("business_id", businessId)
    .eq("status", "unscheduled")
    .select("id");
  if (error) throw error;
  // F-14: reserve the job's own stocked parts the moment it actually becomes scheduled
  // (not on every work event -- a second event against an already-scheduled job would
  // otherwise double-reserve the same lines). Best-effort, same reasoning
  // reserveJobParts documents internally.
  if (data.length > 0) await reserveJobParts(businessId, jobId).catch(() => {});
}

/** `new -> estimate_scheduled` (PRD §4: "schedule an estimate event ... moves to Estimate
 * Scheduled") -- same best-effort-filtered-update reasoning as
 * `tryAdvanceJobToScheduled` above; scheduling a second estimate visit against an
 * opportunity that's already past `new` is normal, not an error. */
async function tryAdvanceOpportunityToEstimateScheduled(businessId: string, opportunityId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "estimate_scheduled" })
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .eq("status", "new");
  if (error) throw error;
}

export async function createEvent(businessId: string, input: CreateEventInput): Promise<string> {
  await requireModule(businessId, "fsm");
  if (!input.jobId && !input.opportunityId) {
    throw new Error("An event must be attached to a job or an opportunity.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      business_id: businessId,
      kind: input.kind,
      job_id: input.jobId || null,
      opportunity_id: input.opportunityId || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt || null,
      all_day: input.allDay ?? false,
      description: input.description?.trim() || null,
      arrival_window_start: input.arrivalWindowStart || null,
      arrival_window_end: input.arrivalWindowEnd || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.assigneeEmployeeIds?.length) {
    const { error: assigneesError } = await supabase
      .from("event_assignees")
      .insert(input.assigneeEmployeeIds.map((employeeId) => ({ business_id: businessId, event_id: data.id, employee_id: employeeId })));
    if (assigneesError) throw assigneesError;
  }

  if (input.kind === "work" && input.jobId) await tryAdvanceJobToScheduled(businessId, input.jobId);
  if (input.kind === "estimate" && input.opportunityId) await tryAdvanceOpportunityToEstimateScheduled(businessId, input.opportunityId);

  return data.id;
}

/** "Drag to reschedule" (PRD §2 Scheduling row, MUST) lands here regardless of whether
 * the drag changed the day, the time, or both -- the calendar UI always knows the
 * event's full new `starts_at` (and `ends_at`, shifted by the same delta) before calling
 * this, so there's one code path for both "moved to a different day" and "moved to a
 * different hour". */
export async function rescheduleEvent(id: string, businessId: string, patch: RescheduleEventInput): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ starts_at: patch.startsAt, ends_at: patch.endsAt ?? null })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
}

export async function updateEventDescription(id: string, businessId: string, description: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ description: description.trim() || null }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

/** Replaces an event's assignee set wholesale -- covers both "drag a card into a
 * different technician's row/column" (reassign) and the create/edit dialog's own
 * multi-select. Two round trips (delete-then-insert), not a single upsert, matching how
 * `estimates/mutations.ts` already replaces charge-line sets on a full save -- there's
 * no partial-update case here that would need finer granularity. */
export async function setEventAssignees(id: string, businessId: string, employeeIds: string[]): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("event_assignees").delete().eq("event_id", id).eq("business_id", businessId);
  if (deleteError) throw deleteError;

  if (employeeIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("event_assignees")
    .insert(employeeIds.map((employeeId) => ({ business_id: businessId, event_id: id, employee_id: employeeId })));
  if (insertError) throw insertError;
}

/** The customer's email for a `work` event's own job or opportunity -- same resolution
 * order `estimates/mutations.ts#resolveRecipientEmail` already established (primary
 * contact first, then the party's own email), just starting from an event instead of an
 * opportunity directly. */
async function resolveEventCustomerEmail(businessId: string, eventId: string): Promise<string> {
  const fsm = await createClient();
  const { data: event, error: eventError } = await fsm
    .from("events")
    .select("job_id, opportunity_id")
    .eq("id", eventId)
    .eq("business_id", businessId)
    .single();
  if (eventError) throw eventError;

  const subject = event.job_id
    ? await fsm.from("jobs").select("party_id, primary_contact_id").eq("id", event.job_id).single()
    : await fsm.from("opportunities").select("party_id, primary_contact_id").eq("id", event.opportunity_id).single();
  if (subject.error) throw subject.error;

  const core = await coreClient();
  if (subject.data.primary_contact_id) {
    const { data: contact } = await core.from("party_contacts").select("email").eq("id", subject.data.primary_contact_id).maybeSingle();
    if (contact?.email) return contact.email;
  }
  const { data: party } = await core.from("parties").select("email").eq("id", subject.data.party_id).maybeSingle();
  if (!party?.email) throw new Error("No email on file for this customer.");
  return party.email;
}

/** "Swipe to Notify the customer 'on the way' (SMS + email)" (PRD §1.8) -- email-only
 * here. No SMS provider exists anywhere in this platform yet (confirmed before building
 * this: no Twilio or equivalent dependency, no phone-sending code) -- adding one is an
 * infrastructure decision (a new external dependency, API keys, per-message cost)
 * bigger than this one action justifies on its own, so it's deferred rather than
 * silently dropped; F-9 (automatic customer reminders, which also needs SMS) will need
 * the same provider decision. Sent through the platform's SMTP mailbox (EMAIL-SMTP-01),
 * same as F-4's `sendEstimate`. Advances `scheduled -> en_route`; safe to call again (a
 * second notify just re-sends the email without erroring). */
/** Best-effort side effect of `notifyOnTheWay()` below -- a failed/unsendable email
 * (no email on file, the SMTP mailbox not set up, or the mail server refusing it)
 * should never block the tech from actually being marked en route, which is
 * the button's own primary, always-expected effect. Same "swallow, don't block the real
 * action" reasoning as `tryAdvanceJobToScheduled()` above, just for an external side
 * effect instead of a DB one. */
async function tryNotifyCustomerOnTheWay(businessId: string, eventId: string): Promise<void> {
  try {
    const toEmail = await resolveEventCustomerEmail(businessId, eventId);

    const core = await coreClient();
    const { data: business } = await core.from("businesses").select("name, website").eq("id", businessId).maybeSingle();
    const brandName = business?.name ?? "Your service provider";

    // EMAIL-SMTP-01: the platform's SMTP mailbox (Platform admin → Keys).
    const fromAddress = (await platformSender())?.fromEmail;
    if (!fromAddress) return;
    const result = await sendPlatformEmail({
      to: toEmail,
      subject: `${brandName} is on the way`,
      text: renderEmailText("Your technician is on the way."),
      html: renderEmailHtml({ brandName, body: "Your technician is **on the way**.", websiteUrl: business?.website ?? null, replyToEmail: fromAddress }),
    });
    if (result.status !== "sent") console.error(`notifyOnTheWay: the notification email wasn't confirmed sent: ${result.reason}`);
  } catch (err) {
    console.error("notifyOnTheWay: could not send the notification email", err);
  }
}

export async function notifyOnTheWay(businessId: string, eventId: string): Promise<void> {
  await requireModule(businessId, "fsm");

  const fsm = await createClient();
  const { error } = await fsm.from("events").update({ status: "en_route" }).eq("id", eventId).eq("business_id", businessId);
  if (error) throw error;

  await tryNotifyCustomerOnTheWay(businessId, eventId);
}

export async function markEventArrived(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ status: "arrived" }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

export async function markEventDone(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ status: "done" }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

export async function cancelEvent(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ status: "cancelled" }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

export async function deleteEvent(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { prepareOutreachEmail } from "@cofounderai/core/privacy/suppression";
import { createAdminClient } from "../../db/admin";
import { emailSendCheck } from "../messages/email-status";
import { getBusiness, getBusinessIdForWorkspace, getProduct, getWorkspace } from "../tenancy/queries";
import { enrolAudience, getCampaignDetail, type CampaignDetail } from "./campaigns";
import { loadMailboxForSending, type SendingMailbox } from "./mailbox";
import { MERGE_FIELD_LABEL, cityOf, renderTemplate, type MergeValues } from "./render";
import { OUTCOME_UNKNOWN_REASON, sendViaSmtp, type SmtpDeps } from "./smtp";
import { STOP_REASON, stopEnrollmentsForProspect } from "./stops";
import { GENERAL_SEGMENT, type Campaign, type CampaignStep, type Enrollment } from "./types";

/**
 * DISC-CAMP-P0-02.2 / 04.1 / 04.3 / 07.2: the tick, the only code that sends a campaign
 * email. It runs with the service role from the cron route and, for a first small
 * batch, straight after Launch.
 *
 * For each active campaign inside its sending hours it takes the enrollments that are
 * due, oldest first, and for each one: checks whether it should stop, checks the
 * address, fills the template, claims the send, sends it through the workspace's
 * mailbox, records what happened and schedules the next step.
 *
 * The rules, every one enforced here or in the claim, not left to the page:
 *  - **Nothing sends without a claim.** `discovery.claim_outreach_send()` is the gate:
 *    it re-reads the licence, the campaign's and the enrollment's status, the mailbox and
 *    the day's count under a lock, and a step already claimed is never claimed again. So
 *    a paused campaign sends nothing, two overlapping ticks send one email, and the
 *    daily limit holds across campaigns.
 *  - **A check that cannot be made means no send.** If the opt-out list, the claim or the
 *    mailbox cannot be read, the enrollment is left due and nothing is sent.
 *  - **Nothing broken is sent.** A template with a field that has no value for this
 *    prospect is not rendered; the step is recorded as skipped with the reason and the
 *    enrollment stops.
 *  - **Unknown is final.** If the outcome of a send is not known, or a claim older than
 *    fifteen minutes never got an outcome, the send is recorded as failed with "Outcome
 *    unknown" and the enrollment stops. It is never retried here.
 *  - **Stops.** A reply, a won or lost outcome, a deleted contact, an address that is
 *    invalid or on the opt-out list each stop the enrollment before anything is sent.
 *  - **Automatic pause.** After 20 sent emails, a campaign whose bounces and complaints
 *    pass 8% is paused with the reason.
 *  - A mailbox that cannot be reached or signed in to pauses the workspace's running
 *    campaigns, with the reason, instead of failing every prospect in turn.
 *
 * It works inside a time budget and leaves the rest due for the next tick.
 */

export const TICK_BUDGET_MS = 45_000;
export const AUTO_PAUSE_MIN_SENDS = 20;
export const AUTO_PAUSE_RATE = 0.08;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A claim this old with no outcome is no longer "another tick still sending". */
export const STALE_CLAIM_MS = 15 * 60 * 1000;
const DUE_BATCH = 200;

export type TickSummary = {
  campaigns: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Left due: the daily limit, a check that could not be made, outside the hours. */
  deferred: number;
  stopped: number;
  completed: number;
  enrolled: number;
  paused: string[];
  outOfTime: boolean;
};

export type TickOptions = {
  now?: Date;
  budgetMs?: number;
  /** Only this campaign: the first batch after Launch. */
  campaignId?: string;
  /** At most this many sends: the first batch after Launch is small. */
  maxSends?: number;
  smtp?: SmtpDeps;
};

/** Whether `now` falls on one of the campaign's days, inside its hours, in its timezone. */
export function inSendWindow(campaign: Pick<Campaign, "send_days" | "send_from_hour" | "send_to_hour" | "timezone">, now: Date): boolean {
  const read = (timeZone: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = read(campaign.timezone);
  } catch {
    parts = read("UTC");
  }
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.find((part) => part.type === "weekday")?.value ?? "") + 1;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return campaign.send_days.includes(weekday) && hour >= campaign.send_from_hour && hour < campaign.send_to_hour;
}

type WorkspaceContext = {
  db: SupabaseClient;
  core: SupabaseClient;
  businessId: string;
  brandName: string;
  offeringName: string;
  businessName: string;
  websiteUrl: string | null;
  mailbox: SendingMailbox;
  now: Date;
  smtp?: SmtpDeps;
};

type EnrollmentOutcome =
  | { kind: "sent" | "failed" | "skipped" | "stopped" | "completed" | "waiting" }
  | { kind: "deferred"; reason: string; stop?: "workspace" | "campaign" }
  | { kind: "mailbox_failed"; reason: string };

async function updateEnrollment(db: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("outreach_enrollments").update(patch).eq("id", id);
  if (error) throw error;
}

const stopEnrollment = (db: SupabaseClient, id: string, status: "replied" | "stopped", reason: string) =>
  updateEnrollment(db, id, { status, stop_reason: reason.slice(0, 200), next_due_at: null });

/** Moves an enrollment on after a step: to the next step when it is due, or completed. */
async function advance(db: SupabaseClient, enrollment: Enrollment, step: CampaignStep, steps: CampaignStep[], now: Date) {
  const next = steps.find((entry) => entry.position === step.position + 1);
  await updateEnrollment(
    db,
    enrollment.id,
    next
      ? { next_step_position: next.position, next_due_at: new Date(now.getTime() + next.delay_days * DAY_MS).toISOString() }
      : { status: "completed", next_step_position: step.position + 1, next_due_at: null },
  );
}

type ClaimRow = { id: string | null; status: string; reason: string | null; created: boolean };

async function claim(db: SupabaseClient, enrollmentId: string, stepId: string, skipReason: string | null): Promise<ClaimRow | null> {
  const { data, error } = await db.rpc("claim_outreach_send", { p_enrollment_id: enrollmentId, p_step_id: stepId, p_skip_reason: skipReason });
  if (error) {
    console.error("A campaign send could not be claimed:", error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | undefined;
  return row ?? null;
}

/** Records a step that must not be sent, with why, and stops the enrollment. */
async function skipAndStop(ctx: WorkspaceContext, enrollment: Enrollment, step: CampaignStep, code: string, reason: string): Promise<EnrollmentOutcome> {
  const row = await claim(ctx.db, enrollment.id, step.id, code);
  if (!row) return { kind: "deferred", reason: "policy_check_failed" };
  if (row.status === "deferred") return deferred(row.reason ?? "deferred");
  await stopEnrollment(ctx.db, enrollment.id, "stopped", reason);
  return { kind: "skipped" };
}

function deferred(reason: string): EnrollmentOutcome {
  const stop = reason === "daily_limit" || reason === "not_licensed" || reason === "mailbox_not_verified" ? "workspace" : reason === "campaign_not_active" ? "campaign" : undefined;
  return { kind: "deferred", reason, stop };
}

async function processEnrollment(ctx: WorkspaceContext, detail: CampaignDetail, enrollment: Enrollment): Promise<EnrollmentOutcome> {
  const { db, now } = ctx;
  const { campaign, steps, templates } = detail;
  const step = steps.find((entry) => entry.position === enrollment.next_step_position);
  if (!step) {
    await updateEnrollment(db, enrollment.id, { status: "completed", next_due_at: null });
    return { kind: "completed" };
  }

  const { data: prospect, error: prospectError } = await db
    .from("prospects")
    .select("id, company_name, industry, location, outcome, company_email")
    .eq("id", enrollment.prospect_id)
    .maybeSingle();
  if (prospectError) throw prospectError;
  if (!prospect) return { kind: "stopped" };
  if (prospect.outcome !== "open") {
    await stopEnrollment(db, enrollment.id, "stopped", `Marked ${prospect.outcome}`);
    return { kind: "stopped" };
  }

  // A reply since they were enrolled stops the follow-ups, however it was recorded.
  const { data: reply, error: replyError } = await db
    .from("messages")
    .select("id")
    .eq("prospect_id", enrollment.prospect_id)
    .eq("direction", "inbound")
    .gte("created_at", enrollment.created_at)
    .limit(1)
    .maybeSingle();
  if (replyError) throw replyError;
  if (reply) {
    await stopEnrollment(db, enrollment.id, "replied", STOP_REASON.replied);
    return { kind: "stopped" };
  }

  // A call, WhatsApp or LinkedIn step is done by a person from a draft; the tick waits.
  if (step.channel !== "email") return { kind: "waiting" };

  let contact: { id: string; email: string | null; first_name: string | null; email_status: string | null } | null = null;
  if (enrollment.recipient === "contact") {
    if (!enrollment.contact_id) {
      await stopEnrollment(db, enrollment.id, "stopped", STOP_REASON.contactDeleted);
      return { kind: "stopped" };
    }
    const { data, error } = await db.from("contacts").select("id, email, first_name, email_status").eq("id", enrollment.contact_id).maybeSingle();
    if (error) throw error;
    contact = data;
    if (!contact) {
      await stopEnrollment(db, enrollment.id, "stopped", STOP_REASON.contactDeleted);
      return { kind: "stopped" };
    }
  }
  const toEmail = (contact ? contact.email : (prospect.company_email as string | null))?.trim();
  if (!toEmail) {
    await stopEnrollment(db, enrollment.id, "stopped", STOP_REASON.noEmail);
    return { kind: "stopped" };
  }

  const check = emailSendCheck(contact?.email_status as Parameters<typeof emailSendCheck>[0]);
  if (check === "blocked") return skipAndStop(ctx, enrollment, step, "invalid_address", STOP_REASON.invalidAddress);
  if (check === "confirm" && !campaign.include_unverified) return skipAndStop(ctx, enrollment, step, "unverified_address", STOP_REASON.unverifiedAddress);

  // The opt-out list, and the unsubscribe link every email carries. If it cannot be
  // read, nothing is sent and the enrollment stays due.
  let compliance: Awaited<ReturnType<typeof prepareOutreachEmail>>;
  try {
    compliance = await prepareOutreachEmail(ctx.businessId, toEmail, ctx.core);
  } catch (error) {
    console.error("The opt-out list could not be checked, so a campaign email was not sent:", error instanceof Error ? error.message : error);
    return { kind: "deferred", reason: "policy_check_failed" };
  }
  if (compliance.suppressed) return skipAndStop(ctx, enrollment, step, "suppressed", STOP_REASON.suppressed);

  const template =
    templates.find((entry) => entry.step_id === step.id && entry.segment === enrollment.segment) ??
    templates.find((entry) => entry.step_id === step.id && entry.segment === GENERAL_SEGMENT);
  if (!template) return skipAndStop(ctx, enrollment, step, "no_message", STOP_REASON.noMessage);

  const values: MergeValues = {
    company: prospect.company_name as string,
    city: cityOf(prospect.location as string | null),
    line_of_work: (prospect.industry as string | null) ?? null,
    first_name: contact?.first_name ?? null,
    offering: ctx.offeringName,
    sender_name: ctx.mailbox.fromName,
    business_name: ctx.businessName,
  };
  const rendered = renderTemplate(template, values);
  if (!rendered.ok) {
    return rendered.reason === "missing_merge_field"
      ? skipAndStop(ctx, enrollment, step, "missing_merge_field", `Not sent: this prospect has no value for ${rendered.missing.map((field) => MERGE_FIELD_LABEL[field]).join(", ")}`)
      : skipAndStop(ctx, enrollment, step, "invalid_template", "Not sent: the step's text has a merge field that can't be filled");
  }

  const row = await claim(db, enrollment.id, step.id, null);
  if (!row) return { kind: "deferred", reason: "policy_check_failed" };
  if (row.status === "deferred") return deferred(row.reason ?? "deferred");
  if (!row.created) {
    // Claimed by an earlier or an overlapping tick: this one sends nothing for it.
    if (row.status === "requested") {
      const { data: existing, error: readError } = await db.from("outreach_sends").select("claimed_at").eq("id", row.id).maybeSingle();
      if (readError) throw readError;
      const age = existing?.claimed_at ? now.getTime() - new Date(existing.claimed_at as string).getTime() : 0;
      // A recent claim is another tick still sending: leave it alone.
      if (!(age > STALE_CLAIM_MS)) return { kind: "deferred", reason: "in_flight" };
      // An old claim with no outcome is a send whose outcome is not known. It is closed
      // as such and never sent again.
      const { error } = await db.from("outreach_sends").update({ status: "failed", reason: "Outcome unknown" }).eq("id", row.id).eq("status", "requested");
      if (error) throw error;
      await stopEnrollment(db, enrollment.id, "stopped", STOP_REASON.outcomeUnknown);
      return { kind: "failed" };
    }
    // The outcome was recorded but the enrollment was not moved on.
    if (row.status === "sent") await advance(db, enrollment, step, steps, now);
    else await stopEnrollment(db, enrollment.id, "stopped", "A step could not be sent");
    return { kind: "stopped" };
  }

  const finish = async (status: "sent" | "failed", reason: string | null, messageId: string | null) => {
    const { error } = await db.from("outreach_sends").update({ status, reason, message_id: messageId }).eq("id", row.id);
    if (error) throw error;
  };

  const { data: message, error: messageError } = await db
    .from("messages")
    .insert({
      workspace_id: enrollment.workspace_id,
      prospect_id: enrollment.prospect_id,
      contact_id: contact?.id ?? null,
      channel: "email",
      direction: "outbound",
      subject: rendered.subject,
      content: rendered.body,
      status: "approved",
      send_claimed_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (messageError || !message) {
    // Nothing was sent. The claim is closed as failed so the step is not left open.
    await finish("failed", "The message could not be recorded, so it was not sent", null);
    await stopEnrollment(db, enrollment.id, "stopped", "A step could not be sent");
    return { kind: "failed" };
  }

  const result = await sendViaSmtp(
    ctx.mailbox.connection,
    {
      fromName: ctx.mailbox.fromName,
      fromEmail: ctx.mailbox.fromEmail,
      to: toEmail,
      subject: rendered.subject,
      headers: compliance.headers,
      text: renderEmailText(rendered.body, compliance.unsubscribeUrl),
      html: renderEmailHtml({
        brandName: ctx.brandName,
        body: rendered.body,
        websiteUrl: ctx.websiteUrl,
        replyToEmail: ctx.mailbox.fromEmail,
        unsubscribeUrl: compliance.unsubscribeUrl,
      }),
    },
    ctx.smtp,
  );

  if (result.status === "sent") {
    const conversationId = await openConversation(db, enrollment, contact?.id ?? null, now);
    const { error } = await db
      .from("messages")
      .update({ status: "sent", sent_at: now.toISOString(), provider_message_id: result.messageId, conversation_id: conversationId, failure_reason: null })
      .eq("id", message.id);
    if (error) throw error;
    await finish("sent", null, message.id as string);
    await advance(db, enrollment, step, steps, now);
    return { kind: "sent" };
  }

  const reason = result.status === "unknown" ? OUTCOME_UNKNOWN_REASON : result.reason;
  const { error: failError } = await db.from("messages").update({ status: "failed", failure_reason: reason, send_claimed_at: null }).eq("id", message.id);
  if (failError) throw failError;
  await finish("failed", result.status === "unknown" ? "Outcome unknown" : reason.slice(0, 200), message.id as string);
  await stopEnrollment(db, enrollment.id, "stopped", result.status === "unknown" ? STOP_REASON.outcomeUnknown : "A step could not be sent");
  if (result.status === "failed" && result.mailbox) return { kind: "mailbox_failed", reason: result.reason };
  return { kind: "failed" };
}

/** The prospect's open email conversation, or a new one, marked as awaiting a reply. */
async function openConversation(db: SupabaseClient, enrollment: Enrollment, contactId: string | null, now: Date): Promise<string> {
  const { data: existing, error } = await db
    .from("conversations")
    .select("id")
    .eq("prospect_id", enrollment.prospect_id)
    .eq("channel", "email")
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    const { error: updateError } = await db.from("conversations").update({ status: "awaiting_reply", last_message_at: now.toISOString() }).eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id as string;
  }
  const { data: created, error: createError } = await db
    .from("conversations")
    .insert({ workspace_id: enrollment.workspace_id, prospect_id: enrollment.prospect_id, contact_id: contactId, channel: "email", status: "awaiting_reply", last_message_at: now.toISOString() })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id as string;
}

/** Pauses a campaign for a reason the page will show. Only an active one. */
async function pause(db: SupabaseClient, campaignId: string, reason: string): Promise<boolean> {
  const { data, error } = await db
    .from("outreach_campaigns")
    .update({ status: "paused", pause_reason: reason.slice(0, 300) })
    .eq("id", campaignId)
    .eq("status", "active")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * DISC-CAMP-P0-04.3: after 20 sent emails, a campaign whose bounces and complaints pass
 * 8% of them is paused, with the numbers in the reason. Returns whether it paused.
 */
export async function pauseIfBouncing(db: SupabaseClient, campaignId: string): Promise<boolean> {
  const { data, error } = await db.from("outreach_sends").select("status, bounced_at").eq("campaign_id", campaignId).eq("status", "sent");
  if (error) throw error;
  const sent = (data ?? []).length;
  const bounced = (data ?? []).filter((row) => row.bounced_at !== null && row.bounced_at !== undefined).length;
  if (sent < AUTO_PAUSE_MIN_SENDS || bounced / sent <= AUTO_PAUSE_RATE) return false;
  return pause(db, campaignId, `Paused automatically: ${bounced} of ${sent} emails bounced or were reported as unwanted (more than ${Math.round(AUTO_PAUSE_RATE * 100)}%).`);
}

export async function runCampaignTick(options: TickOptions = {}): Promise<TickSummary> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? TICK_BUDGET_MS;
  const db = createAdminClient();
  const summary: TickSummary = { campaigns: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, stopped: 0, completed: 0, enrolled: 0, paused: [], outOfTime: false };
  const outOfTime = () => Date.now() - startedAt > budgetMs;
  const sendsLeft = () => (options.maxSends === undefined ? Infinity : options.maxSends - summary.sent);

  let query = db.from("outreach_campaigns").select("id, workspace_id").eq("status", "active").order("launched_at");
  if (options.campaignId) query = query.eq("id", options.campaignId);
  const { data: active, error } = await query;
  if (error) throw error;

  const byWorkspace = new Map<string, string[]>();
  for (const row of (active ?? []) as { id: string; workspace_id: string }[]) {
    byWorkspace.set(row.workspace_id, [...(byWorkspace.get(row.workspace_id) ?? []), row.id]);
  }

  workspaces: for (const [workspaceId, campaignIds] of byWorkspace) {
    if (outOfTime()) break;
    try {
      const businessId = await getBusinessIdForWorkspace(workspaceId, db);
      if (!businessId) continue;
      const core = createCoreAdminClient({ schema: "core" });

      const details: CampaignDetail[] = [];
      for (const campaignId of campaignIds) {
        const detail = await getCampaignDetail(campaignId, db);
        if (!detail || detail.campaign.status !== "active") continue;
        summary.campaigns += 1;
        // DISC-CAMP-P0-07.2: prospects that became eligible since launch join a campaign
        // that asks for it, by the same rule and with the same counted reasons.
        if (detail.campaign.auto_enroll) {
          try {
            summary.enrolled += (await enrolAudience(detail, { discovery: db, core, businessId }, now)).enrolled;
          } catch (enrolError) {
            console.error("New prospects could not be added to a campaign:", enrolError instanceof Error ? enrolError.message : enrolError);
          }
        }
        if (inSendWindow(detail.campaign, now)) details.push(detail);
      }
      if (details.length === 0) continue;

      const due = new Map<string, Enrollment[]>();
      for (const detail of details) {
        const { data, error: dueError } = await db
          .from("outreach_enrollments")
          .select("*")
          .eq("campaign_id", detail.campaign.id)
          .eq("status", "active")
          .lte("next_due_at", now.toISOString())
          .order("next_due_at")
          .limit(DUE_BATCH);
        if (dueError) throw dueError;
        due.set(detail.campaign.id, (data ?? []) as Enrollment[]);
      }
      const dueCount = [...due.values()].reduce((total, list) => total + list.length, 0);
      if (dueCount === 0) continue;

      // No verified mailbox: the claim would refuse every send, so none is attempted.
      const mailbox = await loadMailboxForSending(workspaceId, db);
      if (!mailbox) {
        summary.deferred += dueCount;
        continue;
      }
      const workspace = await getWorkspace(workspaceId, db);
      const product = workspace ? await getProduct(workspace.product_id, db) : null;
      const business = product ? await getBusiness(product.business_id, db) : null;
      if (!product || !business) {
        summary.deferred += dueCount;
        continue;
      }
      const ctx: WorkspaceContext = {
        db,
        core,
        businessId,
        brandName: product.name ?? business.name,
        offeringName: product.name,
        businessName: business.name,
        websiteUrl: product.website ?? business.website ?? null,
        mailbox,
        now,
        smtp: options.smtp,
      };

      for (const detail of details) {
        for (const enrollment of due.get(detail.campaign.id) ?? []) {
          if (outOfTime()) {
            summary.outOfTime = true;
            break workspaces;
          }
          if (sendsLeft() <= 0) break workspaces;
          const outcome = await processEnrollment(ctx, detail, enrollment);
          if (outcome.kind === "mailbox_failed") {
            summary.failed += 1;
            // The mailbox itself failed: every other send would too. Pause, and say why.
            const { error: mailboxError } = await db.from("sender_mailboxes").update({ status: "failed", last_error: outcome.reason.slice(0, 500) }).eq("id", mailbox.id);
            if (mailboxError) throw mailboxError;
            for (const campaignId of campaignIds) {
              if (await pause(db, campaignId, `Paused automatically: the mailbox couldn't send. ${outcome.reason}`)) summary.paused.push(campaignId);
            }
            continue workspaces;
          }
          if (outcome.kind === "deferred") {
            summary.deferred += 1;
            if (outcome.stop === "workspace") continue workspaces;
            if (outcome.stop === "campaign") break;
            continue;
          }
          if (outcome.kind === "waiting") continue;
          summary[outcome.kind] += 1;
        }
        if (await pauseIfBouncing(db, detail.campaign.id)) summary.paused.push(detail.campaign.id);
      }
    } catch (workspaceError) {
      // One workspace's failure must not stop the others. Nothing was sent past the error.
      console.error("A campaign tick failed for a workspace:", workspaceError instanceof Error ? workspaceError.message : workspaceError);
    }
  }
  if (outOfTime()) summary.outOfTime = true;
  return summary;
}

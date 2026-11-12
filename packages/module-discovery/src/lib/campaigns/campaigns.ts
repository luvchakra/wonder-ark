import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { getBusinessIdForWorkspace, getProduct, getWorkspace } from "../tenancy/queries";
import { lineOfWorkOf, segmentsFor, selectAudience, type AudienceContact, type AudienceProspect, type Enrolee } from "./audience";
import { MAILBOX_DAILY_LIMIT_MAX, getSenderMailbox } from "./mailbox";
import { templateProblem } from "./render";
import {
  GENERAL_SEGMENT,
  MAX_FOLLOW_UP_DAYS,
  MAX_STEPS,
  MIN_FOLLOW_UP_DAYS,
  STARTING_STEPS,
  TASK_STEPS_AVAILABLE,
  type Campaign,
  type CampaignAudience,
  type CampaignStep,
  type CampaignTemplate,
  type EnrollmentSummary,
  type LeftOutReason,
  type StepChannel,
  type StepPurpose,
} from "./types";

/**
 * DISC-CAMP-P0-02.1 / 05.1: a campaign's life before and around sending: creating it,
 * changing it, enrolling its audience, launching, pausing and resuming it.
 *
 * What this code decides:
 *  - every action is a licensed member with discovery.manage (checked here; RLS and the
 *    table triggers check again on the write);
 *  - Activate is the opt-in. It is refused without a confirmed preview, a verified mailbox ("Needs setup"),
 *    without text for every email step, or with nobody to write to. The database
 *    refuses it too without a verified mailbox;
 *  - enrolment is `selectAudience`: deterministic, with a counted reason for everyone
 *    left out, stored on the campaign so the page can show it;
 *  - a new campaign starts as structure only: its name, the starting steps and the
 *    workspace's timezone. No message text is written until the person asks for it.
 */

export async function authoriseCampaigns(workspaceId: string): Promise<string> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, "discovery.manage");
  return businessId;
}

export async function listCampaigns(workspaceId: string): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Campaign[];
}

export type CampaignWithCounts = Campaign & { enrolled: number; sent: number; replied: number };

/** The workspace's campaigns with the three counts the list shows, each a count of rows. */
export async function listCampaignsWithCounts(workspaceId: string): Promise<CampaignWithCounts[]> {
  const campaigns = await listCampaigns(workspaceId);
  if (campaigns.length === 0) return [];
  const supabase = await createClient();
  const [enrollments, sends] = await Promise.all([
    supabase.from("outreach_enrollments").select("campaign_id, status").eq("workspace_id", workspaceId),
    supabase.from("outreach_sends").select("campaign_id, status").eq("workspace_id", workspaceId).eq("status", "sent"),
  ]);
  if (enrollments.error) throw enrollments.error;
  if (sends.error) throw sends.error;
  const count = (rows: { campaign_id: string }[], id: string) => rows.filter((row) => row.campaign_id === id).length;
  const enrolled = (enrollments.data ?? []) as { campaign_id: string; status: string }[];
  return campaigns.map((campaign) => ({
    ...campaign,
    enrolled: count(enrolled, campaign.id),
    sent: count((sends.data ?? []) as { campaign_id: string }[], campaign.id),
    replied: count(enrolled.filter((row) => row.status === "replied"), campaign.id),
  }));
}

export type CampaignDetail = { campaign: Campaign; steps: CampaignStep[]; templates: CampaignTemplate[] };

export async function getCampaignDetail(campaignId: string, client?: SupabaseClient): Promise<CampaignDetail | null> {
  const supabase = client ?? (await createClient());
  const { data: campaign, error } = await supabase.from("outreach_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (error) throw error;
  if (!campaign) return null;
  const [steps, templates] = await Promise.all([
    supabase.from("outreach_campaign_steps").select("*").eq("campaign_id", campaignId).order("position"),
    supabase.from("outreach_templates").select("*").eq("campaign_id", campaignId),
  ]);
  if (steps.error) throw steps.error;
  if (templates.error) throw templates.error;
  return { campaign: campaign as Campaign, steps: (steps.data ?? []) as CampaignStep[], templates: (templates.data ?? []) as CampaignTemplate[] };
}

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * "New campaign": a draft with everything it can take from the workspace's own data: a
 * name from the offering and today's date, the business's timezone, whether the
 * workspace marks prospects qualified, and the starting three-email structure. Nothing
 * is written and nobody is enrolled.
 */
export async function createCampaign(workspaceId: string): Promise<string> {
  const businessId = await authoriseCampaigns(workspaceId);
  const supabase = await createClient();
  const workspace = await getWorkspace(workspaceId);
  const product = workspace ? await getProduct(workspace.product_id) : null;

  const core = await createCoreClient({ schema: "core" });
  const { data: settings } = await core.from("business_settings").select("timezone").eq("business_id", businessId).maybeSingle();
  const { count: qualified, error: countError } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "qualified");
  if (countError) throw countError;

  const { data: campaign, error } = await supabase
    .from("outreach_campaigns")
    .insert({
      workspace_id: workspaceId,
      status: "draft",
      name: `${product?.name ?? "Campaign"}, ${DATE.format(new Date())}`.slice(0, 120),
      timezone: typeof settings?.timezone === "string" && settings.timezone ? settings.timezone : "UTC",
      audience: { onlyQualified: (qualified ?? 0) > 0 } satisfies CampaignAudience,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: stepsError } = await supabase
    .from("outreach_campaign_steps")
    .insert(STARTING_STEPS.map((step) => ({ ...step, campaign_id: campaign.id, workspace_id: workspaceId })));
  if (stepsError) throw stepsError;
  return campaign.id as string;
}

export type CampaignSettingsInput = {
  name?: string;
  audience?: CampaignAudience;
  sendDays?: number[];
  sendFromHour?: number;
  sendToHour?: number;
  /** DISC-CAMP-P0-05.4: emails a day for this campaign. Null uses the mailbox's limit. */
  dailyLimit?: number | null;
  autoEnroll?: boolean;
  includeUnverified?: boolean;
  personalOpening?: boolean;
};

export type CampaignChange = { status: "saved" } | { status: "refused"; message: string };

async function loadForChange(campaignId: string): Promise<CampaignDetail> {
  const detail = await getCampaignDetail(campaignId);
  if (!detail) throw new Error("Campaign not found.");
  await authoriseCampaigns(detail.campaign.workspace_id);
  return detail;
}

export async function updateCampaignSettings(campaignId: string, input: CampaignSettingsInput): Promise<CampaignChange> {
  const { campaign } = await loadForChange(campaignId);
  if (campaign.status === "completed") return { status: "refused", message: "A finished campaign can't be changed." };
  // DISC-CAMP-P0-05.4: who is enrolled and when emails go out change only while nothing
  // is being sent. (Each such change also clears the preview's confirmation, in the
  // database.) The name is not part of what is sent and can change at any time.
  const beyondName = Object.entries(input).some(([key, value]) => key !== "name" && value !== undefined);
  if (campaign.status === "active" && beyondName) {
    return { status: "refused", message: "Pause the campaign to change who is enrolled or when emails go out." };
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 120);
    if (!name) return { status: "refused", message: "Give the campaign a name." };
    patch.name = name;
  }
  if (input.audience !== undefined) {
    const minFit = input.audience.minFitScore;
    patch.audience = {
      onlyQualified: input.audience.onlyQualified !== false,
      linesOfWork: (input.audience.linesOfWork ?? []).map(lineOfWorkOf).filter((line) => line !== GENERAL_SEGMENT).slice(0, 50),
      minFitScore: typeof minFit === "number" && Number.isFinite(minFit) ? Math.max(0, Math.min(100, Math.round(minFit))) : null,
    } satisfies CampaignAudience;
  }
  if (input.sendDays !== undefined) {
    const days = [...new Set(input.sendDays.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort();
    if (days.length === 0) return { status: "refused", message: "Choose at least one day to send on." };
    patch.send_days = days;
  }
  const from = input.sendFromHour ?? campaign.send_from_hour;
  const to = input.sendToHour ?? campaign.send_to_hour;
  if (input.sendFromHour !== undefined || input.sendToHour !== undefined) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > 24 || to <= from) {
      return { status: "refused", message: "The sending hours must end after they start." };
    }
    patch.send_from_hour = from;
    patch.send_to_hour = to;
  }
  if (input.dailyLimit !== undefined) {
    if (input.dailyLimit === null) {
      patch.daily_limit = null;
    } else {
      const mailbox = await getSenderMailbox(campaign.workspace_id);
      const most = mailbox?.dailyLimit ?? MAILBOX_DAILY_LIMIT_MAX;
      if (!Number.isInteger(input.dailyLimit) || input.dailyLimit < 1 || input.dailyLimit > most) {
        return { status: "refused", message: `Emails a day for this campaign is between 1 and ${most}, the mailbox's limit. Leave it blank to use the mailbox's limit.` };
      }
      patch.daily_limit = input.dailyLimit;
    }
  }
  if (input.autoEnroll !== undefined) patch.auto_enroll = input.autoEnroll;
  if (input.includeUnverified !== undefined) patch.include_unverified = input.includeUnverified;
  if (input.personalOpening !== undefined) patch.personal_opening = input.personalOpening;
  if (Object.keys(patch).length === 0) return { status: "saved" };

  const supabase = await createClient();
  const { error } = await supabase.from("outreach_campaigns").update(patch).eq("id", campaignId);
  if (error) throw error;
  return { status: "saved" };
}

export type StepInput = { channel: StepChannel; delayDays: number };

const PURPOSE_OF = (channel: StepChannel, index: number, total: number): StepPurpose =>
  channel === "call" ? "call" : index === 0 ? "intro" : index === total - 1 && total > 2 ? "last_note" : "follow_up";

/**
 * DISC-CAMP-P0-05.4: sets how many emails the sequence has (1 to 5) and the days between
 * them (1 to 30). Only while the campaign is a draft or paused: nothing changes under a
 * campaign that is sending. A step keeps its text when it stays; a new step has none, so
 * its message must be written before the campaign can be previewed.
 *
 * The rule for removing a step, chosen for being the simple safe one: a step that has
 * already been sent to anyone cannot be removed. Its send records would go with it, and
 * people who received it would have no trace of it. Steps nobody has reached yet can be
 * removed or added freely while paused; a prospect who had finished the sequence is not
 * reopened by a step added afterwards.
 */
export async function replaceCampaignSteps(campaignId: string, steps: StepInput[]): Promise<CampaignChange> {
  const { campaign, steps: existing } = await loadForChange(campaignId);
  if (campaign.status !== "draft" && campaign.status !== "paused") {
    return { status: "refused", message: campaign.status === "active" ? "Pause the campaign to change its steps." : "A finished campaign can't be changed." };
  }
  if (steps.length < 1 || steps.length > MAX_STEPS) return { status: "refused", message: `A campaign has between 1 and ${MAX_STEPS} steps.` };
  if (steps[0]!.channel !== "email") return { status: "refused", message: "The first step is an email." };
  // DISC-CAMP-P0-06.1 is not built: a call, WhatsApp or LinkedIn step would wait for a
  // person with no screen to do it from, and hold every enrollment behind it.
  if (!TASK_STEPS_AVAILABLE && steps.some((step) => step.channel !== "email")) {
    return { status: "refused", message: "Only email steps are available for now." };
  }
  for (const [index, step] of steps.entries()) {
    if (index > 0 && (!Number.isInteger(step.delayDays) || step.delayDays < MIN_FOLLOW_UP_DAYS || step.delayDays > MAX_FOLLOW_UP_DAYS)) {
      return { status: "refused", message: `Each later step waits between ${MIN_FOLLOW_UP_DAYS} and ${MAX_FOLLOW_UP_DAYS} days after the one before.` };
    }
  }

  const supabase = await createClient();
  // A step keeps its row (and its text) when its position and channel are unchanged.
  const keep = new Map(existing.map((step) => [step.position, step]));
  const wanted = steps.map((step, index) => ({
    position: index + 1,
    channel: step.channel,
    delay_days: index === 0 ? 0 : step.delayDays,
    purpose: PURPOSE_OF(step.channel, index, steps.length),
  }));
  const removed = existing.filter((step) => {
    const next = wanted.find((entry) => entry.position === step.position);
    return !next || next.channel !== step.channel;
  });
  if (removed.length > 0) {
    const { data: sent, error: sentError } = await supabase.from("outreach_sends").select("step_id").in("step_id", removed.map((step) => step.id)).limit(1);
    if (sentError) throw sentError;
    if ((sent ?? []).length > 0) {
      const step = removed.find((entry) => entry.id === (sent![0] as { step_id: string }).step_id) ?? removed[0]!;
      return { status: "refused", message: `Step ${step.position} has already been sent to someone, so it can't be removed.` };
    }
    const { error } = await supabase.from("outreach_campaign_steps").delete().in("id", removed.map((step) => step.id));
    if (error) throw error;
  }
  for (const entry of wanted) {
    const current = keep.get(entry.position);
    if (current && current.channel === entry.channel) {
      if (current.delay_days === entry.delay_days && current.purpose === entry.purpose) continue;
      const { error } = await supabase.from("outreach_campaign_steps").update({ delay_days: entry.delay_days, purpose: entry.purpose }).eq("id", current.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("outreach_campaign_steps").insert({ ...entry, campaign_id: campaignId, workspace_id: campaign.workspace_id });
      if (error) throw error;
    }
  }
  return { status: "saved" };
}

/** A person's edit of a step's text. It may use only the listed merge fields. An edit of
 * AI-written text is labelled as such from then on. */
export async function saveCampaignTemplate(templateId: string, input: { subject: string; body: string }): Promise<CampaignChange> {
  const supabase = await createClient();
  const { data: template, error } = await supabase.from("outreach_templates").select("*").eq("id", templateId).maybeSingle();
  if (error) throw error;
  if (!template) throw new Error("Message not found.");
  await authoriseCampaigns((template as CampaignTemplate).workspace_id);
  // A running campaign sends the text people previewed. To change it, pause first; the
  // change then needs a new preview before the campaign can resume.
  const { data: owner, error: ownerError } = await supabase.from("outreach_campaigns").select("status").eq("id", (template as CampaignTemplate).campaign_id).maybeSingle();
  if (ownerError) throw ownerError;
  if (owner?.status !== "draft" && owner?.status !== "paused") {
    return { status: "refused", message: owner?.status === "active" ? "Pause the campaign to change its messages." : "A finished campaign can't be changed." };
  }

  const subject = input.subject.replace(/\s+/g, " ").trim().slice(0, 200);
  const body = input.body.trim().slice(0, 5000);
  if (!subject || !body) return { status: "refused", message: "A message needs a subject and some text." };
  const problem = templateProblem(subject, body);
  if (problem) return { status: "refused", message: problem };

  const origin = (template as CampaignTemplate).origin === "user_provided" ? "user_provided" : "user_modified";
  const { error: saveError } = await supabase.from("outreach_templates").update({ subject, body, origin }).eq("id", templateId);
  if (saveError) throw saveError;
  return { status: "saved" };
}

export type AudiencePreview = {
  enrol: Enrolee[];
  leftOut: Partial<Record<LeftOutReason, number>>;
  /** The lines of work that get their own text, most common first. */
  segments: { segment: string; count: number }[];
};

/**
 * Who the campaign would enrol right now, from the workspace's rows. `clients` is for
 * the tick, which has no signed-in user; everything else reads as the person.
 */
export async function previewAudience(
  campaign: Pick<Campaign, "workspace_id" | "audience" | "include_unverified">,
  clients?: { discovery: SupabaseClient; core: SupabaseClient; businessId: string },
): Promise<AudiencePreview> {
  const supabase = clients?.discovery ?? (await createClient());
  const businessId = clients?.businessId ?? (await getBusinessIdForWorkspace(campaign.workspace_id));
  if (!businessId) throw new Error("Workspace not found.");
  const core = clients?.core ?? (await createCoreClient({ schema: "core" }));

  const [prospects, contacts, enrollments, suppressions] = await Promise.all([
    supabase.from("prospects").select("id, kind, status, outcome, fit_score, industry, company_email").eq("workspace_id", campaign.workspace_id),
    supabase.from("contacts").select("id, prospect_id, email, status, email_status, source").eq("workspace_id", campaign.workspace_id).order("created_at"),
    supabase.from("outreach_enrollments").select("prospect_id").eq("workspace_id", campaign.workspace_id),
    core.from("communication_suppressions").select("email_hash").eq("business_id", businessId),
  ]);
  // A list that cannot be read is not an empty list: without the opt-out list nobody is enrolled.
  for (const result of [prospects, contacts, enrollments, suppressions]) if (result.error) throw result.error;

  const selection = selectAudience({
    prospects: (prospects.data ?? []) as AudienceProspect[],
    contacts: (contacts.data ?? []) as AudienceContact[],
    alreadyEnrolled: new Set(((enrollments.data ?? []) as { prospect_id: string }[]).map((row) => row.prospect_id)),
    suppressed: new Set(((suppressions.data ?? []) as { email_hash: string }[]).map((row) => row.email_hash)),
    audience: campaign.audience ?? {},
    includeUnverified: campaign.include_unverified,
  });
  return { ...selection, segments: segmentsFor(selection.enrol) };
}

/** The lines of work the campaign has its own first-step text for. A prospect in one of
 * them gets that text; everyone else gets the general one. Used at enrolment and by the
 * preview, so both put a prospect in the same segment. */
export function writtenSegments(detail: Pick<CampaignDetail, "steps" | "templates">): Set<string> {
  const firstStep = detail.steps.find((step) => step.position === 1);
  return new Set(detail.templates.filter((template) => template.step_id === firstStep?.id).map((template) => template.segment));
}

/**
 * Enrols everyone `previewAudience` selects, due at once for the first step, and records
 * on the campaign how many were enrolled and why the rest were left out. A prospect's
 * text is its line of work's when the campaign has text for that line, else the general
 * one. Safe to repeat: someone already enrolled is not enrolled again.
 */
export async function enrolAudience(
  detail: CampaignDetail,
  clients?: { discovery: SupabaseClient; core: SupabaseClient; businessId: string },
  now: Date = new Date(),
): Promise<EnrollmentSummary> {
  const { campaign } = detail;
  const supabase = clients?.discovery ?? (await createClient());
  const preview = await previewAudience(campaign, clients);

  const written = writtenSegments(detail);
  const rows = preview.enrol.map((enrolee) => ({
    campaign_id: campaign.id,
    workspace_id: campaign.workspace_id,
    prospect_id: enrolee.prospectId,
    contact_id: enrolee.contactId,
    recipient: enrolee.recipient,
    segment: written.has(enrolee.lineOfWork) ? enrolee.lineOfWork : GENERAL_SEGMENT,
    status: "active",
    next_step_position: 1,
    next_due_at: now.toISOString(),
  }));

  let enrolled = 0;
  const leftOut = { ...preview.leftOut };
  for (const row of rows) {
    // One at a time: the unique keys refuse a prospect another request enrolled meanwhile,
    // and one refusal must not undo the rest.
    const { error } = await supabase.from("outreach_enrollments").insert(row);
    if (!error) enrolled += 1;
    else if ((error as { code?: string }).code === "23505") leftOut.already_in_a_campaign = (leftOut.already_in_a_campaign ?? 0) + 1;
    else throw error;
  }

  const summary: EnrollmentSummary = { enrolled, leftOut, at: now.toISOString() };
  const { error } = await supabase.from("outreach_campaigns").update({ last_enrollment: summary }).eq("id", campaign.id);
  if (error) throw error;
  return summary;
}

export type ActivateOutcome =
  | { status: "activated"; enrolled: number; leftOut: Partial<Record<LeftOutReason, number>> }
  | { status: "needs_setup"; message: string }
  | { status: "needs_preview"; message: string }
  | { status: "refused"; message: string };

export const NEEDS_MAILBOX = "Needs setup: connect a mailbox";
export const NEEDS_PREVIEW = "Preview the campaign and confirm it looks right before activating it.";

/** Why a campaign cannot be previewed yet, in the page's words, or null when it can. */
export function previewBlocker(detail: CampaignDetail, mailboxVerified: boolean): { status: "needs_setup" | "refused"; message: string } | null {
  if (detail.campaign.status !== "draft" && detail.campaign.status !== "paused") {
    return { status: "refused", message: detail.campaign.status === "active" ? "This campaign is already running." : "This campaign is finished." };
  }
  if (!mailboxVerified) return { status: "needs_setup", message: NEEDS_MAILBOX };
  const emailSteps = detail.steps.filter((step) => step.channel === "email");
  if (emailSteps.length === 0) return { status: "refused", message: "A campaign needs at least one email step." };
  const unwritten = emailSteps.filter((step) => !detail.templates.some((template) => template.step_id === step.id && template.segment === GENERAL_SEGMENT));
  if (unwritten.length > 0) {
    return { status: "refused", message: `Write the messages first: step ${unwritten.map((step) => step.position).join(", ")} has no text yet.` };
  }
  return null;
}

/**
 * What must be true before Activate, or null when it may be pressed: everything a
 * preview needs, and a preview that a person confirmed and that still describes the
 * campaign. The database holds the same rule (`enforce_outreach_campaign_rules`).
 */
export function activationBlocker(
  detail: CampaignDetail,
  mailboxVerified: boolean,
): { status: "needs_setup" | "needs_preview" | "refused"; message: string } | null {
  if (detail.campaign.status !== "draft") return { status: "refused", message: "This campaign was already activated." };
  const blocker = previewBlocker(detail, mailboxVerified);
  if (blocker) return blocker;
  if (!detail.campaign.preview_confirmed_at) return { status: "needs_preview", message: NEEDS_PREVIEW };
  return null;
}

/**
 * DISC-CAMP-P0-05.3: "This looks right". Records that a person looked at the preview
 * and confirmed it, which is what lets the campaign be activated or resumed. Refused
 * when there is nothing complete to have previewed. The database dates it and names the
 * person itself, and clears it again when anything the preview showed changes.
 */
export async function confirmCampaignPreview(campaignId: string): Promise<CampaignChange | { status: "needs_setup"; message: string }> {
  const detail = await loadForChange(campaignId);
  const mailbox = await getSenderMailbox(detail.campaign.workspace_id);
  const blocker = previewBlocker(detail, mailbox?.status === "verified");
  if (blocker) return blocker;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("outreach_campaigns")
    .update({ preview_confirmed_at: new Date().toISOString(), preview_confirmed_by: user?.id ?? null })
    .eq("id", campaignId)
    .in("status", ["draft", "paused"])
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0 ? { status: "saved" } : { status: "refused", message: "The campaign's status has changed. Refresh the page." };
}

/**
 * Activate: the one act that lets a campaign send. It needs a confirmed preview, a
 * verified mailbox and text for every email step. It enrols the audience, then makes
 * the campaign active. With nobody to write to it stays a draft, unless it is set to
 * add new prospects automatically.
 */
export async function activateCampaign(campaignId: string): Promise<ActivateOutcome> {
  const detail = await loadForChange(campaignId);
  const mailbox = await getSenderMailbox(detail.campaign.workspace_id);
  const blocker = activationBlocker(detail, mailbox?.status === "verified");
  if (blocker) return blocker;

  const summary = await enrolAudience(detail);
  if (summary.enrolled === 0 && !detail.campaign.auto_enroll) {
    return { status: "refused", message: "Nobody could be enrolled, so the campaign wasn't activated. The reasons are listed under Audience." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("outreach_campaigns").update({ status: "active" }).eq("id", campaignId).eq("status", "draft").select("id");
  if (error) throw error;
  if ((data ?? []).length === 0) return { status: "refused", message: "This campaign was already activated." };
  return { status: "activated", enrolled: summary.enrolled, leftOut: summary.leftOut };
}

async function setStatus(campaignId: string, from: Campaign["status"][], patch: Record<string, unknown>): Promise<CampaignChange> {
  await loadForChange(campaignId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("outreach_campaigns").update(patch).eq("id", campaignId).in("status", from).select("id");
  if (error) throw error;
  return (data ?? []).length > 0 ? { status: "saved" } : { status: "refused", message: "The campaign's status has changed. Refresh the page." };
}

/** Pause: nothing more is sent until it is resumed. Takes effect at once: every send
 * re-reads the campaign's status under the claim's lock. */
export const pauseCampaign = (campaignId: string) => setStatus(campaignId, ["active"], { status: "paused", pause_reason: "Paused by a person" });

/** Resume. A campaign that was changed while it was paused needs its preview confirmed
 * again first: the change cleared the confirmation. One that was only paused does not. */
export async function resumeCampaign(campaignId: string): Promise<CampaignChange | { status: "needs_setup" | "needs_preview"; message: string }> {
  const detail = await loadForChange(campaignId);
  const mailbox = await getSenderMailbox(detail.campaign.workspace_id);
  if (mailbox?.status !== "verified") return { status: "needs_setup", message: NEEDS_MAILBOX };
  if (detail.campaign.status === "paused" && !detail.campaign.preview_confirmed_at) {
    return { status: "needs_preview", message: "This campaign was changed while it was paused. Preview it and confirm it looks right before resuming." };
  }
  return setStatus(campaignId, ["paused"], { status: "active" });
}

/** Finish: the campaign never sends again. */
export const finishCampaign = (campaignId: string) => setStatus(campaignId, ["active", "paused"], { status: "completed" });

export type CampaignResults = {
  enrolled: number;
  sent: number;
  failed: number;
  skipped: number;
  bounced: number;
  replied: number;
  interested: number;
  won: number;
  /** Prospects still waiting for a step. */
  inProgress: number;
  rows: {
    enrollmentId: string;
    prospectId: string;
    company: string;
    status: string;
    stopReason: string | null;
    stepsSent: number;
    nextDueAt: string | null;
  }[];
};

/** The funnel, counted from the campaign's own rows. "Delivered" is not among them: a
 * business's own mailbox reports no delivery, and a number that cannot be known is not
 * shown. */
export async function getCampaignResults(campaignId: string): Promise<CampaignResults> {
  const supabase = await createClient();
  const [enrollments, sends] = await Promise.all([
    supabase.from("outreach_enrollments").select("id, prospect_id, status, stop_reason, next_due_at, created_at").eq("campaign_id", campaignId).order("created_at"),
    supabase.from("outreach_sends").select("enrollment_id, status, bounced_at").eq("campaign_id", campaignId),
  ]);
  if (enrollments.error) throw enrollments.error;
  if (sends.error) throw sends.error;
  const enrolled = (enrollments.data ?? []) as { id: string; prospect_id: string; status: string; stop_reason: string | null; next_due_at: string | null; created_at: string }[];
  const sent = (sends.data ?? []) as { enrollment_id: string; status: string; bounced_at: string | null }[];
  const prospectIds = enrolled.map((row) => row.prospect_id);

  const prospects = new Map<string, { company_name: string; outcome: string }>();
  let interested = 0;
  if (prospectIds.length > 0) {
    const [prospectRows, replies] = await Promise.all([
      supabase.from("prospects").select("id, company_name, outcome").in("id", prospectIds),
      supabase.from("messages").select("prospect_id, created_at").in("prospect_id", prospectIds).eq("direction", "inbound").eq("classification", "interested"),
    ]);
    if (prospectRows.error) throw prospectRows.error;
    if (replies.error) throw replies.error;
    for (const row of (prospectRows.data ?? []) as { id: string; company_name: string; outcome: string }[]) prospects.set(row.id, row);
    const enrolledAt = new Map(enrolled.map((row) => [row.prospect_id, row.created_at]));
    interested = new Set(
      ((replies.data ?? []) as { prospect_id: string; created_at: string }[])
        .filter((reply) => reply.created_at >= (enrolledAt.get(reply.prospect_id) ?? ""))
        .map((reply) => reply.prospect_id),
    ).size;
  }

  const sentBy = new Map<string, number>();
  for (const send of sent) if (send.status === "sent") sentBy.set(send.enrollment_id, (sentBy.get(send.enrollment_id) ?? 0) + 1);
  return {
    enrolled: enrolled.length,
    sent: sent.filter((send) => send.status === "sent").length,
    failed: sent.filter((send) => send.status === "failed").length,
    skipped: sent.filter((send) => send.status === "skipped").length,
    bounced: sent.filter((send) => send.bounced_at !== null).length,
    replied: enrolled.filter((row) => row.status === "replied").length,
    interested,
    won: enrolled.filter((row) => prospects.get(row.prospect_id)?.outcome === "won").length,
    inProgress: enrolled.filter((row) => row.status === "active").length,
    rows: enrolled.map((row) => ({
      enrollmentId: row.id,
      prospectId: row.prospect_id,
      company: prospects.get(row.prospect_id)?.company_name ?? "",
      status: row.status,
      stopReason: row.stop_reason,
      stepsSent: sentBy.get(row.id) ?? 0,
      nextDueAt: row.status === "active" ? row.next_due_at : null,
    })),
  };
}

/** Used by the tick for campaigns that add new prospects automatically. */
export function campaignClients(businessId: string, discovery: SupabaseClient) {
  return { discovery, core: createCoreAdminClient({ schema: "core" }), businessId };
}

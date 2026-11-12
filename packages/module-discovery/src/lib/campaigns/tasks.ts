import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import { createAdminClient } from "../../db/admin";
import { createClient } from "../../db/server";
import { getBusiness, getBusinessIdForWorkspace, getProduct, getWorkspace } from "../tenancy/queries";
import { authoriseCampaigns } from "./campaigns";
import { addressOf, composeTask, type ComposedTask, type Sender, type StepRecipient, type TaskDetail } from "./compose";
import { getSenderMailbox } from "./mailbox";
import { STOP_REASON } from "./stops";
import {
  TASK_REASON,
  isTaskChannel,
  type CampaignStep,
  type CampaignTemplate,
  type Enrollment,
  type TaskChannel,
  type TaskOutcome,
  type TaskSkipCode,
  type TemplateOrigin,
} from "./types";

/**
 * DISC-CAMP-P0-06.1: call, WhatsApp and LinkedIn steps, which a person does.
 *
 * WonderArk sends nothing and dials nothing for these. When such a step comes due for a
 * prospect it is a row on the offering's Today list: the draft the campaign wrote for
 * that line of work, with the same merge fields filled by the same renderer as an email,
 * and the number or page it is done with. The person does it themselves and presses
 * "Mark done", choosing "Done" or "Couldn't reach". That is recorded and the prospect
 * moves to its next step, on that step's delay.
 *
 * What this code decides:
 *  - one function, `taskState`, says for a prospect whether its follow-ups have stopped
 *    (a reply, a won or lost outcome, an opt-out, a deleted contact), whether the step is
 *    passed over (nothing to do it with, no text), or what the task is. The Today list,
 *    "Mark done" and the tick all use it, so they cannot disagree;
 *  - a task is recorded through `discovery.claim_outreach_send`, the one way a step's
 *    record comes to exist: it re-reads the licence, that the campaign is running, that
 *    the enrollment is active and that this is its next step, under the workspace's
 *    lock, and a step already recorded is not recorded twice. So a second click, or two
 *    people pressing at once, records one outcome and moves the prospect on once;
 *  - marking a task done needs a licensed member with discovery.manage, and the
 *    enrollment is read through that person's own session first, so one workspace's task
 *    cannot be marked from another;
 *  - the record says a person did it (`task_done`) or could not reach the prospect
 *    (`task_not_reached`). It is never recorded, counted or shown as sent.
 */

export type TaskItem = { enrollment: Enrollment; step: CampaignStep; templates: CampaignTemplate[] };

export type TaskState =
  /** The prospect's follow-ups have stopped: the enrollment ends with this reason. */
  | { kind: "stop"; status: "replied" | "stopped"; reason: string }
  /** This one step is passed over, with the reason; the prospect moves on. */
  | { kind: "skip"; code: TaskSkipCode; reason: string }
  | { kind: "ready"; company: string; task: Extract<ComposedTask, { ok: true }> };

type ProspectRow = StepRecipient["prospect"] & { outcome: string };

/** Pure: what a due task step is for one prospect. */
export function taskState(input: {
  item: TaskItem;
  prospect: ProspectRow | null;
  contact: StepRecipient["contact"];
  /** A reply arrived since the prospect was enrolled. */
  replied: boolean;
  /** The address the prospect was enrolled with is on the business's opt-out list. */
  suppressed: boolean;
  sender: Sender;
}): TaskState {
  const { item, prospect } = input;
  if (!prospect) return { kind: "stop", status: "stopped", reason: "The prospect was deleted" };
  if (prospect.outcome !== "open") return { kind: "stop", status: "stopped", reason: `Marked ${prospect.outcome}` };
  if (input.replied) return { kind: "stop", status: "replied", reason: STOP_REASON.replied };
  // Someone who asked not to be emailed is not then called or messaged by the campaign.
  if (input.suppressed) return { kind: "stop", status: "stopped", reason: STOP_REASON.suppressed };
  const composed = composeTask({
    step: item.step,
    templates: item.templates,
    recipient: { prospect, contact: input.contact, recipient: item.enrollment.recipient, segment: item.enrollment.segment },
    sender: input.sender,
  });
  if (composed.ok) return { kind: "ready", company: prospect.company_name, task: composed };
  return composed.code === "contact_deleted"
    ? { kind: "stop", status: "stopped", reason: composed.reason }
    : { kind: "skip", code: composed.code, reason: composed.reason };
}

/**
 * The state of each task, from the workspace's rows, read in a few set-based queries
 * whatever the number of tasks. A list that cannot be read throws: a task is not shown,
 * recorded or passed over on a guess.
 */
export async function resolveTaskStates(
  clients: { discovery: SupabaseClient; core: SupabaseClient; businessId: string },
  items: TaskItem[],
  sender: Sender,
): Promise<Map<string, TaskState>> {
  const states = new Map<string, TaskState>();
  if (items.length === 0) return states;
  const { discovery, core, businessId } = clients;
  const prospectIds = [...new Set(items.map((item) => item.enrollment.prospect_id))];
  const contactIds = [...new Set(items.map((item) => item.enrollment.contact_id).filter((id): id is string => Boolean(id)))];

  const [prospects, contacts, replies, suppressions] = await Promise.all([
    discovery.from("prospects").select("id, company_name, industry, location, outcome, company_email, phone, linkedin_url").in("id", prospectIds),
    contactIds.length
      ? discovery.from("contacts").select("id, email, first_name, email_status, phone, linkedin_url").in("id", contactIds)
      : { data: [], error: null },
    discovery.from("messages").select("prospect_id, created_at").in("prospect_id", prospectIds).eq("direction", "inbound"),
    core.from("communication_suppressions").select("email_hash").eq("business_id", businessId),
  ]);
  for (const result of [prospects, contacts, replies, suppressions]) if (result.error) throw result.error;

  const prospectOf = new Map(((prospects.data ?? []) as ProspectRow[]).map((row) => [row.id, row]));
  const contactOf = new Map(((contacts.data ?? []) as NonNullable<StepRecipient["contact"]>[]).map((row) => [row.id, row]));
  const optedOut = new Set(((suppressions.data ?? []) as { email_hash: string }[]).map((row) => row.email_hash));
  const repliesOf = new Map<string, string[]>();
  for (const reply of (replies.data ?? []) as { prospect_id: string; created_at: string }[]) {
    repliesOf.set(reply.prospect_id, [...(repliesOf.get(reply.prospect_id) ?? []), reply.created_at]);
  }

  for (const item of items) {
    const { enrollment } = item;
    const prospect = prospectOf.get(enrollment.prospect_id) ?? null;
    const contact = enrollment.recipient === "contact" && enrollment.contact_id ? (contactOf.get(enrollment.contact_id) ?? null) : null;
    const address = prospect ? addressOf({ prospect, contact, recipient: enrollment.recipient }) : null;
    states.set(
      enrollment.id,
      taskState({
        item,
        prospect,
        contact,
        replied: (repliesOf.get(enrollment.prospect_id) ?? []).some((at) => at >= enrollment.created_at),
        suppressed: address ? optedOut.has(emailHash(address)) : false,
        sender,
      }),
    );
  }
  return states;
}

/** How many tasks the Today list shows at once. The rest follow as these are done. */
export const TODAY_TASKS = 5;
/** How many due tasks are read for the Today list. */
const TASKS_READ = 100;

export type CampaignTask = {
  enrollmentId: string;
  prospectId: string;
  company: string;
  channel: TaskChannel;
  /** The draft, with this prospect's values filled in. */
  draft: string;
  /** Where the draft's text came from, shown beside it. */
  origin: TemplateOrigin;
  detail: TaskDetail;
};

export type CampaignTasks = {
  tasks: CampaignTask[];
  /** Tasks that are due and not shown yet. */
  more: number;
  /** True when more were due than were read, so `more` is a lower bound. */
  atLeast: boolean;
};

const NO_TASKS: CampaignTasks = { tasks: [], more: 0, atLeast: false };

/**
 * The tasks that are due now in the offering's running campaigns, oldest first, each
 * with its draft and what it is done with. Read as the signed-in person. A prospect
 * whose follow-ups have stopped, or who has nothing to do the step with, is not listed:
 * the tick records that; this only reads.
 */
export async function listCampaignTasks(workspaceId: string, now: Date = new Date()): Promise<CampaignTasks> {
  const supabase = await createClient();
  const { data: campaigns, error: campaignsError } = await supabase.from("outreach_campaigns").select("id").eq("workspace_id", workspaceId).eq("status", "active");
  if (campaignsError) throw campaignsError;
  const campaignIds = ((campaigns ?? []) as { id: string }[]).map((row) => row.id);
  if (campaignIds.length === 0) return NO_TASKS;

  const { data: stepRows, error: stepsError } = await supabase.from("outreach_campaign_steps").select("*").in("campaign_id", campaignIds).neq("channel", "email");
  if (stepsError) throw stepsError;
  const steps = (stepRows ?? []) as CampaignStep[];
  if (steps.length === 0) return NO_TASKS;

  const { data: due, error: dueError, count } = await supabase
    .from("outreach_enrollments")
    .select("*", { count: "exact" })
    .in("campaign_id", [...new Set(steps.map((step) => step.campaign_id))])
    .in("next_step_position", [...new Set(steps.map((step) => step.position))])
    .eq("status", "active")
    .lte("next_due_at", now.toISOString())
    .order("next_due_at")
    .limit(TASKS_READ);
  if (dueError) throw dueError;
  // Two campaigns may have a task step at different positions: keep the pairs that match.
  const stepOf = (enrollment: Enrollment) => steps.find((step) => step.campaign_id === enrollment.campaign_id && step.position === enrollment.next_step_position);
  const waiting = ((due ?? []) as Enrollment[]).filter((enrollment) => stepOf(enrollment));
  if (waiting.length === 0) return NO_TASKS;

  const [templates, mailbox, workspace, businessId] = await Promise.all([
    supabase.from("outreach_templates").select("*").in("step_id", [...new Set(waiting.map((enrollment) => stepOf(enrollment)!.id))]),
    getSenderMailbox(workspaceId),
    getWorkspace(workspaceId),
    getBusinessIdForWorkspace(workspaceId),
  ]);
  if (templates.error) throw templates.error;
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const business = product ? await getBusiness(product.business_id) : null;
  // A running campaign has a mailbox; without its From name the drafts cannot be filled.
  if (!mailbox || !product || !business || !businessId) return NO_TASKS;

  const items: TaskItem[] = waiting.map((enrollment) => {
    const step = stepOf(enrollment)!;
    return { enrollment, step, templates: ((templates.data ?? []) as CampaignTemplate[]).filter((template) => template.step_id === step.id) };
  });
  const states = await resolveTaskStates(
    { discovery: supabase, core: await createCoreClient({ schema: "core" }), businessId },
    items,
    { fromName: mailbox.fromName, offeringName: product.name, businessName: business.name },
  );

  const ready: CampaignTask[] = [];
  for (const item of items) {
    const state = states.get(item.enrollment.id);
    if (state?.kind !== "ready") continue;
    ready.push({
      enrollmentId: item.enrollment.id,
      prospectId: item.enrollment.prospect_id,
      company: state.company,
      channel: state.task.channel,
      draft: state.task.body,
      origin: state.task.origin,
      detail: state.task.detail,
    });
  }
  return { tasks: ready.slice(0, TODAY_TASKS), more: Math.max(0, ready.length - TODAY_TASKS), atLeast: (count ?? 0) > TASKS_READ };
}

export type TaskDoneOutcome = { status: "recorded" } | { status: "refused"; message: string };

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFERRED_MESSAGE: Record<string, string> = {
  not_licensed: "Discovery isn't licensed for this business, so nothing was recorded.",
  campaign_not_active: "The campaign isn't running, so nothing was recorded.",
  enrollment_not_active: "This prospect is no longer in the campaign.",
  not_next_step: "This step was already recorded.",
};

/**
 * "Mark done" on a Today row: records how a person's task went and moves the prospect
 * to its next step. `outcome` is "done" or "not_reached"; both move it on. Nothing is
 * sent. Safe to repeat: a step already recorded is not recorded again, and the prospect
 * moves on once.
 */
export async function markTaskDone(enrollmentId: string, outcome: TaskOutcome, now: Date = new Date()): Promise<TaskDoneOutcome> {
  if (!(outcome in TASK_REASON)) return { status: "refused", message: "Choose how it went." };
  // Read as the person: an enrollment of a workspace they are not in is not found.
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("outreach_enrollments").select("*").eq("id", enrollmentId).maybeSingle();
  if (error) throw error;
  if (!row) return { status: "refused", message: "That task wasn't found." };
  const enrollment = row as Enrollment;
  const businessId = await authoriseCampaigns(enrollment.workspace_id);

  const [campaign, steps] = await Promise.all([
    supabase.from("outreach_campaigns").select("id, status").eq("id", enrollment.campaign_id).maybeSingle(),
    supabase.from("outreach_campaign_steps").select("*").eq("campaign_id", enrollment.campaign_id).order("position"),
  ]);
  if (campaign.error) throw campaign.error;
  if (steps.error) throw steps.error;
  if (campaign.data?.status !== "active") return { status: "refused", message: DEFERRED_MESSAGE.campaign_not_active! };
  if (enrollment.status !== "active") return { status: "refused", message: DEFERRED_MESSAGE.enrollment_not_active! };
  const sequence = (steps.data ?? []) as CampaignStep[];
  const step = sequence.find((entry) => entry.position === enrollment.next_step_position);
  if (!step || !isTaskChannel(step.channel)) return { status: "refused", message: DEFERRED_MESSAGE.not_next_step! };
  if (!enrollment.next_due_at || new Date(enrollment.next_due_at).getTime() > now.getTime()) {
    return { status: "refused", message: "This step isn't due yet." };
  }

  // The same stops the tick applies: a prospect who replied, was closed or opted out
  // since the row was shown is stopped, and nothing is recorded as done for them.
  const { data: templates, error: templatesError } = await supabase.from("outreach_templates").select("*").eq("step_id", step.id);
  if (templatesError) throw templatesError;
  const [mailbox, workspace] = await Promise.all([getSenderMailbox(enrollment.workspace_id), getWorkspace(enrollment.workspace_id)]);
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const business = product ? await getBusiness(product.business_id) : null;
  const item: TaskItem = { enrollment, step, templates: (templates ?? []) as CampaignTemplate[] };
  const state = (
    await resolveTaskStates(
      { discovery: supabase, core: await createCoreClient({ schema: "core" }), businessId },
      [item],
      { fromName: mailbox?.fromName ?? "", offeringName: product?.name ?? "", businessName: business?.name ?? "" },
    )
  ).get(enrollment.id);
  if (state?.kind === "stop") {
    const { error: stopError } = await supabase
      .from("outreach_enrollments")
      .update({ status: state.status, stop_reason: state.reason.slice(0, 200), next_due_at: null })
      .eq("id", enrollment.id)
      .eq("status", "active");
    if (stopError) throw stopError;
    return { status: "refused", message: `Nothing was recorded: follow-ups to this prospect have stopped (${state.reason}).` };
  }

  // The record is written by the claim, which only the service role may call. Everything
  // above was checked as the person; the claim checks the licence, the campaign and the
  // enrollment again under its lock.
  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.rpc("claim_outreach_send", {
    p_enrollment_id: enrollment.id,
    p_step_id: step.id,
    p_skip_reason: TASK_REASON[outcome],
  });
  if (claimError) throw claimError;
  const record = (Array.isArray(claimed) ? claimed[0] : claimed) as { id: string | null; status: string; reason: string | null; created: boolean } | undefined;
  if (!record) return { status: "refused", message: "The task couldn't be recorded. Try again." };
  if (record.status === "deferred") return { status: "refused", message: DEFERRED_MESSAGE[record.reason ?? ""] ?? "The task couldn't be recorded. Try again." };

  // Move on once: only from this step, so a second click changes nothing.
  const next = sequence.find((entry) => entry.position === step.position + 1);
  const { error: advanceError } = await admin
    .from("outreach_enrollments")
    .update(
      next
        ? { next_step_position: next.position, next_due_at: new Date(now.getTime() + next.delay_days * DAY_MS).toISOString() }
        : { status: "completed", next_step_position: step.position + 1, next_due_at: null },
    )
    .eq("id", enrollment.id)
    .eq("status", "active")
    .eq("next_step_position", step.position);
  if (advanceError) throw advanceError;

  if (record.created) {
    try {
      // Who did it. The record's own audit entry (written by the database) has no person.
      await writeAuditLog({
        businessId,
        action: "discovery.campaign.task_recorded",
        entityType: "discovery_outreach_send",
        entityId: record.id,
        after: { campaignId: enrollment.campaign_id, enrollmentId: enrollment.id, stepId: step.id, channel: step.channel, outcome },
      });
    } catch (auditError) {
      console.error("Could not record who did a campaign task:", auditError instanceof Error ? auditError.message : auditError);
    }
  }
  return { status: "recorded" };
}

/**
 * DISC-CAMP-P0-01.1 onward: the shapes outreach campaigns share
 * (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md). No server code and no environment
 * access here, so client components may import it.
 */

export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type StepChannel = "email" | "call" | "whatsapp" | "linkedin";
export type StepPurpose = "intro" | "follow_up" | "last_note" | "call";
export type TemplateOrigin = "ai_generated" | "user_modified" | "user_provided";
export type EnrollmentStatus = "active" | "replied" | "completed" | "stopped";
export type SendStatus = "requested" | "sent" | "failed" | "skipped";

export type CampaignAudience = {
  linesOfWork?: string[];
  minFitScore?: number | null;
  /** Only prospects marked qualified. When false, everyone not marked disqualified. A new
   * campaign sets it from the workspace's own data: on when it has qualified prospects. */
  onlyQualified?: boolean;
};

export type Campaign = {
  id: string;
  workspace_id: string;
  name: string;
  status: CampaignStatus;
  pause_reason: string | null;
  audience: CampaignAudience;
  send_days: number[];
  send_from_hour: number;
  send_to_hour: number;
  timezone: string;
  auto_enroll: boolean;
  personal_opening: boolean;
  include_unverified: boolean;
  last_enrollment: EnrollmentSummary | null;
  launched_at: string | null;
  created_at: string;
  /** DISC-CAMP-P0-05.3: when a person confirmed the preview. The database clears it when
   * anything the preview showed changes, and refuses activation without it. */
  preview_confirmed_at?: string | null;
  /** DISC-CAMP-P0-05.4: emails a day for this campaign; null uses the mailbox's limit. */
  daily_limit?: number | null;
  test_sent_at?: string[];
};

export type CampaignStep = {
  id: string;
  campaign_id: string;
  workspace_id: string;
  position: number;
  channel: StepChannel;
  delay_days: number;
  purpose: StepPurpose;
};

export type CampaignTemplate = {
  id: string;
  campaign_id: string;
  step_id: string;
  workspace_id: string;
  segment: string;
  subject: string | null;
  body: string;
  origin: TemplateOrigin;
  ai_run_id: string | null;
};

export type Enrollment = {
  id: string;
  campaign_id: string;
  workspace_id: string;
  prospect_id: string;
  contact_id: string | null;
  recipient: "contact" | "company_email";
  segment: string;
  status: EnrollmentStatus;
  stop_reason: string | null;
  next_step_position: number;
  next_due_at: string | null;
  created_at: string;
};

export type OutreachSend = {
  id: string;
  enrollment_id: string;
  step_id: string;
  campaign_id: string;
  workspace_id: string;
  status: SendStatus;
  reason: string | null;
  bounced_at: string | null;
  message_id: string | null;
  local_day: string;
  claimed_at: string;
  finished_at: string | null;
};

/** Whether a campaign may hold call, WhatsApp and LinkedIn steps, which a person does
 * from a draft on the Today list (DISC-CAMP-P0-06.1). */
export const TASK_STEPS_AVAILABLE = true;

/**
 * DISC-CAMP-P0-06.1: a step WonderArk does not send. A call, a WhatsApp message or a
 * LinkedIn message is a task for a person: the campaign writes a draft, the Today list
 * shows it when it is due, and the person records how it went. Nothing is dialled or
 * sent for it.
 */
export type TaskChannel = Exclude<StepChannel, "email">;
export const isTaskChannel = (channel: StepChannel): channel is TaskChannel => channel !== "email";

/** How a person's task went. Either one moves the prospect on to the next step. */
export type TaskOutcome = "done" | "not_reached";
export const TASK_OUTCOMES: readonly TaskOutcome[] = ["done", "not_reached"];
export const TASK_OUTCOME_LABEL: Record<TaskOutcome, string> = { done: "Done", not_reached: "Couldn't reach" };

/**
 * A task has no row of its own: it is recorded in `outreach_sends`, the one record of
 * what happened to a step, as a step WonderArk did not send (`skipped`) with one of these
 * as the reason. The page never calls such a row "skipped" or "sent": it reads the
 * reason and says a person did it, or could not reach the prospect.
 */
export const TASK_REASON: Record<TaskOutcome, string> = { done: "task_done", not_reached: "task_not_reached" };
export const taskOutcomeOf = (reason: string | null | undefined): TaskOutcome | null =>
  reason === TASK_REASON.done ? "done" : reason === TASK_REASON.not_reached ? "not_reached" : null;

/** Why a task step was passed over for a prospect, in the page's words. The prospect
 * moves on to the next step: a missing phone number does not end its emails. */
export const TASK_SKIP_LABEL = {
  no_phone: "No phone number",
  no_message: "No text was written for this step",
  missing_merge_field: "The step's text uses a detail this prospect doesn't have",
  invalid_template: "The step's text has a merge field that can't be filled",
} as const;
export type TaskSkipCode = keyof typeof TASK_SKIP_LABEL;

export const MAX_STEPS = 5;
export const MIN_FOLLOW_UP_DAYS = 1;
export const MAX_FOLLOW_UP_DAYS = 30;

/**
 * The shape a new campaign starts with: three emails. It is structure only (which
 * step, how many days later, what it is for). No text exists until the person presses
 * "Write messages", and they can change, add or remove steps first. Call, WhatsApp and
 * LinkedIn steps are never part of it; a person adds those.
 */
export const STARTING_STEPS: readonly Pick<CampaignStep, "position" | "channel" | "delay_days" | "purpose">[] = [
  { position: 1, channel: "email", delay_days: 0, purpose: "intro" },
  { position: 2, channel: "email", delay_days: 3, purpose: "follow_up" },
  { position: 3, channel: "email", delay_days: 5, purpose: "last_note" },
];

export const STEP_PURPOSE_LABEL: Record<StepPurpose, string> = {
  intro: "Introduction",
  follow_up: "Follow-up",
  last_note: "Last note",
  call: "Call",
};
export const STEP_CHANNEL_LABEL: Record<StepChannel, string> = {
  email: "Email",
  call: "Call",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
};
/** What a step is, in a sentence: "Follow-up email", "Call", "WhatsApp message". */
export function stepLabel(step: Pick<CampaignStep, "channel" | "purpose">): string {
  if (step.channel === "email") return `${STEP_PURPOSE_LABEL[step.purpose]} email`;
  return step.channel === "call" ? "Call" : `${STEP_CHANNEL_LABEL[step.channel]} message`;
}
/** What the campaign writes for a task step. */
export const TASK_DRAFT_LABEL: Record<TaskChannel, string> = {
  call: "Talking points",
  whatsapp: "Message to send",
  linkedin: "Message to send",
};
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Running",
  paused: "Paused",
  completed: "Finished",
};
export const TEMPLATE_ORIGIN_LABEL: Record<TemplateOrigin, string> = {
  ai_generated: "AI-generated",
  user_modified: "AI-generated, edited by you",
  user_provided: "Written by you",
};

/** The segment every campaign has: the text used when a prospect's line of work has no
 * text of its own. */
export const GENERAL_SEGMENT = "general";
/** Lines of work that get their own text. The rest share the general one. */
export const MAX_SEGMENTS = 12;

/** Why a prospect was not enrolled. Each is counted and shown; none is silent. */
export type LeftOutReason =
  | "channel"
  | "not_qualified"
  | "disqualified"
  | "closed"
  | "below_fit_score"
  | "other_line_of_work"
  | "already_in_a_campaign"
  | "no_email"
  | "invalid_email"
  | "unverified_email"
  | "sourced_person"
  | "suppressed";

export const LEFT_OUT_LABEL: Record<LeftOutReason, string> = {
  channel: "are channels, not companies",
  not_qualified: "are not marked qualified",
  disqualified: "are marked disqualified",
  closed: "are already won or lost",
  below_fit_score: "are below the minimum fit score",
  other_line_of_work: "are in another line of work",
  already_in_a_campaign: "are already in a campaign",
  no_email: "have no email address",
  invalid_email: "have an address marked invalid",
  unverified_email: "have an address that is risky or not verified",
  sourced_person: "have only a named person found by a lookup, not a company mailbox",
  suppressed: "asked not to be emailed",
};

export type EnrollmentSummary = {
  enrolled: number;
  leftOut: Partial<Record<LeftOutReason, number>>;
  at: string;
};

/** When the daily send check runs (apps/web/vercel.json), in UTC. The campaign page uses
 * it to say when a campaign whose hours exclude it would never send. */
export const DAILY_TICK_UTC = { hour: 6, minute: 5 } as const;

/**
 * The daily send check's time of day in a campaign's timezone, and whether the
 * campaign's sending hours include it. Emails go out at that check (and hourly once the
 * hourly schedule is turned on), so hours that exclude it would mean nothing sends; the
 * page says so rather than leaving a campaign silently idle.
 */
export function dailyCheckIn(campaign: Pick<Campaign, "timezone" | "send_from_hour" | "send_to_hour">): { time: string; hour: number; inHours: boolean } {
  const at = new Date(Date.UTC(2026, 0, 5, DAILY_TICK_UTC.hour, DAILY_TICK_UTC.minute));
  const format = (timeZone: string) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  let time: string;
  try {
    time = format(campaign.timezone);
  } catch {
    time = format("UTC");
  }
  const hour = Number(time.slice(0, 2));
  return { time, hour, inHours: hour >= campaign.send_from_hour && hour < campaign.send_to_hour };
}

export const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

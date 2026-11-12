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

export const MAX_STEPS = 5;
export const MIN_FOLLOW_UP_DAYS = 2;
export const MAX_FOLLOW_UP_DAYS = 60;

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

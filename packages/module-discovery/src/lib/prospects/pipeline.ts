import type { OutreachStrategyStatus } from "../outreach/types";
import type { ConversationStatus } from "../conversations/types";

/**
 * Derived pipeline stage (docs/prospects-pipeline-redesign-requirements.md R3/R4) --
 * never stored, always computed from the same child tables the rest of the app already
 * reads (prospect_research, prospect_scores, outreach_strategies, messages,
 * conversations). No new AI call and no new column: a rescore or a new message changes
 * this on the next read for free.
 */
export const PROSPECT_STAGES = [
  "new",
  "researched",
  "scored",
  "strategized",
  "messaged",
  "sent",
  "replied",
  "closed",
] as const;

export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const PROSPECT_STAGE_LABEL: Record<ProspectStage, string> = {
  new: "New",
  researched: "Researched",
  scored: "Scored",
  strategized: "Strategized",
  messaged: "Messaged",
  sent: "Sent",
  replied: "Replied",
  closed: "Closed",
};

/** A prospect sitting in the same stage this long without moving gets a "needs next
 * step" indicator on the list -- long enough that a same-day research-then-score
 * sequence never triggers it, short enough to actually surface neglected prospects. */
export const STAGE_STUCK_THRESHOLD_DAYS = 7;

/** Maps each literal `nextAction` string produced below to the `id` of the prospect
 * detail page section (see the section elements on the prospect page) where that action
 * is actually taken -- lets the prospects table link "Next action" straight there
 * instead of just naming it. */
export const NEXT_ACTION_ANCHOR: Record<string, string> = {
  Research: "research",
  Score: "score",
  "Generate strategy": "strategy",
  "Approve strategy": "strategy",
  "Generate message": "messages",
  "Review message": "messages",
  "Retry send": "messages",
  "Generate reply": "conversations",
};

export type ProspectPipelineSignals = {
  hasResearch: boolean;
  hasScore: boolean;
  latestStrategyStatus: OutreachStrategyStatus | null;
  hasUnsentMessage: boolean;
  hasFailedMessage: boolean;
  hasSentMessage: boolean;
  latestConversationStatus: ConversationStatus | null;
  /** Most recent timestamp across the prospect row and every child table below --
   * drives the "stuck for N days" indicator regardless of which stage it's stuck in. */
  lastActivityAt: string;
};

export type ProspectPipelineState = {
  stage: ProspectStage;
  /** Label for the single primary CTA a founder should take next; null once the
   * prospect has reached a stage with no further app-driven action (sent -- waiting on
   * the prospect -- or closed). */
  nextAction: string | null;
  lastActivityAt: string;
  isStuck: boolean;
};

export function deriveProspectPipelineState(
  signals: ProspectPipelineSignals,
): ProspectPipelineState {
  const {
    hasResearch,
    hasScore,
    latestStrategyStatus,
    hasUnsentMessage,
    hasFailedMessage,
    hasSentMessage,
    latestConversationStatus,
    lastActivityAt,
  } = signals;

  let stage: ProspectStage;
  let nextAction: string | null;

  if (latestConversationStatus === "closed") {
    stage = "closed";
    nextAction = null;
  } else if (latestConversationStatus === "replied") {
    stage = "replied";
    nextAction = "Generate reply";
  } else if (hasSentMessage || latestConversationStatus === "awaiting_reply") {
    stage = "sent";
    nextAction = null;
  } else if (hasUnsentMessage) {
    stage = "messaged";
    nextAction = hasFailedMessage ? "Retry send" : "Review message";
  } else if (latestStrategyStatus === "approved") {
    stage = "strategized";
    nextAction = "Generate message";
  } else if (latestStrategyStatus === "draft") {
    stage = "strategized";
    nextAction = "Approve strategy";
  } else if (hasScore) {
    stage = "scored";
    nextAction = hasResearch ? "Generate strategy" : "Research";
  } else if (hasResearch) {
    stage = "researched";
    nextAction = "Score";
  } else {
    stage = "new";
    nextAction = "Research";
  }

  const ageMs = Date.now() - new Date(lastActivityAt).getTime();
  const isStuck =
    stage !== "closed" &&
    stage !== "replied" &&
    ageMs > STAGE_STUCK_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  return { stage, nextAction, lastActivityAt, isStuck };
}

/**
 * DISC-NAV-P0-01.2: a follow-up is due when a message was sent, no reply has come, and
 * nothing has happened for `STAGE_STUCK_THRESHOLD_DAYS` -- the rule the list already
 * marks as "Needs next step", narrowed to the Sent stage. Derived on read from the same
 * rows as the stage; nothing is stored and no new threshold is introduced.
 */
export function isFollowUpDue(
  prospect: Pick<ProspectPipelineState, "stage" | "isStuck"> & {
    /** DISC-CAMP-P0-04.1: a running campaign is already following this prospect up, so it
     * is not also a follow-up for a person to send. */
    inActiveCampaign?: boolean;
  },
): boolean {
  return prospect.stage === "sent" && prospect.isStuck && !prospect.inActiveCampaign;
}

export type ConversionFunnelStep = { stage: ProspectStage; label: string; reached: number };

export type ConversionFunnel = {
  total: number;
  steps: ConversionFunnelStep[];
  replyRate: number;
  closeRate: number;
};

/**
 * A conversion funnel from any set of prospects' derived stages -- no new query, since
 * `deriveProspectPipelineState`'s reverse-order checks already make `.stage` mean
 * "furthest stage reached", so "reached this stage or further" is a plain index
 * comparison against PROSPECT_STAGES. Shared by the per-product Conversions tab and the
 * account-wide dashboard summary so both compute the same numbers the same way.
 */
export function computeConversionFunnel(
  prospects: { stage: ProspectStage }[],
): ConversionFunnel {
  const total = prospects.length;
  const steps = PROSPECT_STAGES.map((stage, i) => ({
    stage,
    label: PROSPECT_STAGE_LABEL[stage],
    reached: prospects.filter((p) => PROSPECT_STAGES.indexOf(p.stage) >= i).length,
  }));

  const sentCount = steps.find((s) => s.stage === "sent")?.reached ?? 0;
  const repliedCount = steps.find((s) => s.stage === "replied")?.reached ?? 0;
  const closedCount = steps.find((s) => s.stage === "closed")?.reached ?? 0;

  return {
    total,
    steps,
    replyRate: sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0,
    closeRate: total > 0 ? Math.round((closedCount / total) * 100) : 0,
  };
}

/** Latest timestamp across a set of ISO strings, ignoring nulls/undefined. */
export function latestTimestamp(...timestamps: Array<string | null | undefined>): string {
  return timestamps
    .filter((t): t is string => Boolean(t))
    .reduce((latest, t) => (t > latest ? t : latest));
}

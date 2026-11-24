import { researchProspect } from "../ai/research-prospect";
import { scoreProspect } from "../scoring/score-prospect";
import { generateOutreachStrategy } from "../ai/generate-strategy";
import { generateOutreachMessage } from "../ai/generate-message";
import { approveOutreachStrategy } from "../outreach/mutations";
import { getLatestOutreachStrategy } from "../outreach/queries";
import { applyIncrementalSignalUpdate } from "../pipeline/incremental";
import { UsageLimitExceededError } from "../usage/limits";
import { AiProviderError } from "../ai/router";
import { generateChannelDraft } from "../channels/drafts";
import type { DmPlatform, Reach } from "../channels/reach";
import { DailySendLimitReached, sendFirstEmailAutomatically } from "../auto-send/send";

/**
 * DISC-AUTO-P0-01.1: preparing a picked prospect by itself (owner, 2026-11-22: "after you
 * approve a prospect, research it, score it and draft the first message automatically").
 * Picking a prospect is the go-ahead to spend AI credits on it. Each prospect goes through
 * research -> score -> outreach strategy (written and approved inside this step, as the way
 * the message gets written) -> a first-message draft. Nothing is sent: the draft waits for
 * the person's Send.
 *
 * One step per call, so each request stays short; the page's runner calls again until
 * nothing is left. A prospect closest to a draft goes first, so drafts appear early.
 */
export type PrepStep = "research" | "score" | "strategy" | "approve" | "message" | "send";

const STEP_FOR_ACTION: Record<string, PrepStep> = {
  "Generate message": "message",
  "Approve strategy": "approve",
  "Generate strategy": "strategy",
  Score: "score",
  Research: "research",
};
const ORDER: PrepStep[] = ["send", "message", "approve", "strategy", "score", "research"];

/** What a finished step is called, before the prospect's name: "Researched Week Plan". */
export const PREP_STEP_LABEL: Record<PrepStep, string> = {
  research: "Researched",
  score: "Scored",
  strategy: "Planned the message to",
  approve: "Planned the message to",
  message: "Wrote the first message to",
  send: "Sent the first email to",
};

type Preppable = {
  id: string;
  company_name: string;
  nextAction: string | null;
  /** DISC-REACH-P0-01.1: a channel is written to from its own details, by the way it can be
   * reached: a direct message on its platform, or an email pitch. */
  kind?: "company" | "channel";
  reach?: Reach | null;
  dmPlatform?: DmPlatform | null;
  hasContactEmail?: boolean;
};

const isChannel = (p: Preppable) => p.kind === "channel";
/** A channel on a messaging platform whose only draft is an email with no address to go to:
 * it gets a direct message written instead. */
const needsDm = (p: Preppable) => isChannel(p) && p.reach === "needs_email" && Boolean(p.dmPlatform);

/** DISC-AUTO-P0-03.1: with "Send automatically" on, a written first message is sent too. */
export type PrepOptions = { autoSend?: boolean };

export function prepStepOf(p: Preppable, options: PrepOptions = {}): PrepStep | null {
  if (needsDm(p)) return "message";
  // Only an email with an address can be sent automatically; the rest are the person's.
  if (p.nextAction === "Review message") return options.autoSend && (p.reach === "email" || p.reach === undefined) ? "send" : null;
  const step = p.nextAction ? (STEP_FOR_ACTION[p.nextAction] ?? null) : null;
  // A channel has no outreach plan step: once scored, its message is written.
  if (isChannel(p) && (step === "strategy" || step === "approve")) return "message";
  return step;
}

/** The picked prospects still to prepare, leaving out any skipped this run (failed once). */
export function prepQueue<T extends Preppable>(prospects: T[], skip: readonly string[] = [], options: PrepOptions = {}): T[] {
  return prospects
    .filter((p) => prepStepOf(p, options) !== null && !skip.includes(p.id))
    .sort((a, b) => ORDER.indexOf(prepStepOf(a, options)!) - ORDER.indexOf(prepStepOf(b, options)!));
}

/** DISC-AUTO-P0-01.3: how many steps a prospect has left, for the progress bar: research,
 * score, plan, approve the plan, write; plus the send when Send automatically is on. */
const STEPS_FROM: Record<PrepStep, number> = { research: 5, score: 4, strategy: 3, approve: 2, message: 1, send: 0 };
/** A channel: research, score, write. */
const CHANNEL_STEPS_FROM: Record<PrepStep, number> = { research: 3, score: 2, strategy: 1, approve: 1, message: 1, send: 0 };

export function stepsLeft(p: Preppable, options: PrepOptions = {}): number {
  const step = prepStepOf(p, options);
  if (!step) return 0;
  // A direct message is never sent automatically, so it adds no send step.
  const willSend = Boolean(options.autoSend) && !(isChannel(p) && Boolean(p.dmPlatform) && !p.hasContactEmail);
  return (isChannel(p) ? CHANNEL_STEPS_FROM : STEPS_FROM)[step] + (willSend ? 1 : 0);
}

/** Runs one step for one prospect under the person's own session (RLS scopes it). */
export async function runPrepStep(workspaceId: string, prospect: Preppable, options: PrepOptions = {}): Promise<PrepStep | null> {
  const step = prepStepOf(prospect, options);
  if (step === "research") {
    await researchProspect(prospect.id);
    // Best-effort, as on the prospect's own Research button.
    await applyIncrementalSignalUpdate(workspaceId, prospect.id).catch(() => undefined);
  } else if (step === "score") {
    await scoreProspect(prospect.id);
  } else if (step === "strategy") {
    await generateOutreachStrategy(prospect.id, null);
  } else if (step === "send") {
    await sendFirstEmailAutomatically(workspaceId, prospect.id);
  } else if (step === "message" && isChannel(prospect)) {
    // DISC-REACH-P0-01.1: a direct message where the channel is reached on a platform and
    // has no address; otherwise a partnership pitch by email.
    const outcome = await generateChannelDraft(prospect.id, prospect.dmPlatform && !prospect.hasContactEmail ? "dm" : "pitch");
    if (outcome.status === "failed") throw new Error(outcome.message);
    if (outcome.status === "duplicate") throw new Error("Its message was written a moment ago. Refresh to see it.");
  } else if (step === "approve" || step === "message") {
    const strategy = await getLatestOutreachStrategy(prospect.id);
    if (!strategy) throw new Error("No outreach plan to write from.");
    if (step === "approve") await approveOutreachStrategy(strategy.id);
    else await generateOutreachMessage(strategy.id);
  }
  return step;
}

/** DISC-AUTO-P0-01.2: failures that would fail every prospect the same way (credits used up,
 * no AI key, a key the provider refuses, AI turned off, the provider rate-limiting or down).
 * The runner stops on these and says why, instead of skipping prospect after prospect. Any
 * other failure is about that one prospect: it is skipped and the run goes on. */
const STOPPING_CODES = new Set(["no_provider_connected", "invalid_key", "feature_disabled", "rate_limited", "provider_unavailable"]);

export function stopsTheRun(error: unknown): boolean {
  return (
    error instanceof UsageLimitExceededError ||
    error instanceof DailySendLimitReached ||
    (error instanceof AiProviderError && STOPPING_CODES.has(error.code))
  );
}

/** Whether the fix is the person's AI key (shown with a link to the AI provider settings). */
export function needsAiSetup(error: unknown): boolean {
  return error instanceof AiProviderError && (error.code === "invalid_key" || error.code === "no_provider_connected");
}

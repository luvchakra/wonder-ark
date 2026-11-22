import { researchProspect } from "../ai/research-prospect";
import { scoreProspect } from "../scoring/score-prospect";
import { generateOutreachStrategy } from "../ai/generate-strategy";
import { generateOutreachMessage } from "../ai/generate-message";
import { approveOutreachStrategy } from "../outreach/mutations";
import { getLatestOutreachStrategy } from "../outreach/queries";
import { applyIncrementalSignalUpdate } from "../pipeline/incremental";
import { UsageLimitExceededError } from "../usage/limits";
import { AiProviderError } from "../ai/router";

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
export type PrepStep = "research" | "score" | "strategy" | "approve" | "message";

const STEP_FOR_ACTION: Record<string, PrepStep> = {
  "Generate message": "message",
  "Approve strategy": "approve",
  "Generate strategy": "strategy",
  Score: "score",
  Research: "research",
};
const ORDER: PrepStep[] = ["message", "approve", "strategy", "score", "research"];

/** What a finished step is called, before the prospect's name: "Researched Week Plan". */
export const PREP_STEP_LABEL: Record<PrepStep, string> = {
  research: "Researched",
  score: "Scored",
  strategy: "Planned the message to",
  approve: "Planned the message to",
  message: "Wrote the first message to",
};

type Preppable = { id: string; company_name: string; nextAction: string | null };

export function prepStepOf(p: Preppable): PrepStep | null {
  return p.nextAction ? (STEP_FOR_ACTION[p.nextAction] ?? null) : null;
}

/** The picked prospects still to prepare, leaving out any skipped this run (failed once). */
export function prepQueue<T extends Preppable>(prospects: T[], skip: readonly string[] = []): T[] {
  return prospects
    .filter((p) => prepStepOf(p) !== null && !skip.includes(p.id))
    .sort((a, b) => ORDER.indexOf(prepStepOf(a)!) - ORDER.indexOf(prepStepOf(b)!));
}

/** Runs one step for one prospect under the person's own session (RLS scopes it). */
export async function runPrepStep(workspaceId: string, prospect: Preppable): Promise<PrepStep | null> {
  const step = prepStepOf(prospect);
  if (step === "research") {
    await researchProspect(prospect.id);
    // Best-effort, as on the prospect's own Research button.
    await applyIncrementalSignalUpdate(workspaceId, prospect.id).catch(() => undefined);
  } else if (step === "score") {
    await scoreProspect(prospect.id);
  } else if (step === "strategy") {
    await generateOutreachStrategy(prospect.id, null);
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
  return error instanceof UsageLimitExceededError || (error instanceof AiProviderError && STOPPING_CODES.has(error.code));
}

/** Whether the fix is the person's AI key (shown with a link to the AI provider settings). */
export function needsAiSetup(error: unknown): boolean {
  return error instanceof AiProviderError && (error.code === "invalid_key" || error.code === "no_provider_connected");
}

import { researchProspect } from "../ai/research-prospect";
import { scoreProspect } from "../scoring/score-prospect";
import { UsageLimitExceededError } from "../usage/limits";
import { listProspects } from "./queries";
import { PROSPECT_STAGES, type ProspectStage } from "./pipeline";

export type BulkActionResult = {
  completed: number;
  /** Everything selected but not completed: the sum of the reasons below. */
  skipped: number;
  /** DISC-PROS-P0-08.2: why the rest were not done, so the page can say so. Already past
   * this step (researched, or scored), not ready for it yet (needs research first), failed
   * on its own, or never tried because the monthly usage ceiling was hit first. */
  alreadyDone: number;
  notReady: number;
  failed: number;
  notAttempted: number;
  limitReached: boolean;
};

/**
 * Orchestration only, reusing the existing per-prospect actions
 * (docs/prospects-pipeline-redesign-requirements.md R6) -- runs sequentially, not
 * Promise.all, so a hit monthly usage ceiling (assertWithinUsageLimit, checked inside
 * each per-prospect action) stops the batch after the prospect in flight instead of
 * firing every remaining call regardless. Only prospects actually at `eligibleStage`
 * among the selection are attempted; the rest are silently skipped rather than wasting
 * a call re-running a step that's already done.
 */
async function runBulk(
  workspaceId: string,
  prospectIds: string[],
  eligibleStage: ProspectStage,
  action: (prospectId: string) => Promise<unknown>,
): Promise<BulkActionResult> {
  const chosen = new Set(prospectIds);
  const prospects = (await listProspects(workspaceId, {})).filter((p) => chosen.has(p.id));
  const at = PROSPECT_STAGES.indexOf(eligibleStage);
  const eligibleIds = prospects.filter((p) => p.stage === eligibleStage).map((p) => p.id);
  const alreadyDone = prospects.filter((p) => PROSPECT_STAGES.indexOf(p.stage) > at).length;
  const notReady = prospects.filter((p) => PROSPECT_STAGES.indexOf(p.stage) < at).length;

  let completed = 0;
  let failed = 0;
  let limitReached = false;
  for (const id of eligibleIds) {
    try {
      await action(id);
      completed++;
    } catch (error) {
      if (error instanceof UsageLimitExceededError) {
        limitReached = true;
        break;
      }
      // Any other single-prospect failure doesn't abort the rest of the batch.
      failed++;
    }
  }
  const notAttempted = eligibleIds.length - completed - failed;
  return { completed, skipped: prospectIds.length - completed, alreadyDone, notReady, failed, notAttempted, limitReached };
}

/** "Research all new" -- only prospects still at the "new" stage among the selection. */
export function bulkResearchProspects(
  workspaceId: string,
  prospectIds: string[],
): Promise<BulkActionResult> {
  return runBulk(workspaceId, prospectIds, "new", researchProspect);
}

/** "Score all researched" -- deterministic and free, but still only scores prospects
 * that have research and no score yet. */
export function bulkScoreProspects(
  workspaceId: string,
  prospectIds: string[],
): Promise<BulkActionResult> {
  return runBulk(workspaceId, prospectIds, "researched", scoreProspect);
}

/**
 * DISC-PROS-P0-08.2: what the Prospects page says after "Research selected" or "Score
 * selected": what was done, and in plain words why the rest were not, with the next step
 * when there is one. Never "skipped" with no reason.
 */
export function bulkResultMessage(input: {
  action: "research" | "score";
  completed: number;
  alreadyDone: number;
  notReady: number;
  failed: number;
  limitReached: boolean;
}): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const research = input.action === "research";
  const parts: string[] = [];
  if (input.completed > 0) parts.push(`${research ? "Researched" : "Scored"} ${n(input.completed, "prospect", "prospects")}.`);
  if (input.alreadyDone > 0) {
    parts.push(
      research
        ? `${n(input.alreadyDone, "was", "were")} already researched${input.completed === 0 ? ": use Score selected next" : ""}.`
        : `${n(input.alreadyDone, "was", "were")} already scored.`,
    );
  }
  if (input.notReady > 0) parts.push(`${n(input.notReady, "needs", "need")} research first.`);
  if (input.failed > 0) parts.push(`${n(input.failed, "failed", "failed")}: open it to try again.`);
  if (input.limitReached) parts.push("Stopped early: this workspace reached its monthly AI usage limit.");
  if (parts.length === 0) parts.push(`Nothing to ${research ? "research" : "score"} among those selected.`);
  return parts.join(" ");
}

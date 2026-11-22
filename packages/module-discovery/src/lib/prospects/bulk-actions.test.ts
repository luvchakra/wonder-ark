/**
 * R6's bulk runners. Three rules make this more than a loop: only prospects actually at
 * the eligible stage are attempted (re-running a finished step wastes a paid call), a hit
 * usage ceiling stops the batch rather than firing every remaining call, and any other
 * single failure does not abort the rest.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  researchProspect: vi.fn(),
  scoreProspect: vi.fn(),
  listProspects: vi.fn(),
}));

vi.mock("../ai/research-prospect", () => ({ researchProspect: h.researchProspect }));
vi.mock("../scoring/score-prospect", () => ({ scoreProspect: h.scoreProspect }));
vi.mock("./queries", () => ({ listProspects: h.listProspects }));

const { UsageLimitExceededError } = await import("../usage/limits");
const { bulkResearchProspects, bulkScoreProspects, bulkResultMessage } = await import("./bulk-actions");

const WORKSPACE = "w1";

function prospects(...rows: { id: string; stage: string }[]) {
  h.listProspects.mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.researchProspect.mockResolvedValue(undefined);
  h.scoreProspect.mockResolvedValue(undefined);
});

// DISC-PROS-P0-08.2: the page says why each one was not done.
describe("why the rest were not done", () => {
  it("counts the already researched apart from the not-ready and the failed", async () => {
    prospects({ id: "a", stage: "researched" }, { id: "b", stage: "scored" }, { id: "c", stage: "new" }, { id: "d", stage: "new" });
    h.researchProspect.mockImplementation(async (id: string) => {
      if (id === "d") throw new Error("model down");
    });
    expect(await bulkResearchProspects(WORKSPACE, ["a", "b", "c", "d"])).toEqual({
      completed: 1, skipped: 3, alreadyDone: 2, notReady: 0, failed: 1, notAttempted: 0, limitReached: false,
    });
  });

  it("counts prospects that need research first when scoring", async () => {
    prospects({ id: "a", stage: "new" }, { id: "b", stage: "researched" }, { id: "c", stage: "scored" });
    expect(await bulkScoreProspects(WORKSPACE, ["a", "b", "c"])).toEqual({
      completed: 1, skipped: 2, alreadyDone: 1, notReady: 1, failed: 0, notAttempted: 0, limitReached: false,
    });
  });

  it("counts those never tried once the usage ceiling stops the batch", async () => {
    prospects({ id: "a", stage: "new" }, { id: "b", stage: "new" }, { id: "c", stage: "new" });
    h.researchProspect.mockImplementation(async (id: string) => {
      if (id === "b") throw new UsageLimitExceededError("runs");
    });
    expect(await bulkResearchProspects(WORKSPACE, ["a", "b", "c"])).toMatchObject({ completed: 1, notAttempted: 2, failed: 0, limitReached: true });
  });
});

describe("bulkResearchProspects", () => {
  it("researches only the selected prospects still at the 'new' stage", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "researched" }, { id: "p3", stage: "new" });

    const result = await bulkResearchProspects(WORKSPACE, ["p1", "p2", "p3"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(2);
    expect(h.researchProspect).toHaveBeenCalledWith("p1");
    expect(h.researchProspect).toHaveBeenCalledWith("p3");
    expect(result).toMatchObject({ completed: 2, skipped: 1, limitReached: false });
  });

  it("ignores prospects that were not selected, even if eligible", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "other", stage: "new" });

    await bulkResearchProspects(WORKSPACE, ["p1"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(1);
    expect(h.researchProspect).toHaveBeenCalledWith("p1");
  });

  it("counts everything selected but not completed as skipped", async () => {
    prospects({ id: "p1", stage: "researched" }, { id: "p2", stage: "sent" });

    await expect(bulkResearchProspects(WORKSPACE, ["p1", "p2"])).resolves.toMatchObject({
      completed: 0,
      skipped: 2,
      limitReached: false,
    });
  });

  it("stops the batch as soon as the usage ceiling is hit", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "new" }, { id: "p3", stage: "new" });
    h.researchProspect
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new UsageLimitExceededError("runs"));

    const result = await bulkResearchProspects(WORKSPACE, ["p1", "p2", "p3"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ completed: 1, skipped: 2, limitReached: true });
  });

  it("keeps going after a single prospect fails for any other reason", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "new" }, { id: "p3", stage: "new" });
    h.researchProspect.mockRejectedValueOnce(new Error("provider hiccup"));

    const result = await bulkResearchProspects(WORKSPACE, ["p1", "p2", "p3"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ completed: 2, skipped: 1, limitReached: false });
  });

  it("runs sequentially, so the ceiling check inside each call can stop the rest", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "new" });
    const order: string[] = [];
    h.researchProspect.mockImplementation(async (id: string) => {
      order.push(`start:${id}`);
      await Promise.resolve();
      order.push(`end:${id}`);
    });

    await bulkResearchProspects(WORKSPACE, ["p1", "p2"]);

    expect(order).toEqual(["start:p1", "end:p1", "start:p2", "end:p2"]);
  });

  it("does nothing for an empty selection", async () => {
    prospects({ id: "p1", stage: "new" });

    await expect(bulkResearchProspects(WORKSPACE, [])).resolves.toMatchObject({
      completed: 0,
      skipped: 0,
      limitReached: false,
    });
    expect(h.researchProspect).not.toHaveBeenCalled();
  });
});

describe("bulkScoreProspects", () => {
  it("scores only the selected prospects at the 'researched' stage", async () => {
    prospects({ id: "p1", stage: "researched" }, { id: "p2", stage: "new" });

    const result = await bulkScoreProspects(WORKSPACE, ["p1", "p2"]);

    expect(h.scoreProspect).toHaveBeenCalledTimes(1);
    expect(h.scoreProspect).toHaveBeenCalledWith("p1");
    expect(result).toMatchObject({ completed: 1, skipped: 1, limitReached: false });
  });

  it("never calls the research action", async () => {
    prospects({ id: "p1", stage: "researched" });

    await bulkScoreProspects(WORKSPACE, ["p1"]);

    expect(h.researchProspect).not.toHaveBeenCalled();
  });

  it("propagates a failed prospect listing", async () => {
    h.listProspects.mockRejectedValue(new Error("denied"));

    await expect(bulkScoreProspects(WORKSPACE, ["p1"])).rejects.toThrow("denied");
  });
});

// DISC-PROS-P0-08.2: the reported "Researched 0 prospects. Skipped 4 (not eligible for this
// step, or failed)" after ticking four already-researched channels.
describe("bulkResultMessage", () => {
  const base = { completed: 0, alreadyDone: 0, notReady: 0, failed: 0, limitReached: false };

  it("says the ticked ones were already researched, and what to do next", () => {
    expect(bulkResultMessage({ ...base, action: "research", alreadyDone: 4 })).toBe("4 were already researched: use Score selected next.");
  });

  it("says what was done and why the rest were not", () => {
    expect(bulkResultMessage({ ...base, action: "research", completed: 2, alreadyDone: 1, failed: 1 })).toBe(
      "Researched 2 prospects. 1 was already researched. 1 failed: open it to try again.",
    );
    expect(bulkResultMessage({ ...base, action: "score", completed: 1, notReady: 2, alreadyDone: 1 })).toBe(
      "Scored 1 prospect. 1 was already scored. 2 need research first.",
    );
  });

  it("says when the monthly limit stopped it", () => {
    expect(bulkResultMessage({ ...base, action: "research", completed: 1, limitReached: true })).toBe(
      "Researched 1 prospect. Stopped early: this workspace reached its monthly AI usage limit.",
    );
  });

  it("never reports a bare skip", () => {
    expect(bulkResultMessage({ ...base, action: "score" })).toBe("Nothing to score among those selected.");
  });
});

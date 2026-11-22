/**
 * DISC-NAV-P0-01.11: the one next step toward new customers. The owner saw "Review your
 * prospects" on Define for an offering whose 10 channels were all researched and unscored:
 * the step there is to score them.
 */
import { describe, expect, it } from "vitest";
import { nextStep, reachGroups, stepsDone, type NextStepInput } from "./next-step";

const BASE = "/acme/discovery/offerings/o1";
const p = (id: string, stage: string, nextAction: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, stage, nextAction, isStuck: false, ...extra }) as NextStepInput["picked"][number];
const base: NextStepInput = { basePath: BASE, hasProfile: true, icpStatus: "approved", picked: [], suggestionCount: 0, waitingToPick: 0, hasCampaign: false };

describe("nextStep", () => {
  it("finishes Define first", () => {
    expect(nextStep({ ...base, hasProfile: false })).toMatchObject({ step: "define", label: "Describe what you sell" });
    expect(nextStep({ ...base, icpStatus: null })).toMatchObject({ step: "define", label: "Define your ideal customer", href: `${BASE}/icp` });
    expect(nextStep({ ...base, icpStatus: "draft" })).toMatchObject({ step: "define", label: "Approve your ideal customer" });
  });

  it("says to score researched channels, as in the owner's report", () => {
    const picked = Array.from({ length: 10 }, (_, i) => p(`c${i}`, "researched", "Score", { kind: "channel" }));
    expect(nextStep({ ...base, picked })).toEqual({ step: "reach", label: "Score 10 channels", href: `${BASE}/prospects?list=channels#reach-score` });
  });

  it("works on those closest to becoming customers first", () => {
    const picked = [p("a", "new", "Research"), p("b", "replied", "Generate reply"), p("c", "messaged", "Review message")];
    expect(nextStep({ ...base, picked }).label).toBe("Answer 1 reply");
    expect(nextStep({ ...base, picked: picked.slice(0, 1).concat(picked[2]!) }).label).toBe("Send 1 ready message");
  });

  it("opens the one prospect at its step when there is only one", () => {
    expect(nextStep({ ...base, picked: [p("x", "new", "Research")] })).toEqual({ step: "reach", label: "Research 1 prospect", href: `${BASE}/prospects/x#research` });
  });

  it("says write to channels for channels", () => {
    const picked = [p("a", "scored", "Generate strategy", { kind: "channel" }), p("b", "scored", "Generate strategy", { kind: "channel" })];
    expect(nextStep({ ...base, picked }).label).toBe("Write to 2 channels");
  });

  // DISC-NAV-P0-01.13
  it("never suggests a campaign for channels, which campaigns can't email", () => {
    expect(nextStep({ ...base, picked: [p("a", "sent", null, { kind: "channel" })] })).toMatchObject({ label: "Find more prospects" });
  });

  it("groups the Reach list under the Next line's own words, in its order", () => {
    const groups = reachGroups([
      p("a", "researched", "Score", { kind: "channel" }),
      p("b", "scored", "Generate strategy", { kind: "channel" }),
      p("c", "researched", "Score", { kind: "channel" }),
      p("d", "sent", null),
      p("e", "closed", null),
    ]);
    expect(groups.map((g) => [g.id, g.title, g.prospects.length])).toEqual([
      ["write", "Write to 1 channel", 1],
      ["score", "Score 2 channels", 2],
      ["waiting", "Waiting for a reply (1)", 1],
      ["closed", "Closed (1)", 1],
    ]);
  });

  it("follows up only on prospects not already in a running campaign", () => {
    const stuck = p("a", "sent", null, { isStuck: true });
    expect(nextStep({ ...base, picked: [stuck], hasCampaign: true }).label).toBe("Follow up with 1 prospect");
    expect(nextStep({ ...base, picked: [{ ...stuck, inActiveCampaign: true }], hasCampaign: true }).label).toBe("Find more prospects");
  });

  it("brings in more when nothing is waiting on Reach", () => {
    expect(nextStep({ ...base, suggestionCount: 3 })).toMatchObject({ step: "find", label: "Review 3 found prospects" });
    expect(nextStep({ ...base, waitingToPick: 2 })).toMatchObject({ step: "find", label: "Pick from 2 imported prospects" });
    expect(nextStep(base)).toMatchObject({ step: "find", label: "Find prospects" });
    expect(nextStep({ ...base, picked: [p("a", "sent", null)] })).toMatchObject({ step: "reach", label: "Start a campaign to reach them all" });
  });
});

// DISC-NAV-P0-01.12: which steps get a green tick.

describe("stepsDone", () => {
  const p = (stage: "new" | "sent" | "closed", outcome: "open" | "won" = "open") => ({ id: "x", stage, nextAction: null, isStuck: false, outcome });
  it("needs an approved ideal customer for Define", () => {
    expect(stepsDone({ hasProfile: true, icpStatus: "draft", picked: [] }).define).toBe(false);
    expect(stepsDone({ hasProfile: true, icpStatus: "approved", picked: [] }).define).toBe(true);
  });
  it("ticks Find once something is picked, Reach once written to, Results once won", () => {
    expect(stepsDone({ hasProfile: true, icpStatus: "approved", picked: [p("new")] })).toEqual({ define: true, find: true, reach: false, results: false });
    expect(stepsDone({ hasProfile: true, icpStatus: "approved", picked: [p("sent")] }).reach).toBe(true);
    expect(stepsDone({ hasProfile: true, icpStatus: "approved", picked: [p("closed", "won")] }).results).toBe(true);
  });
});

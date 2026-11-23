import { beforeEach, describe, expect, it, vi } from "vitest";
import { needsAiSetup, prepQueue, prepStepOf, runPrepStep, stepsLeft, stopsTheRun } from "./prep";
import { AiProviderError } from "../ai/router";
import { DailySendLimitReached, LeftForPerson } from "../auto-send/send";
import { UsageLimitExceededError } from "../usage/limits";

// DISC-AUTO-P0-01.1
const p = (id: string, nextAction: string | null) => ({ id, company_name: id, nextAction });

describe("prep queue", () => {
  it("prepares only prospects with a preparation step left; sending and replies stay the person's", () => {
    expect(prepStepOf(p("a", "Review message"))).toBeNull();
    expect(prepStepOf(p("b", "Generate reply"))).toBeNull();
    expect(prepStepOf(p("c", null))).toBeNull();
    expect(prepStepOf(p("d", "Approve strategy"))).toBe("approve");
  });

  it("finishes the prospect closest to a draft first, and leaves out skipped ones", () => {
    const queue = prepQueue([p("new", "Research"), p("scored", "Generate strategy"), p("planned", "Generate message"), p("sent", null)], ["scored"]);
    expect(queue.map((x) => x.id)).toEqual(["planned", "new"]);
  });
});

const calls: string[] = [];
const draftOutcome = { status: "completed", message: "The draft was refused." };
vi.mock("../channels/drafts", () => ({
  generateChannelDraft: vi.fn(async (id: string, variant: string) => {
    calls.push(`draft:${id}:${variant}`);
    return draftOutcome;
  }),
}));
vi.mock("../ai/research-prospect", () => ({ researchProspect: vi.fn(async (id: string) => calls.push(`research:${id}`)) }));
vi.mock("../scoring/score-prospect", () => ({ scoreProspect: vi.fn(async (id: string) => calls.push(`score:${id}`)) }));
vi.mock("../ai/generate-strategy", () => ({ generateOutreachStrategy: vi.fn(async (id: string) => calls.push(`strategy:${id}`)) }));
vi.mock("../ai/generate-message", () => ({ generateOutreachMessage: vi.fn(async (id: string) => calls.push(`message:${id}`)) }));
vi.mock("../outreach/mutations", () => ({ approveOutreachStrategy: vi.fn(async (id: string) => calls.push(`approve:${id}`)) }));
vi.mock("../outreach/queries", () => ({ getLatestOutreachStrategy: vi.fn(async (id: string) => (id === "none" ? null : { id: `s-${id}` })) }));
vi.mock("../pipeline/incremental", () => ({ applyIncrementalSignalUpdate: vi.fn(async () => { throw new Error("recompute failed"); }) }));

// DISC-REACH-P0-01.1: a channel is written to by the way it can be reached.
describe("a channel", () => {
  const channel = (nextAction: string | null, extra: Record<string, unknown> = {}) => ({ ...p("c", nextAction), kind: "channel" as const, ...extra });

  it("skips the plan step and is written to once scored", () => {
    expect(prepStepOf(channel("Generate strategy"))).toBe("message");
    expect(stepsLeft(channel("Research"))).toBe(3);
  });

  it("gets a direct message when its email draft has nowhere to go and it is on a platform", () => {
    const stuck = channel("Review message", { reach: "needs_email", dmPlatform: "instagram", hasContactEmail: false });
    expect(prepStepOf(stuck)).toBe("message");
    expect(stepsLeft(stuck, { autoSend: true })).toBe(1);
    expect(prepStepOf(channel("Review message", { reach: "instagram", dmPlatform: "instagram" }))).toBeNull();
    expect(prepStepOf(channel("Review message", { reach: "needs_email", dmPlatform: null }))).toBeNull();
  });

  it("is never sent automatically unless it is an email with an address", () => {
    expect(prepStepOf(channel("Review message", { reach: "instagram", dmPlatform: "instagram" }), { autoSend: true })).toBeNull();
    expect(prepStepOf(channel("Review message", { reach: "email", hasContactEmail: true }), { autoSend: true })).toBe("send");
  });

  it("writes a direct message or an email pitch, and fails plainly when the draft is refused", async () => {
    calls.length = 0;
    await runPrepStep("w", channel("Generate strategy", { dmPlatform: "instagram", hasContactEmail: false }));
    await runPrepStep("w", channel("Generate strategy", { dmPlatform: null }));
    await runPrepStep("w", channel("Generate strategy", { dmPlatform: "instagram", hasContactEmail: true }));
    expect(calls).toEqual(["draft:c:dm", "draft:c:pitch", "draft:c:pitch"]);
    draftOutcome.status = "failed";
    await expect(runPrepStep("w", channel("Generate strategy"))).rejects.toThrow("refused");
    draftOutcome.status = "completed";
  });
});

// DISC-AUTO-P0-01.3: the progress bar counts steps, not prospects.
describe("stepsLeft", () => {
  it("counts the steps from where each prospect is, plus the send when it is on", () => {
    expect(stepsLeft(p("a", "Research"))).toBe(5);
    expect(stepsLeft(p("a", "Generate message"))).toBe(1);
    expect(stepsLeft(p("a", "Research"), { autoSend: true })).toBe(6);
    expect(stepsLeft(p("a", "Review message"), { autoSend: true })).toBe(1);
    expect(stepsLeft(p("a", "Review message"))).toBe(0);
  });
});

// DISC-AUTO-P0-03.1
describe("with Send automatically", () => {
  it("sends a written first message, before anything else; without it, sending stays the person's", () => {
    expect(prepStepOf(p("a", "Review message"), { autoSend: true })).toBe("send");
    expect(prepStepOf(p("a", "Review message"))).toBeNull();
    expect(prepStepOf(p("b", "Retry send"), { autoSend: true })).toBeNull();
    expect(prepStepOf(p("c", "Generate reply"), { autoSend: true })).toBeNull();
    expect(prepQueue([p("r", "Research"), p("s", "Review message")], [], { autoSend: true }).map((x) => x.id)).toEqual(["s", "r"]);
  });

  it("stops the run at the daily send limit", () => {
    expect(stopsTheRun(new DailySendLimitReached(30))).toBe(true);
    expect(stopsTheRun(new LeftForPerson("Not an email"))).toBe(false);
  });
});

describe("runPrepStep", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("runs exactly the prospect's next step, and only drafts a message (never sends)", async () => {
    await runPrepStep("w", p("a", "Research"));
    await runPrepStep("w", p("b", "Score"));
    await runPrepStep("w", p("c", "Generate strategy"));
    await runPrepStep("w", p("d", "Approve strategy"));
    await runPrepStep("w", p("e", "Generate message"));
    expect(calls).toEqual(["research:a", "score:b", "strategy:c", "approve:s-d", "message:s-e"]);
  });

  it("does nothing for a step that is the person's (sending, answering)", async () => {
    expect(await runPrepStep("w", p("a", "Review message"))).toBeNull();
    expect(await runPrepStep("w", p("b", "Generate reply"))).toBeNull();
    expect(calls).toEqual([]);
  });

  it("keeps the research when the follow-on recompute fails, and fails plainly without a plan", async () => {
    await expect(runPrepStep("w", p("a", "Research"))).resolves.toBe("research");
    await expect(runPrepStep("w", p("none", "Generate message"))).rejects.toThrow("No outreach plan");
  });

  // DISC-AUTO-P0-01.2: seen live: a refused key failed 25 prospects one by one.
  it("stops on failures that would fail every prospect, and skips only one-prospect failures", () => {
    expect(stopsTheRun(new UsageLimitExceededError("runs"))).toBe(true);
    expect(stopsTheRun(new AiProviderError("invalid_key", "Your anthropic API key could not complete this request."))).toBe(true);
    expect(stopsTheRun(new AiProviderError("no_provider_connected", "No AI provider"))).toBe(true);
    expect(stopsTheRun(new AiProviderError("rate_limited", "Slow down"))).toBe(true);
    expect(stopsTheRun(new AiProviderError("no_content_found", "Nothing on the site"))).toBe(false);
    expect(stopsTheRun(new Error("No outreach plan to write from."))).toBe(false);
    expect(needsAiSetup(new AiProviderError("invalid_key", "x"))).toBe(true);
    expect(needsAiSetup(new UsageLimitExceededError("cost"))).toBe(false);
  });
});

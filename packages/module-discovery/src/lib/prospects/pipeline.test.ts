import { describe, expect, it } from "vitest";
import {
  computeConversionFunnel,
  deriveProspectPipelineState,
  latestTimestamp,
  type ProspectPipelineSignals,
  openSectionFor,
} from "./pipeline";

const baseSignals: ProspectPipelineSignals = {
  hasResearch: false,
  hasScore: false,
  latestStrategyStatus: null,
  hasUnsentMessage: false,
  hasFailedMessage: false,
  hasSentMessage: false,
  latestConversationStatus: null,
  lastActivityAt: new Date().toISOString(),
};

describe("deriveProspectPipelineState", () => {
  it("starts at 'new' with no signals", () => {
    expect(deriveProspectPipelineState(baseSignals).stage).toBe("new");
  });

  it("progresses through research -> score -> strategy -> message -> sent", () => {
    expect(deriveProspectPipelineState({ ...baseSignals, hasResearch: true }).stage).toBe(
      "researched",
    );
    expect(
      deriveProspectPipelineState({ ...baseSignals, hasResearch: true, hasScore: true }).stage,
    ).toBe("scored");
    expect(
      deriveProspectPipelineState({ ...baseSignals, hasScore: true, latestStrategyStatus: "approved" })
        .stage,
    ).toBe("strategized");
    expect(deriveProspectPipelineState({ ...baseSignals, hasUnsentMessage: true }).stage).toBe(
      "messaged",
    );
    expect(deriveProspectPipelineState({ ...baseSignals, hasSentMessage: true }).stage).toBe("sent");
  });

  it("a reply always wins over a merely-sent message", () => {
    const state = deriveProspectPipelineState({
      ...baseSignals,
      hasSentMessage: true,
      latestConversationStatus: "replied",
    });
    expect(state.stage).toBe("replied");
    expect(state.nextAction).toBe("Generate reply");
  });

  it("closed has no next action", () => {
    const state = deriveProspectPipelineState({
      ...baseSignals,
      latestConversationStatus: "closed",
    });
    expect(state.nextAction).toBeNull();
  });

  it("a failed message recommends retrying the send", () => {
    const state = deriveProspectPipelineState({
      ...baseSignals,
      hasUnsentMessage: true,
      hasFailedMessage: true,
    });
    expect(state.nextAction).toBe("Retry send");
  });

  it("flags a prospect stuck past the threshold, but never once replied or closed", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(deriveProspectPipelineState({ ...baseSignals, lastActivityAt: eightDaysAgo }).isStuck).toBe(
      true,
    );
    expect(
      deriveProspectPipelineState({
        ...baseSignals,
        lastActivityAt: eightDaysAgo,
        latestConversationStatus: "closed",
      }).isStuck,
    ).toBe(false);
  });
});

describe("computeConversionFunnel", () => {
  it("computes reply and close rates from a set of derived stages", () => {
    const funnel = computeConversionFunnel([
      { stage: "sent" },
      { stage: "sent" },
      { stage: "replied" },
      { stage: "closed" },
    ]);
    expect(funnel.total).toBe(4);
    // sent-or-further: all 4 reach "sent" (replied/closed both come after sent in PROSPECT_STAGES)
    expect(funnel.steps.find((s) => s.stage === "sent")?.reached).toBe(4);
    expect(funnel.replyRate).toBe(50); // 2 of 4 reached replied-or-further
    expect(funnel.closeRate).toBe(25); // 1 of 4 reached closed
  });

  it("returns zero rates for an empty set without dividing by zero", () => {
    const funnel = computeConversionFunnel([]);
    expect(funnel.replyRate).toBe(0);
    expect(funnel.closeRate).toBe(0);
  });
});

describe("latestTimestamp", () => {
  it("returns the latest of several ISO timestamps", () => {
    expect(latestTimestamp("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z", "2026-03-01T00:00:00Z")).toBe(
      "2026-06-01T00:00:00Z",
    );
  });

  it("ignores null and undefined entries", () => {
    expect(latestTimestamp(null, "2026-01-01T00:00:00Z", undefined)).toBe("2026-01-01T00:00:00Z");
  });
});

// DISC-REACH-P0-01.3: the page opens on the section holding what there is to do.
describe("openSectionFor", () => {
  const base = { nextAction: null as string | null, hasUnsentMessage: false, hasConversation: false, isChannel: false };

  it("opens Messages whenever a message waits, whatever else is undone", () => {
    expect(openSectionFor({ ...base, nextAction: "Review message", hasUnsentMessage: true })).toBe("messages");
    // An imported prospect with a draft but no research: the draft is still what To do linked to.
    expect(openSectionFor({ ...base, nextAction: "Research", hasUnsentMessage: true })).toBe("messages");
  });

  it("opens Conversations for a reply to answer or a sent message to follow up", () => {
    expect(openSectionFor({ ...base, nextAction: "Generate reply", hasUnsentMessage: true, hasConversation: true })).toBe("conversations");
    expect(openSectionFor({ ...base, hasConversation: true })).toBe("conversations");
  });

  it("otherwise opens the step still to do; a channel has no plan step", () => {
    expect(openSectionFor({ ...base, nextAction: "Research" })).toBe("research");
    expect(openSectionFor({ ...base, nextAction: "Score" })).toBe("score");
    expect(openSectionFor({ ...base, nextAction: "Approve strategy" })).toBe("strategy");
    expect(openSectionFor({ ...base, nextAction: "Generate strategy", isChannel: true })).toBe("messages");
    expect(openSectionFor({ ...base, nextAction: "Generate message" })).toBe("messages");
  });
});

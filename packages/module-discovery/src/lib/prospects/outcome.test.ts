import { describe, expect, it } from "vitest";
import {
  computeDiscoveryOutcomeStage,
  outcomeStageLabel,
  prospectOutcomeLabel,
  type DiscoveryOutcomeStageInput,
} from "./outcome";

const BASE: DiscoveryOutcomeStageInput = {
  hasResearch: false,
  prospectStatus: "new",
  hasSentMessage: false,
  hasConversation: false,
  handedOffToCrm: false,
  downstreamLeadStatus: null,
  prospectOutcome: "open",
};

describe("computeDiscoveryOutcomeStage", () => {
  it("defaults to discovered when nothing else is true", () => {
    expect(computeDiscoveryOutcomeStage(BASE)).toBe("discovered");
  });

  it("reports reviewed once research exists", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, hasResearch: true })).toBe("reviewed");
  });

  it("reports accepted once the founder qualifies the prospect", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, hasResearch: true, prospectStatus: "qualified" })).toBe("accepted");
  });

  it("reports contacted once a message has been sent, even without acceptance", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, hasSentMessage: true })).toBe("contacted");
  });

  it("reports conversation over contacted", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, hasSentMessage: true, hasConversation: true })).toBe("conversation");
  });

  it("reports crm_handoff over conversation", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, hasConversation: true, handedOffToCrm: true })).toBe("crm_handoff");
  });

  it("reports Discovery's own outcome (won/lost) even without a CRM handoff", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, prospectOutcome: "won" })).toBe("won");
    expect(computeDiscoveryOutcomeStage({ ...BASE, prospectOutcome: "lost" })).toBe("lost");
  });

  it("reports the downstream CRM lead's own qualified/nurture status over a mere handoff", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, handedOffToCrm: true, downstreamLeadStatus: "qualified" })).toBe("qualified");
    expect(computeDiscoveryOutcomeStage({ ...BASE, handedOffToCrm: true, downstreamLeadStatus: "nurture" })).toBe("nurture");
  });

  it("lets the downstream CRM lead's own won/lost outrank Discovery's own outcome field", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, prospectOutcome: "open", downstreamLeadStatus: "won" })).toBe("won");
    expect(computeDiscoveryOutcomeStage({ ...BASE, prospectOutcome: "open", downstreamLeadStatus: "lost" })).toBe("lost");
  });

  it("treats any other CRM lead status (new/contacted/opportunity/unresponsive/disqualified) as no reportable downstream outcome yet", () => {
    expect(computeDiscoveryOutcomeStage({ ...BASE, handedOffToCrm: true, downstreamLeadStatus: "opportunity" })).toBe("crm_handoff");
  });
});

// DISC-CONS-P0-02.2 (B5.2.5): a channel reuses the stages and outcome; "won" reads "Live".
describe("outcome words for a channel", () => {
  it("labels won as Live for a channel only", () => {
    expect(outcomeStageLabel("won", "channel")).toBe("Live");
    expect(outcomeStageLabel("won", "company")).toBe("Won");
    expect(outcomeStageLabel("won")).toBe("Won");
    expect(outcomeStageLabel("lost", "channel")).toBe("Lost");
    expect(prospectOutcomeLabel("won", "channel")).toBe("Live");
    expect(prospectOutcomeLabel("won", null)).toBe("Won");
  });
});

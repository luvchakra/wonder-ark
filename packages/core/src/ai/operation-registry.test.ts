import { describe, expect, it } from "vitest";
import { getOperationSpec, type AiOperation } from "./operation-registry";

const OPERATIONS: AiOperation[] = [
  "understand_product",
  "generate_icp",
  "generate_consumer_icp",
  "summarize_audience_feedback",
  "research_prospect",
  "discover_prospects",
  "generate_outreach_strategy",
  "generate_outreach_message",
  "write_campaign_messages",
  "write_opening_line",
  "generate_reply",
  "classify_reply",
  "chat",
  "draft_review_response",
];

describe("getOperationSpec", () => {
  it("has a spec for every declared operation", () => {
    for (const operation of OPERATIONS) {
      const spec = getOperationSpec(operation);
      expect(["fast", "balanced", "reasoning"]).toContain(spec.qualityTier);
      expect(typeof spec.requiresWebSearch).toBe("boolean");
    }
  });

  it("requires web search only for operations that actually research something", () => {
    expect(getOperationSpec("understand_product").requiresWebSearch).toBe(true);
    expect(getOperationSpec("research_prospect").requiresWebSearch).toBe(true);
    expect(getOperationSpec("discover_prospects").requiresWebSearch).toBe(true);
    expect(getOperationSpec("chat").requiresWebSearch).toBe(false);
  });
});

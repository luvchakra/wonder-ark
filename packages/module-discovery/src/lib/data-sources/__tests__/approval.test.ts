/**
 * DISC-DATA-P0-04.1: every approval queues enrichment the same way. Pinned here:
 *  - one `discovery.prospect.enrichment_requested` event per approved company, gated on
 *    the Discovery licence, whichever caller approved (the To review list, AI
 *    Discovery's automatic approval and first-setup auto-populate all call this);
 *  - a channel is never queued, and nothing is queued without gateway settings;
 *  - a publish that fails does not undo or fail the approval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  approve: vi.fn(),
  publish: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
}));

vi.mock("../../prospects/mutations", () => ({
  approveProspectSuggestionsWithProspects: h.approve,
  extractDomain: vi.fn(),
}));
vi.mock("@cofounderai/core/events/mutations", () => ({ publish: h.publish }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: vi.fn() }));
vi.mock("../../../db/server", () => ({ createClient: vi.fn() }));
vi.mock("../../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));
vi.mock("../../usage/limits", () => ({ assertWithinUsageLimit: vi.fn(), UsageLimitExceededError: class extends Error {} }));
vi.mock("../../ai/discovery-lock", () => ({
  acquireDiscoveryLock: vi.fn(),
  releaseDiscoveryLock: vi.fn(),
  DiscoveryInProgressError: class extends Error {},
}));

const { approveSuggestionsAndQueueEnrichment } = await import("../approval");
const { ENRICHMENT_REQUESTED_EVENT } = await import("../enrichment");

const approved = {
  added: 3,
  duplicates: 1,
  prospects: [
    { id: "p1", kind: "company" },
    { id: "p2", kind: "channel" },
    { id: "p3" },
  ],
};

beforeEach(() => {
  vi.stubEnv("WORKSLAKE_GATEWAY_URL", "https://gateway.example");
  vi.stubEnv("WORKSLAKE_GATEWAY_API_KEY", "test-key");
  h.approve.mockResolvedValue(approved);
  h.getBusinessIdForWorkspace.mockResolvedValue("b1");
  h.publish.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("approveSuggestionsAndQueueEnrichment", () => {
  it("queues one licence-gated event per approved company and skips channels", async () => {
    const result = await approveSuggestionsAndQueueEnrichment("w1", ["s1", "s2", "s3", "s4"]);

    expect(h.approve).toHaveBeenCalledWith("w1", ["s1", "s2", "s3", "s4"]);
    expect(h.publish.mock.calls.map(([input]) => input)).toEqual([
      { businessId: "b1", type: ENRICHMENT_REQUESTED_EVENT, payload: { prospectId: "p1" }, requiredModule: "discovery" },
      { businessId: "b1", type: ENRICHMENT_REQUESTED_EVENT, payload: { prospectId: "p3" }, requiredModule: "discovery" },
    ]);
    expect(result).toMatchObject({ added: 3, duplicates: 1, enrichmentQueuedFor: ["p1", "p3"] });
  });

  it("queues nothing without gateway settings: there is nothing to ask", async () => {
    vi.stubEnv("WORKSLAKE_GATEWAY_URL", "");
    const result = await approveSuggestionsAndQueueEnrichment("w1", ["s1"]);
    expect(h.publish).not.toHaveBeenCalled();
    expect(result.enrichmentQueuedFor).toEqual([]);
    expect(result.added).toBe(3);
  });

  it("keeps the approval when the event cannot be published", async () => {
    h.publish.mockRejectedValue(new Error("queue down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await approveSuggestionsAndQueueEnrichment("w1", ["s1"]);
    expect(result).toMatchObject({ added: 3, enrichmentQueuedFor: [] });
    error.mockRestore();
  });

  it("queues nothing when nothing was approved", async () => {
    h.approve.mockResolvedValue({ added: 0, duplicates: 2, prospects: [] });
    const result = await approveSuggestionsAndQueueEnrichment("w1", ["s1"]);
    expect(h.publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({ added: 0, duplicates: 2, enrichmentQueuedFor: [] });
  });
});

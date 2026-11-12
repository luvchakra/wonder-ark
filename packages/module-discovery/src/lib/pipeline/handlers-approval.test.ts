/**
 * DISC-AI-APPROVAL-01: "Run AI Discovery" in both approval modes. "Review each step"
 * leaves a fresh ICP unapproved and found accounts as suggestions (no prospects), and
 * tells the route to stop the run as awaiting approval; "Approve automatically" keeps the
 * behaviour from before this story.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  generateIcp: vi.fn(),
  approveIcpProfile: vi.fn(),
  discoverProspects: vi.fn(),
  approveProspectSuggestions: vi.fn(),
}));

vi.mock("../ai/understand-product", () => ({ understandProduct: vi.fn() }));
vi.mock("../ai/generate-icp", () => ({ generateIcp: h.generateIcp }));
vi.mock("../ai/discover-prospects", () => ({ discoverProspects: h.discoverProspects }));
vi.mock("../ai/research-prospect", () => ({ researchProspect: vi.fn() }));
vi.mock("../ai/generate-research-brief", () => ({ generateResearchBrief: vi.fn() }));
vi.mock("../tenancy/queries", () => ({ getProduct: vi.fn() }));
vi.mock("../icp/queries", () => ({ getIcpProfile: vi.fn() }));
vi.mock("../icp/mutations", () => ({ approveIcpProfile: h.approveIcpProfile }));
vi.mock("../personas/mutations", () => ({ seedBuyerPersonasFromIcp: vi.fn() }));
vi.mock("../personas/queries", () => ({ listBuyerPersonas: vi.fn() }));
vi.mock("../discovery-definitions/mutations", () => ({ seedDiscoveryDefinitionFromIcp: vi.fn() }));
vi.mock("../discovery-definitions/queries", () => ({ listDiscoveryDefinitions: vi.fn() }));
vi.mock("../data-sources/approval", () => ({ approveSuggestionsAndQueueEnrichment: h.approveProspectSuggestions }));
vi.mock("../prospects/queries", () => ({ listProspects: vi.fn() }));
vi.mock("../contacts/queries", () => ({ listContacts: vi.fn() }));
vi.mock("../messages/queries", () => ({ listMessages: vi.fn() }));
vi.mock("../negative-signals/mutations", () => ({ syncNegativeSignalsForProspect: vi.fn() }));
vi.mock("../negative-signals/queries", () => ({ listNegativeSignalsForProspect: vi.fn() }));
vi.mock("../signals/mutations", () => ({ correlateSignalsForProspect: vi.fn(), syncSignalsFromResearch: vi.fn() }));
vi.mock("../buyer-intelligence/intelligence", () => ({ computeBuyerIntelligence: vi.fn() }));
vi.mock("../buyer-intelligence/scoring", () => ({ computeBuyerFitScores: vi.fn() }));
vi.mock("../opportunities/mutations", () => ({
  createOpportunity: vi.fn(),
  attachSignalCorrelation: vi.fn(),
  setOpportunityWhyNow: vi.fn(),
  setOpportunityBuyerIntelligence: vi.fn(),
  setOpportunityNextBestAction: vi.fn(),
}));
vi.mock("../opportunities/queries", () => ({ listOpportunities: vi.fn() }));

const { runIcpStage, runAccountDiscoveryStage } = await import("./handlers");

const DRAFT_ICP = { id: "icp1", status: "draft", industries: ["a"], roles: ["b"], confidence: 0.9 };
const review = { workspaceId: "w1", productId: "p1", aiApprovalMode: "review" as const };
const auto = { workspaceId: "w1", productId: "p1", aiApprovalMode: "auto" as const };

beforeEach(() => {
  vi.clearAllMocks();
  h.generateIcp.mockResolvedValue(DRAFT_ICP);
  h.approveIcpProfile.mockResolvedValue({ ...DRAFT_ICP, status: "approved" });
  h.discoverProspects.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
  h.approveProspectSuggestions.mockResolvedValue({ added: 2, duplicates: 0, prospects: [], enrichmentQueuedFor: [] });
});

describe("runIcpStage", () => {
  it("review mode: a fresh ICP stays a draft and the run stops for approval", async () => {
    const result = await runIcpStage(review);
    expect(h.approveIcpProfile).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "completed", reviewLevel: "needs_review", awaitingApproval: true });
    expect(result.detail).toContain("draft");
  });

  it("review mode: an ICP the founder already approved is reused and the run continues", async () => {
    h.generateIcp.mockResolvedValue({ ...DRAFT_ICP, status: "approved", confidence: null });
    const result = await runIcpStage(review);
    expect(h.approveIcpProfile).not.toHaveBeenCalled();
    expect(result.awaitingApproval).toBeUndefined();
    expect(result.reviewLevel).toBe("automated");
  });

  it("auto mode: approves the ICP and the run continues (today's behaviour)", async () => {
    const result = await runIcpStage(auto);
    expect(h.approveIcpProfile).toHaveBeenCalledWith("icp1");
    expect(result.awaitingApproval).toBeUndefined();
    expect(result.detail).toContain("ICP ready");
  });
});

describe("runAccountDiscoveryStage", () => {
  it("review mode: found accounts stay suggestions, no prospects added, run stops for approval", async () => {
    const result = await runAccountDiscoveryStage(review);
    expect(h.discoverProspects).toHaveBeenCalledWith("w1", undefined, 10);
    expect(h.approveProspectSuggestions).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "completed", reviewLevel: "needs_review", awaitingApproval: true });
    expect(result.detail).toContain("2 account(s) suggested");
  });

  it("auto mode: approves every found account into a prospect (today's behaviour)", async () => {
    const result = await runAccountDiscoveryStage(auto);
    expect(h.approveProspectSuggestions).toHaveBeenCalledWith("w1", ["s1", "s2"]);
    expect(result).toEqual({ outcome: "completed", detail: "2 new account(s) added." });
  });

  it("nothing found is skipped in both modes", async () => {
    h.discoverProspects.mockResolvedValue([]);
    await expect(runAccountDiscoveryStage(review)).resolves.toMatchObject({ outcome: "skipped" });
    await expect(runAccountDiscoveryStage(auto)).resolves.toMatchObject({ outcome: "skipped" });
    expect(h.approveProspectSuggestions).not.toHaveBeenCalled();
  });
});

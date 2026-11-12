/**
 * DISC-AI-APPROVAL-01: "Let AI Auto-Populate Info" in both approval modes. "Review each
 * step" must leave the ICP a draft and add no prospect (and so draft no strategy or
 * message); "Approve automatically" must keep the behaviour from before this story. The
 * mode comes from the workspace's own business setting, never from the caller.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getWorkspaceForProduct: vi.fn(),
  getAiApprovalModeForWorkspace: vi.fn(),
  generateIcp: vi.fn(),
  approveIcpProfile: vi.fn(),
  getIcpProfile: vi.fn(),
  discoverProspects: vi.fn(),
  approveProspectSuggestions: vi.fn(),
  getMostRecentProspect: vi.fn(),
  researchProspect: vi.fn(),
  scoreProspect: vi.fn(),
  generateOutreachStrategy: vi.fn(),
  approveOutreachStrategy: vi.fn(),
  generateOutreachMessage: vi.fn(),
}));

vi.mock("../tenancy/queries", () => ({ getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("./queries", () => ({ getAiApprovalModeForWorkspace: h.getAiApprovalModeForWorkspace }));
vi.mock("../ai/generate-icp", () => ({ generateIcp: h.generateIcp }));
vi.mock("../icp/mutations", () => ({ approveIcpProfile: h.approveIcpProfile }));
vi.mock("../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../ai/discover-prospects", () => ({ discoverProspects: h.discoverProspects }));
vi.mock("../data-sources/approval", () => ({ approveSuggestionsAndQueueEnrichment: h.approveProspectSuggestions }));
vi.mock("../prospects/queries", () => ({ getMostRecentProspect: h.getMostRecentProspect }));
vi.mock("../ai/research-prospect", () => ({ researchProspect: h.researchProspect }));
vi.mock("../scoring/score-prospect", () => ({ scoreProspect: h.scoreProspect }));
vi.mock("../ai/generate-strategy", () => ({ generateOutreachStrategy: h.generateOutreachStrategy }));
vi.mock("../outreach/mutations", () => ({ approveOutreachStrategy: h.approveOutreachStrategy }));
vi.mock("../ai/generate-message", () => ({ generateOutreachMessage: h.generateOutreachMessage }));

const { autoPopulateIcp, autoDiscoverOneProspect } = await import("./auto-populate");

beforeEach(() => {
  vi.clearAllMocks();
  h.getWorkspaceForProduct.mockResolvedValue({ id: "w1" });
  h.generateIcp.mockResolvedValue({ id: "icp1", status: "draft" });
  h.discoverProspects.mockResolvedValue([{ id: "s1" }]);
  h.approveProspectSuggestions.mockResolvedValue({ added: 1, duplicates: 0, prospects: [], enrichmentQueuedFor: [] });
  h.getMostRecentProspect.mockResolvedValue({ id: "p1" });
  h.generateOutreachStrategy.mockResolvedValue({ id: "st1" });
});

describe("autoPopulateIcp", () => {
  it("review mode: generates the ICP and leaves it a draft", async () => {
    h.getAiApprovalModeForWorkspace.mockResolvedValue("review");
    await autoPopulateIcp("prod1");
    expect(h.getAiApprovalModeForWorkspace).toHaveBeenCalledWith("w1");
    expect(h.generateIcp).toHaveBeenCalledWith("prod1", { force: true });
    expect(h.approveIcpProfile).not.toHaveBeenCalled();
  });

  it("auto mode: generates and approves the ICP (today's behaviour)", async () => {
    h.getAiApprovalModeForWorkspace.mockResolvedValue("auto");
    await autoPopulateIcp("prod1");
    expect(h.approveIcpProfile).toHaveBeenCalledWith("icp1");
  });

  it("a failed setting lookup approves nothing", async () => {
    h.getAiApprovalModeForWorkspace.mockRejectedValue(new Error("permission denied"));
    await expect(autoPopulateIcp("prod1")).rejects.toThrow("permission denied");
    expect(h.generateIcp).not.toHaveBeenCalled();
    expect(h.approveIcpProfile).not.toHaveBeenCalled();
  });
});

describe("autoDiscoverOneProspect", () => {
  it("review mode with a draft ICP: no search, nothing added", async () => {
    h.getAiApprovalModeForWorkspace.mockResolvedValue("review");
    h.getIcpProfile.mockResolvedValue({ id: "icp1", status: "draft" });
    await expect(autoDiscoverOneProspect("w1")).resolves.toBe("icp_review");
    expect(h.discoverProspects).not.toHaveBeenCalled();
    expect(h.approveProspectSuggestions).not.toHaveBeenCalled();
  });

  it("review mode with an approved ICP: the found company stays a suggestion; no strategy is approved", async () => {
    h.getAiApprovalModeForWorkspace.mockResolvedValue("review");
    h.getIcpProfile.mockResolvedValue({ id: "icp1", status: "approved" });
    await expect(autoDiscoverOneProspect("w1")).resolves.toBe("suggestions_review");
    expect(h.discoverProspects).toHaveBeenCalledWith("w1", undefined, 1);
    expect(h.approveProspectSuggestions).not.toHaveBeenCalled();
    expect(h.researchProspect).not.toHaveBeenCalled();
    expect(h.approveOutreachStrategy).not.toHaveBeenCalled();
    expect(h.generateOutreachMessage).not.toHaveBeenCalled();
  });

  it("review mode with nothing found reports zero", async () => {
    h.getAiApprovalModeForWorkspace.mockResolvedValue("review");
    h.getIcpProfile.mockResolvedValue({ id: "icp1", status: "approved" });
    h.discoverProspects.mockResolvedValue([]);
    await expect(autoDiscoverOneProspect("w1")).resolves.toBe(0);
  });

  it("auto mode: adds the prospect and drafts research, score, approved strategy and message", async () => {
    h.getAiApprovalModeForWorkspace.mockResolvedValue("auto");
    await expect(autoDiscoverOneProspect("w1")).resolves.toBe(1);
    expect(h.approveProspectSuggestions).toHaveBeenCalledWith("w1", ["s1"]);
    expect(h.researchProspect).toHaveBeenCalledWith("p1");
    expect(h.scoreProspect).toHaveBeenCalledWith("p1");
    expect(h.approveOutreachStrategy).toHaveBeenCalledWith("st1");
    expect(h.generateOutreachMessage).toHaveBeenCalledWith("st1");
  });

  it("auto mode: a failure after the prospect exists still reports it added", async () => {
    h.getAiApprovalModeForWorkspace.mockResolvedValue("auto");
    h.researchProspect.mockRejectedValue(new Error("provider down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(autoDiscoverOneProspect("w1")).resolves.toBe(1);
    expect(h.approveOutreachStrategy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

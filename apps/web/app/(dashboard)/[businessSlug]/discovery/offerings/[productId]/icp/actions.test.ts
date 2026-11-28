import { beforeEach, describe, expect, it, vi } from "vitest";

/** DISC-NAV-P0-01.7: approving the ideal customer opens the next step, Find. */
const h = vi.hoisted(() => ({ approve: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: h.redirect, unstable_rethrow: vi.fn() }));
const firstSearch = vi.hoisted(() => vi.fn());
vi.mock("@cofounderai/module-discovery/lib/data-sources/first-search", () => ({ runFirstSearch: firstSearch }));
vi.mock("@/lib/business-path", () => ({ businessPath: vi.fn(async () => "/acme") }));
vi.mock("@cofounderai/module-discovery/lib/ai/generate-icp", () => ({ generateIcp: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/icp/mutations", () => ({
  approveIcpProfile: h.approve,
  updateIcpProfile: vi.fn(),
  cloneIcpProfileToWorkspace: vi.fn(),
}));
vi.mock("@cofounderai/module-discovery/lib/pipeline/invalidate", () => ({ invalidateDownstreamStages: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/ai-approval/auto-populate", () => ({ autoPopulateIcp: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({ getWorkspaceForProduct: vi.fn(), getProduct: vi.fn(async () => ({ audience_type: "business" })) }));
vi.mock("@cofounderai/module-discovery/lib/personas/mutations", () => ({ createBuyerPersona: vi.fn(), updateBuyerPersona: vi.fn(), deleteBuyerPersona: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/audience/themes", () => ({ acceptThemeSuggestion: vi.fn() }));

const { approveIcpAction } = await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("approveIcpAction", () => {
  // DISC-AUTO-P0-02.1: approving starts the first search, then opens Search, which says how it went.
  const icp = { workspace_id: "w1", status: "approved", industries: ["Bakeries"], geographies: ["Pune"], audience: null };

  it("approves, runs the first search, then opens Search with what it added", async () => {
    h.approve.mockResolvedValue(icp);
    firstSearch.mockResolvedValue({ status: "searched", added: 4, sourceLabel: "WorksLake", weekly: true });
    await expect(approveIcpAction("b1", "p1", "icp-1")).rejects.toThrow("NEXT_REDIRECT:/acme/discovery/offerings/p1?searched=4&weekly=1");
    expect(h.approve).toHaveBeenCalledWith("icp-1");
    expect(firstSearch).toHaveBeenCalledWith("w1", icp, "business");
  });

  it("still approves when the search can't run, and says why", async () => {
    h.approve.mockResolvedValue(icp);
    firstSearch.mockResolvedValue({ status: "not_run", message: "Needs setup: no source" });
    await expect(approveIcpAction("b1", "p1", "icp-1")).rejects.toThrow("NEXT_REDIRECT:/acme/discovery/offerings/p1?searchNote=Needs%20setup%3A%20no%20source");
    firstSearch.mockRejectedValue(new Error("gateway down"));
    await expect(approveIcpAction("b1", "p1", "icp-1")).rejects.toThrow("searchNote=The%20first%20search%20didn't%20run%3A%20gateway%20down");
  });

  it("stays put when the approval fails", async () => {
    h.approve.mockRejectedValue(new Error("Forbidden"));
    await expect(approveIcpAction("b1", "p1", "icp-1")).rejects.toThrow("Forbidden");
    expect(h.redirect).not.toHaveBeenCalled();
  });
});

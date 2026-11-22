import { beforeEach, describe, expect, it, vi } from "vitest";

/** DISC-NAV-P0-01.7: approving the ideal customer opens the next step, Find. */
const h = vi.hoisted(() => ({ approve: vi.fn(), redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/lib/business-path", () => ({ businessPath: vi.fn(async () => "/acme") }));
vi.mock("@cofounderai/module-discovery/lib/ai/generate-icp", () => ({ generateIcp: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/icp/mutations", () => ({
  approveIcpProfile: h.approve,
  updateIcpProfile: vi.fn(),
  cloneIcpProfileToWorkspace: vi.fn(),
}));
vi.mock("@cofounderai/module-discovery/lib/pipeline/invalidate", () => ({ invalidateDownstreamStages: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/ai-approval/auto-populate", () => ({ autoPopulateIcp: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({ getWorkspaceForProduct: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/personas/mutations", () => ({ createBuyerPersona: vi.fn(), updateBuyerPersona: vi.fn(), deleteBuyerPersona: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/audience/themes", () => ({ acceptThemeSuggestion: vi.fn() }));

const { approveIcpAction } = await import("./actions");

beforeEach(() => vi.clearAllMocks());

describe("approveIcpAction", () => {
  it("approves, then opens Find for this offering", async () => {
    h.approve.mockResolvedValue(undefined);
    await expect(approveIcpAction("b1", "p1", "icp-1")).rejects.toThrow("NEXT_REDIRECT:/acme/discovery/offerings/p1/prospects/discover");
    expect(h.approve).toHaveBeenCalledWith("icp-1");
  });

  it("stays put when the approval fails", async () => {
    h.approve.mockRejectedValue(new Error("Forbidden"));
    await expect(approveIcpAction("b1", "p1", "icp-1")).rejects.toThrow("Forbidden");
    expect(h.redirect).not.toHaveBeenCalled();
  });
});

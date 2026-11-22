/** DISC-PROS-P0-08.1: a campaign reaches only prospects picked for work on the Select tab. */
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs } from "@cofounderai/core/test-support/fake-supabase";

vi.mock("../../db/server", () => ({ createClient: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: vi.fn() }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: vi.fn() }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn() }));

const { previewAudience } = await import("./campaigns");

describe("previewAudience", () => {
  it("reads only prospects that have been picked", async () => {
    const discovery = createFakeSupabase({ query: () => ({ data: [], error: null }) });
    const core = createFakeSupabase({ query: () => ({ data: [], error: null }) });
    await previewAudience(
      { workspace_id: "w1", audience: {}, include_unverified: false } as never,
      { discovery: discovery as never, core: core as never, businessId: "b1" },
    );
    expect(opArgs(discovery.queries("prospects")[0]!, "not")).toEqual(["shortlisted_at", "is", null]);
  });
});

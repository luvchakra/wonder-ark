/** DISC-CONS-P0-01.1: saving "Who buys this?". */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, usedOp, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn(), requireModule: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));

const { setAudienceType } = await import("./audience-type");

function mockDb(product: unknown = { id: "prod-1", business_id: "b1" }) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => (usedOp(call, "update") ? { data: null, error: null } : { data: product, error: null }),
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireModule.mockResolvedValue(undefined);
});

describe("setAudienceType", () => {
  it("saves the answer and records that a person confirmed it", async () => {
    const supabase = mockDb();
    await expect(setAudienceType("prod-1", "consumer")).resolves.toBe("consumer");
    expect(h.requireModule).toHaveBeenCalledWith("b1", "discovery");
    const update = supabase.queries("products").find((call) => usedOp(call, "update"))!;
    expect(opArgs(update, "update")![0]).toMatchObject({ audience_type: "consumer", audience_confirmed_at: expect.any(String) });
  });

  it("refuses a value outside the closed list without writing", async () => {
    const supabase = mockDb();
    await expect(setAudienceType("prod-1", "everyone")).rejects.toThrow("Choose who buys this offering.");
    expect(supabase.queries("products")).toEqual([]);
  });

  it("refuses without a Discovery licence, and an offering the caller cannot see", async () => {
    h.requireModule.mockRejectedValue(new Error("MODULE_NOT_LICENSED"));
    let supabase = mockDb();
    await expect(setAudienceType("prod-1", "both")).rejects.toThrow("MODULE_NOT_LICENSED");
    expect(supabase.queries("products").some((call) => usedOp(call, "update"))).toBe(false);

    h.requireModule.mockResolvedValue(undefined);
    supabase = mockDb(null);
    await expect(setAudienceType("other", "both")).rejects.toThrow("Offering not found.");
    expect(supabase.queries("products").some((call) => usedOp(call, "update"))).toBe(false);
  });
});

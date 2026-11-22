/**
 * DISC-PROS-P0-08.1: picking prospects on the Select tab ("Use these") and sending them back.
 * Only the workspace's own rows are touched, and only those not already in the wanted state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient }));
vi.mock("./party-sync", () => ({ ensureProspectParty: vi.fn() }));

const { setProspectsShortlisted } = await import("./mutations");

function mock(data: unknown) {
  const supabase = createFakeSupabase({ query: () => ({ data, error: null }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("setProspectsShortlisted", () => {
  it("picks the ticked prospects in this workspace only, and reports how many moved", async () => {
    const supabase = mock([{ id: "a" }, { id: "b" }]);
    expect(await setProspectsShortlisted("w1", ["a", "b", "a", ""], true)).toBe(2);
    const call = supabase.queries("prospects")[0]!;
    expect(eqFilters(call)).toMatchObject({ workspace_id: "w1" });
    expect(opArgs(call, "in")).toEqual(["id", ["a", "b"]]);
    expect(opArgs(call, "is")).toEqual(["shortlisted_at", null]);
    expect((opArgs(call, "update")![0] as { shortlisted_at: string }).shortlisted_at).toMatch(/^\d{4}-/);
  });

  it("sends ticked prospects back to Select", async () => {
    const supabase = mock([{ id: "a" }]);
    expect(await setProspectsShortlisted("w1", ["a"], false)).toBe(1);
    const call = supabase.queries("prospects")[0]!;
    expect(opArgs(call, "update")).toEqual([{ shortlisted_at: null }]);
    expect(opArgs(call, "not")).toEqual(["shortlisted_at", "is", null]);
  });

  it("touches nothing when nothing is ticked", async () => {
    const supabase = mock([]);
    expect(await setProspectsShortlisted("w1", [], true)).toBe(0);
    expect(supabase.queries("prospects")).toEqual([]);
  });
});

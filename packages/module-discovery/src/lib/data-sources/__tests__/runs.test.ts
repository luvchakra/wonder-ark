/**
 * DISC-DATA-P0-02.3: a gateway run is written to the same ledger as an AI run, with its
 * source, result count and units spent, and never with the request's content.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../../db/server", () => ({ createClient: h.createClient }));

const { recordDataSourceRun } = await import("../runs");

const request = { kind: "business", query: "electrician", providers: ["stored"] };

beforeEach(() => vi.clearAllMocks());

describe("recordDataSourceRun", () => {
  it("records the source, the result count and the units spent beside the AI runs", async () => {
    const supabase = createFakeSupabase();
    h.createClient.mockResolvedValue(supabase);

    await recordDataSourceRun({
      workspaceId: "w1",
      operation: "gateway_search",
      source: "stored",
      request,
      status: "succeeded",
      resultCount: 12,
      unitsSpent: 1,
      durationMs: 420,
    });

    const row = writtenRow(supabase.queries("ai_runs")[0]!)!;
    expect(row).toMatchObject({
      workspace_id: "w1",
      operation: "gateway_search",
      model: "workslake-gateway",
      provider: "workslake",
      prompt_version: "prospects-api-v1",
      status: "succeeded",
      source: "stored",
      result_count: 12,
      units_spent: 1,
      duration_ms: 420,
      error_code: null,
    });
    // No AI spend is claimed for a lookup paid for in units.
    expect(row).not.toHaveProperty("estimated_cost");
  });

  it("stores a hash of the request, never the request", async () => {
    const supabase = createFakeSupabase();
    h.createClient.mockResolvedValue(supabase);

    await recordDataSourceRun({ workspaceId: "w1", operation: "gateway_search", source: "stored", request, status: "succeeded" });

    const row = writtenRow(supabase.queries("ai_runs")[0]!)!;
    expect(row.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("electrician");
  });

  it("records a failed run with its error code and no result count", async () => {
    const supabase = createFakeSupabase();
    h.createClient.mockResolvedValue(supabase);

    await recordDataSourceRun({
      workspaceId: "w1",
      operation: "gateway_signals",
      source: "hiring",
      request,
      status: "failed",
      errorCode: "PROVIDER_UNAVAILABLE",
    });

    expect(writtenRow(supabase.queries("ai_runs")[0]!)).toMatchObject({
      status: "failed",
      error_code: "PROVIDER_UNAVAILABLE",
      result_count: null,
      units_spent: null,
    });
  });

  it("logs, and does not throw, when the ledger write fails", async () => {
    h.createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: null, error: { message: "denied" } }) }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordDataSourceRun({ workspaceId: "w1", operation: "gateway_search", source: "stored", request, status: "succeeded" }),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

/**
 * DISC-DATA-P0-05.1 (B7, B8): the weekly saved search. The gateway is stood in for at
 * `fetch` with the contract's own JSON, and the tables are held in memory, so the real
 * `runFind`, client and ledger run. What is pinned here:
 *  - only a free, active WorksLake source can be saved; one per offering, replaced only
 *    when asked;
 *  - the cron step queues due, enabled searches once each, even when it overlaps itself,
 *    gated on the Discovery licence, and searches nothing;
 *  - a second run adds only the suggestions that are new;
 *  - a redelivered event asks the gateway nothing and adds no second ledger row, so
 *    usage is counted once;
 *  - a failed gateway call is recorded as failed and does not throw, so the drain does
 *    not retry it;
 *  - a paused search is neither queued nor run; paid sources are never spent; the run
 *    is for the event's business only and passes the usage check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "./memory-db";
import { GATEWAY_KEY, GATEWAY_URL, TENANT_ID, businessItem, errorBody, searchResponse, sourcesResponse } from "./fixtures/contract";

const h = vi.hoisted(() => ({
  requireModule: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  publish: vi.fn(),
  coreAdmin: { core: true },
}));

vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/events/mutations", () => ({ publish: h.publish }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: () => h.coreAdmin }));
vi.mock("../../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../../../db/admin", () => ({ createAdminClient: h.createAdminClient }));
vi.mock("../../ai/discover-prospects", () => ({ discoverProspects: vi.fn() }));
vi.mock("../../icp/queries", () => ({ getIcpProfile: vi.fn(async () => null) }));
vi.mock("../../prospects/duplicates", () => ({ findDuplicateProspect: vi.fn(async () => null) }));
vi.mock("../../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));
vi.mock("../../usage/limits", async (original) => ({
  ...(await original<typeof import("../../usage/limits")>()),
  assertWithinUsageLimit: h.assertWithinUsageLimit,
}));

const { UsageLimitExceededError } = await import("../../usage/limits");
const {
  SAVED_SEARCH_RUN_REQUESTED_EVENT,
  enqueueDueSavedSearches,
  getSavedSearch,
  runSavedSearch,
  saveWeeklySearch,
  setSavedSearchEnabled,
  summariseSavedSearch,
} = await import("../saved-searches");

const WORKSPACE = "w1";
const OTHER_BUSINESS = "9f3b0a52-6c1e-4b0e-9a55-2d9f4e1c8a99";
const NOW = new Date("2026-11-12T05:50:00.000Z");
const DUE = "2026-11-12T05:00:00.000Z";
const request = { sourceId: "stored", what: "electrician", where: "Pune" };

let db: ReturnType<typeof createMemoryDb>;
let fetchMock: ReturnType<typeof vi.fn>;
let searchAnswer: { body: unknown; status: number };
let sourcesAnswer: unknown;

function setup(savedSearches: Record<string, unknown>[] = []) {
  db = createMemoryDb({ saved_searches: savedSearches });
  h.createClient.mockResolvedValue(db.client);
  h.createAdminClient.mockReturnValue(db.client);
}

function saved(overrides: Record<string, unknown> = {}) {
  return {
    id: "ss1",
    workspace_id: WORKSPACE,
    kind: "company",
    request,
    enabled: true,
    last_run_at: null,
    next_run_at: DUE,
    last_result: null,
    ...overrides,
  };
}

function business(id: string) {
  return { ...businessItem, id, name: `Company ${id}`, domain: `${id}.example`, website: `https://${id}.example` };
}

function gatewayReturns(ids: string[]) {
  searchAnswer = { status: 200, body: { ...searchResponse, results: ids.map(business) } };
}

const searchCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/v1/prospects/search"));
const suggestions = () => db.rows("prospect_suggestions");
const runs = () => db.rows("ai_runs");
const stored = () => db.rows("saved_searches")[0]!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSLAKE_GATEWAY_URL", GATEWAY_URL);
  vi.stubEnv("WORKSLAKE_GATEWAY_API_KEY", GATEWAY_KEY);
  sourcesAnswer = sourcesResponse;
  gatewayReturns(["a", "b"]);
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith("/v1/prospects/sources")) return new Response(JSON.stringify(sourcesAnswer), { status: 200 });
    return new Response(JSON.stringify(searchAnswer.body), { status: searchAnswer.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  h.getBusinessIdForWorkspace.mockImplementation(async (workspaceId: string) => (workspaceId === WORKSPACE ? TENANT_ID : OTHER_BUSINESS));
  h.publish.mockResolvedValue({});
  setup();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Run this weekly", () => {
  it("saves a search on a free, active WorksLake source, first due a week on", async () => {
    const outcome = await saveWeeklySearch(WORKSPACE, { ...request, hasWebsite: true }, { replace: false });

    expect(outcome).toEqual({ status: "saved" });
    expect(stored()).toMatchObject({
      workspace_id: WORKSPACE,
      kind: "company",
      enabled: true,
      request: { sourceId: "stored", what: "electrician", where: "Pune", hasWebsite: true },
    });
    const days = (new Date(stored().next_run_at as string).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    expect(searchCalls()).toHaveLength(0);
  });

  it.each([
    ["a paid source", "google_places", "paid lookups"],
    ["the AI web search", "web_search", "Only a WorksLake search"],
    ["the file import", "file_import", "Only a WorksLake search"],
    ["a source the gateway does not list", "made_up", "Only a WorksLake search"],
  ])("refuses %s and stores nothing", async (_label, sourceId, message) => {
    sourcesAnswer = {
      ...sourcesResponse,
      sources: sourcesResponse.sources.map((source) => ({ ...source, status: "active" })),
    };
    const outcome = await saveWeeklySearch(WORKSPACE, { ...request, sourceId }, { replace: false });
    expect(outcome).toMatchObject({ status: "refused" });
    expect(outcome.status === "refused" && outcome.message).toContain(message);
    expect(db.rows("saved_searches")).toHaveLength(0);
  });

  it("refuses a source that is not active, and a search with nothing to look for", async () => {
    sourcesAnswer = { ...sourcesResponse, sources: [{ ...sourcesResponse.sources[0], status: "paused" }] };
    expect(await saveWeeklySearch(WORKSPACE, request, { replace: false })).toMatchObject({ status: "refused" });
    sourcesAnswer = sourcesResponse;
    expect(await saveWeeklySearch(WORKSPACE, { ...request, what: "  " }, { replace: false })).toMatchObject({ status: "refused" });
    expect(db.rows("saved_searches")).toHaveLength(0);
  });

  it("keeps the one saved search until the person asks to replace it", async () => {
    await saveWeeklySearch(WORKSPACE, request, { replace: false });

    const second = await saveWeeklySearch(WORKSPACE, { ...request, what: "plumber" }, { replace: false });
    expect(second).toEqual({ status: "exists" });
    expect(stored().request).toMatchObject({ what: "electrician" });

    const replaced = await saveWeeklySearch(WORKSPACE, { ...request, what: "plumber" }, { replace: true });
    expect(replaced).toEqual({ status: "saved" });
    expect(db.rows("saved_searches")).toHaveLength(1);
    expect(stored().request).toMatchObject({ what: "plumber" });
  });

  it("stops at the licence check", async () => {
    h.requireModule.mockRejectedValueOnce(new Error("Discovery is not licensed."));
    await expect(saveWeeklySearch(WORKSPACE, request, { replace: false })).rejects.toThrow("not licensed");
    expect(db.rows("saved_searches")).toHaveLength(0);
    h.requireModule.mockRejectedValueOnce(new Error("Discovery is not licensed."));
    await expect(setSavedSearchEnabled(WORKSPACE, false)).rejects.toThrow("not licensed");
  });

  it("summarises what the page shows, and hides the next run while paused", async () => {
    setup([saved({ last_run_at: DUE, last_result: { status: "completed", found: 25, added: 3 } })]);
    expect(summariseSavedSearch(await getSavedSearch(WORKSPACE))).toEqual({
      what: "electrician",
      where: "Pune",
      sourceId: "stored",
      enabled: true,
      lastRunAt: DUE,
      nextRunAt: DUE,
      lastResult: { status: "completed", found: 25, added: 3 },
    });
    await setSavedSearchEnabled(WORKSPACE, false);
    expect(summariseSavedSearch(await getSavedSearch(WORKSPACE))).toMatchObject({ enabled: false, nextRunAt: null });
    expect(summariseSavedSearch({ ...(await getSavedSearch(WORKSPACE))!, request: { nonsense: true } })).toBeNull();
  });
});

describe("the daily check queues due searches", () => {
  it("queues one licence-gated event per due search and moves its next run a week on", async () => {
    setup([saved()]);

    expect(await enqueueDueSavedSearches(NOW)).toEqual({ queued: 1, failed: 0 });

    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenCalledWith(
      {
        businessId: TENANT_ID,
        type: SAVED_SEARCH_RUN_REQUESTED_EVENT,
        payload: { savedSearchId: "ss1", dueAt: DUE },
        requiredModule: "discovery",
      },
      h.coreAdmin,
    );
    expect(stored().next_run_at).toBe("2026-11-19T05:50:00.000Z");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues nothing a second time: the first invocation already claimed it", async () => {
    setup([saved()]);
    await enqueueDueSavedSearches(NOW);
    expect(await enqueueDueSavedSearches(NOW)).toEqual({ queued: 0, failed: 0 });
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it("does not queue a paused search, or one that is not due yet", async () => {
    setup([
      saved({ id: "paused", enabled: false }),
      saved({ id: "later", workspace_id: "w2", next_run_at: "2026-11-13T00:00:00.000Z" }),
      saved({ id: "never-scheduled", workspace_id: "w3", next_run_at: null }),
    ]);
    expect(await enqueueDueSavedSearches(NOW)).toEqual({ queued: 0, failed: 0 });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("puts the due date back when the event cannot be published, so the next check retries", async () => {
    setup([saved()]);
    h.publish.mockRejectedValueOnce(new Error("queue down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await enqueueDueSavedSearches(NOW)).toEqual({ queued: 0, failed: 1 });
    expect(stored().next_run_at).toBe(DUE);

    expect(await enqueueDueSavedSearches(NOW)).toEqual({ queued: 1, failed: 0 });
    error.mockRestore();
  });
});

describe("a queued run", () => {
  it("stages what the search found for review and records the run", async () => {
    setup([saved()]);

    const outcome = await runSavedSearch("ss1", DUE, TENANT_ID, NOW);

    expect(outcome).toEqual({ status: "ran", result: { status: "completed", found: 2, added: 2 } });
    expect(suggestions().map((row) => row.external_id)).toEqual(["a", "b"]);
    expect(db.rows("prospects")).toHaveLength(0);
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ operation: "gateway_search", status: "succeeded", source: "stored", result_count: 2 });
    expect(stored()).toMatchObject({ last_run_at: NOW.toISOString(), last_result: { status: "completed", found: 2, added: 2 } });
    const [, init] = searchCalls()[0]! as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Tenant-Id"]).toBe(TENANT_ID);
    expect(JSON.parse(String(init.body))).toMatchObject({ kind: "business", query: "electrician", providers: ["stored"] });
  });

  it("adds only what is new on its second run", async () => {
    setup([saved()]);
    await runSavedSearch("ss1", DUE, TENANT_ID, NOW);

    gatewayReturns(["a", "b", "c"]);
    const second = await runSavedSearch("ss1", "2026-11-19T05:50:00.000Z", TENANT_ID, new Date("2026-11-19T06:00:00.000Z"));

    expect(second).toEqual({ status: "ran", result: { status: "completed", found: 3, added: 1 } });
    expect(suggestions().map((row) => row.external_id)).toEqual(["a", "b", "c"]);
    expect(runs()).toHaveLength(2);
  });

  it("asks the gateway nothing when the same event is delivered again, so usage counts once", async () => {
    setup([saved()]);
    await runSavedSearch("ss1", DUE, TENANT_ID, NOW);

    const again = await runSavedSearch("ss1", DUE, TENANT_ID, NOW);

    expect(again).toEqual({ status: "skipped", reason: "already_ran" });
    expect(searchCalls()).toHaveLength(1);
    expect(runs()).toHaveLength(1);
    expect(suggestions()).toHaveLength(2);
  });

  it("records a failed gateway call as failed, without throwing and without a second attempt", async () => {
    setup([saved()]);
    searchAnswer = { status: 502, body: errorBody("PROVIDER_UNAVAILABLE") };

    const outcome = await runSavedSearch("ss1", DUE, TENANT_ID, NOW);

    expect(outcome).toMatchObject({ status: "ran", result: { status: "failed" } });
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ operation: "gateway_search", status: "failed" });
    expect(stored().last_result).toMatchObject({ status: "failed" });
    expect(String((stored().last_result as { message: string }).message)).toContain("Unavailable");
    expect(suggestions()).toHaveLength(0);

    // A redelivery of the same event finds the failed run and does not try again.
    expect(await runSavedSearch("ss1", DUE, TENANT_ID, NOW)).toEqual({ status: "skipped", reason: "already_ran" });
    expect(searchCalls()).toHaveLength(1);
  });

  it("does not run a search that was paused after it was queued", async () => {
    setup([saved({ enabled: false })]);
    expect(await runSavedSearch("ss1", DUE, TENANT_ID, NOW)).toEqual({ status: "skipped", reason: "paused" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stored().last_run_at).toBeNull();
  });

  it("runs only for the business the event names", async () => {
    setup([saved()]);
    expect(await runSavedSearch("ss1", DUE, OTHER_BUSINESS, NOW)).toEqual({ status: "skipped", reason: "wrong_business" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await runSavedSearch("gone", DUE, TENANT_ID, NOW)).toEqual({ status: "skipped", reason: "gone" });
  });

  it("never spends paid lookups: a source that has become paid is refused before the search", async () => {
    setup([saved()]);
    sourcesAnswer = { ...sourcesResponse, sources: [{ ...sourcesResponse.sources[0], paid: true }] };

    const outcome = await runSavedSearch("ss1", DUE, TENANT_ID, NOW);

    expect(outcome).toMatchObject({ status: "ran", result: { status: "failed" } });
    expect(searchCalls()).toHaveLength(0);
    expect(runs()).toHaveLength(0);
  });

  it("does not run past the monthly allowance, and says so on the saved search", async () => {
    setup([saved()]);
    h.assertWithinUsageLimit.mockRejectedValueOnce(new UsageLimitExceededError("runs"));

    const outcome = await runSavedSearch("ss1", DUE, TENANT_ID, NOW);

    expect(outcome).toMatchObject({ status: "ran", result: { status: "failed" } });
    expect(String((stored().last_result as { message: string }).message)).toContain("allowance");
    expect(searchCalls()).toHaveLength(0);
    expect(h.assertWithinUsageLimit).toHaveBeenCalledWith(WORKSPACE, db.client);
  });

  it("reports Needs setup, and searches nothing, without gateway settings", async () => {
    setup([saved()]);
    vi.stubEnv("WORKSLAKE_GATEWAY_URL", "");
    const outcome = await runSavedSearch("ss1", DUE, TENANT_ID, NOW);
    expect(outcome).toMatchObject({ status: "ran", result: { status: "failed" } });
    expect(String((stored().last_result as { message: string }).message)).toContain("Needs setup");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails a stored request it cannot read, and a web search, without asking anything", async () => {
    setup([saved({ request: { what: 42 } })]);
    expect(await runSavedSearch("ss1", DUE, TENANT_ID, NOW)).toMatchObject({ status: "ran", result: { status: "failed" } });
    setup([saved({ request: { ...request, sourceId: "web_search" } })]);
    expect(await runSavedSearch("ss1", DUE, TENANT_ID, NOW)).toMatchObject({ status: "ran", result: { status: "failed" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

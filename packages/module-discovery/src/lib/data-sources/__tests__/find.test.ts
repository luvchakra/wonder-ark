/**
 * DISC-DATA-P0-03.1/03.2/03.3 (B8): one Find run. What is pinned here:
 *  - gateway results land in `prospect_suggestions`, never in `prospects`, carrying
 *    `source`, `source_name`, `source_ref`, `external_id` and `payload`;
 *  - a result that fails the ICP pre-filter, is already a prospect, or is already
 *    waiting for review is skipped and counted, and the outcome says why;
 *  - running the same search twice adds nothing;
 *  - the licence, the usage allowance and the source's own status are checked before the
 *    gateway is asked, the tenant is the workspace's business, and the run is recorded;
 *  - a refusal or a failure is reported as one, never as a result;
 *  - "Web search (AI)" still runs the existing AI discovery, untouched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";
import type { DataSource, DataSourceList } from "../types";
import { TENANT_ID, businessItem, channelItem, searchResponse, signalsItem, signalsResponse, sourcesResponse } from "./fixtures/contract";

const h = vi.hoisted(() => ({
  requireModule: vi.fn(),
  createClient: vi.fn(),
  discoverProspects: vi.fn(),
  getIcpProfile: vi.fn(),
  findDuplicateProspect: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  listDataSources: vi.fn(),
  recordDataSourceRun: vi.fn(),
  searchProspects: vi.fn(),
  hiringSignals: vi.fn(),
  order: [] as string[],
}));

vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("../../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../../ai/discover-prospects", () => ({ discoverProspects: h.discoverProspects }));
vi.mock("../../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../../prospects/duplicates", () => ({ findDuplicateProspect: h.findDuplicateProspect }));
vi.mock("../../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));
vi.mock("../../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("../index", () => ({ listDataSources: h.listDataSources }));
vi.mock("../runs", () => ({ recordDataSourceRun: h.recordDataSourceRun }));
vi.mock("../workslake-client", async (original) => ({
  ...(await original<typeof import("../workslake-client")>()),
  searchProspects: h.searchProspects,
  hiringSignals: h.hiringSignals,
}));

const { runFind, FIND_PAGE_SIZE } = await import("../find");
const { BusinessItemSchema, ProspectItemSchema } = await import("../workslake-client");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";

const stored: DataSource = {
  id: "stored",
  provider: "stored",
  origin: "gateway",
  action: "search",
  label: "WorksLake business data",
  kinds: ["business", "channel"],
  status: "active",
  paid: false,
  attribution: "OpenStreetMap contributors (ODbL); Overture Maps Foundation",
  coverage: ["IN"],
};
const places: DataSource = { ...stored, id: "google_places", provider: "google_places", label: "Google Places", status: "needs_setup", paid: true };
const hiring: DataSource = { ...stored, id: "signals:hiring", provider: "hiring", action: "signals", label: "Hiring signals", kinds: ["signal"] };
const webSearch: DataSource = { ...stored, id: "web_search", provider: null, origin: "local", label: "Web search (AI)", kinds: ["business"], attribution: null, coverage: [] };
const fileImport: DataSource = { ...webSearch, id: "file_import", action: "import", label: "File import" };

function sources(overrides: Partial<DataSourceList> = {}) {
  h.listDataSources.mockResolvedValue({
    sources: [stored, places, hiring, webSearch, fileImport],
    quota: sourcesResponse.quota,
    gateway: { state: "ok", resetAt: null },
    ...overrides,
  });
}

function business(id: string, fields: Record<string, unknown> = {}) {
  return BusinessItemSchema.parse({
    ...businessItem,
    id,
    name: `Company ${id}`,
    domain: `${id}.example`,
    website: `https://${id}.example`,
    ...fields,
  });
}

function searchReturns(results: unknown[], extra: Record<string, unknown> = {}) {
  h.searchProspects.mockResolvedValue({ ok: true, data: { ...searchResponse, results, unreadable: 0, ...extra } });
}

/** Records every query; an upsert into prospect_suggestions returns one row per row
 * written unless `inserted` says otherwise (rows the unique key refused do not come back). */
function mockDb(inserted?: (rows: unknown[]) => unknown[]) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (call.table !== "prospect_suggestions") return { data: null, error: null };
      const rows = opArgs(call, "upsert")![0] as unknown[];
      return { data: inserted ? inserted(rows) : rows.map((_, i) => ({ id: `s${i}` })), error: null };
    },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

function stagedRows(supabase: ReturnType<typeof mockDb>): Record<string, unknown>[] {
  const call = supabase.queries("prospect_suggestions")[0];
  return call ? (opArgs(call, "upsert")![0] as Record<string, unknown>[]) : [];
}

const approvedIcp = {
  status: "approved",
  industries: ["Electrical"],
  geographies: ["India"],
  company_sizes: ["1-50 employees"],
  exclusions: ["Government"],
};

const input = { sourceId: "stored", what: "electrician", where: "Pune" };

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  h.getBusinessIdForWorkspace.mockResolvedValue(TENANT_ID);
  h.requireModule.mockImplementation(async () => void h.order.push("licence"));
  h.assertWithinUsageLimit.mockImplementation(async () => void h.order.push("usage"));
  h.searchProspects.mockImplementation(async () => {
    h.order.push("gateway");
    return { ok: true, data: { ...searchResponse, results: [BusinessItemSchema.parse(businessItem)], unreadable: 0 } };
  });
  h.getIcpProfile.mockResolvedValue(null);
  h.findDuplicateProspect.mockResolvedValue(null);
  sources();
});

describe("a search of WorksLake business data", () => {
  it("stages each result as a suggestion carrying its source", async () => {
    const supabase = mockDb();

    const outcome = await runFind(WORKSPACE, input);

    expect(stagedRows(supabase)).toEqual([
      expect.objectContaining({
        workspace_id: WORKSPACE,
        kind: "company",
        company_name: "Shree Electricals",
        location: "Kothrud, Pune",
        match_reason: 'Matches your search for "electrician" in Pune.',
        source: "stored",
        source_name: "OpenStreetMap contributors (ODbL)",
        source_ref: "https://www.openstreetmap.org/node/123",
        external_id: "businesses_3f9a...",
        payload: BusinessItemSchema.parse(businessItem),
      }),
    ]);
    expect(outcome).toEqual({
      status: "completed",
      sourceLabel: "WorksLake business data",
      found: 1,
      added: 1,
      skipped: { alreadyProspect: 0, alreadyInReview: 0, icp: 0, icpReasons: [], unreadable: 0 },
      unitsSpent: 0,
      providerIssues: [],
    });
  });

  it("writes to the review list only, never straight into prospects", async () => {
    const supabase = mockDb();

    await runFind(WORKSPACE, input);

    expect(supabase.queries("prospects")).toEqual([]);
    expect(supabase.queries().map((call) => call.table)).toEqual(["prospect_suggestions"]);
  });

  it("sends the contract's request for what was typed, to the chosen source", async () => {
    mockDb();

    await runFind(WORKSPACE, { ...input, where: "Pune; Mumbai", companySize: "11-50, 51-200", hasWebsite: true });

    expect(h.searchProspects).toHaveBeenCalledWith({ tenantId: TENANT_ID }, {
      kind: "business",
      query: "electrician",
      filters: {
        categories: [],
        industries: [],
        employeeRanges: ["11-50", "51-200"],
        hasWebsite: true,
        channelTypes: [],
        minAudience: null,
        languages: [],
      },
      locations: [
        { text: "Pune", country: null, lat: null, lon: null, radiusKm: null },
        { text: "Mumbai", country: null, lat: null, lon: null, radiusKm: null },
      ],
      providers: ["stored"],
      limit: FIND_PAGE_SIZE,
      cursor: null,
    });
  });

  it("leaves the website filter out when it was not asked for", async () => {
    mockDb();

    await runFind(WORKSPACE, { ...input, hasWebsite: false });

    expect(h.searchProspects.mock.calls[0]![1].filters).not.toHaveProperty("hasWebsite");
  });

  it("checks the licence and the usage allowance before asking the gateway", async () => {
    mockDb();

    await runFind(WORKSPACE, input);

    expect(h.order).toEqual(["licence", "usage", "gateway"]);
    expect(h.requireModule).toHaveBeenCalledWith(TENANT_ID, "discovery");
    expect(h.assertWithinUsageLimit).toHaveBeenCalledWith(WORKSPACE);
  });

  it("records the run with its source, result count and units spent", async () => {
    mockDb();
    searchReturns([business("a"), business("b")], { usage: { unitsSpent: 1, tenantRemaining: { search: 479, paid: 49 } } });

    const outcome = await runFind(WORKSPACE, input);

    expect(h.recordDataSourceRun).toHaveBeenCalledTimes(1);
    expect(h.recordDataSourceRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        operation: "gateway_search",
        source: "stored",
        status: "succeeded",
        resultCount: 2,
        unitsSpent: 1,
      }),
    );
    expect(outcome).toMatchObject({ status: "completed", unitsSpent: 1 });
  });
});

describe("what is left out, and why", () => {
  it("skips and counts a result that fails the ICP pre-filter", async () => {
    const supabase = mockDb();
    h.getIcpProfile.mockResolvedValue(approvedIcp);
    searchReturns([
      business("fits"),
      business("wrong-industry", { industry: "Retail" }),
      business("abroad", { location: { ...businessItem.location, text: "Austin, Texas", city: "Austin", country: "US" } }),
      business("also-abroad", { location: { ...businessItem.location, text: "Leeds", city: "Leeds", country: "GB" } }),
      business("excluded", { industry: "Government electrical works" }),
    ]);

    const outcome = await runFind(WORKSPACE, input);

    expect(stagedRows(supabase).map((row) => row.external_id)).toEqual(["fits"]);
    expect(outcome).toMatchObject({
      status: "completed",
      found: 5,
      added: 1,
      skipped: {
        icp: 4,
        icpReasons: [
          "2 outside your ICP's geographies",
          "1 outside your ICP's industries",
          "1 on your ICP's exclusion list",
        ],
      },
    });
  });

  it("does not turn a result away for a value the source did not give", async () => {
    const supabase = mockDb();
    h.getIcpProfile.mockResolvedValue(approvedIcp);
    searchReturns([
      business("unknown", {
        industry: null,
        employeeRange: "201-500",
        location: { text: null, city: null, region: null, country: null, postcode: null, lat: null, lon: null },
      }),
    ]);

    const outcome = await runFind(WORKSPACE, input);

    expect(stagedRows(supabase)).toHaveLength(1);
    expect(outcome).toMatchObject({ added: 1, skipped: { icp: 0 } });
  });

  it("applies no ICP pre-filter while the ICP is only a draft", async () => {
    const supabase = mockDb();
    h.getIcpProfile.mockResolvedValue({ ...approvedIcp, status: "draft" });
    searchReturns([business("wrong-industry", { industry: "Retail" })]);

    await runFind(WORKSPACE, input);

    expect(stagedRows(supabase)).toHaveLength(1);
  });

  it("skips and counts a result that is already a prospect", async () => {
    const supabase = mockDb();
    searchReturns([business("new"), business("known")]);
    h.findDuplicateProspect.mockImplementation(async (_workspace: string, candidate: { companyName: string }) =>
      candidate.companyName === "Company known" ? { id: "p1", company_name: "Company known" } : null,
    );

    const outcome = await runFind(WORKSPACE, input);

    expect(h.findDuplicateProspect).toHaveBeenCalledWith(WORKSPACE, {
      companyName: "Company known",
      website: "https://known.example/",
    });
    expect(stagedRows(supabase).map((row) => row.external_id)).toEqual(["new"]);
    expect(outcome).toMatchObject({ found: 2, added: 1, skipped: { alreadyProspect: 1 } });
  });

  it("writes nothing when every result is already a prospect", async () => {
    const supabase = mockDb();
    h.findDuplicateProspect.mockResolvedValue({ id: "p1", company_name: "Shree Electricals" });

    const outcome = await runFind(WORKSPACE, input);

    expect(supabase.queries("prospect_suggestions")).toEqual([]);
    expect(outcome).toMatchObject({ status: "completed", added: 0, skipped: { alreadyProspect: 1 } });
  });

  it("adds nothing when the same search is run twice", async () => {
    const first = mockDb();
    await runFind(WORKSPACE, input);
    expect(stagedRows(first)).toHaveLength(1);

    // Second run: the unique key refuses the row already waiting, so none comes back.
    const second = mockDb(() => []);
    const outcome = await runFind(WORKSPACE, input);

    const upsert = second.queries("prospect_suggestions")[0]!;
    expect(opArgs(upsert, "upsert")![1]).toEqual({
      onConflict: "workspace_id,source,external_id",
      ignoreDuplicates: true,
    });
    expect(outcome).toMatchObject({ status: "completed", found: 1, added: 0, skipped: { alreadyInReview: 1 } });
  });

  it("stages a record once when the source returns it twice in one run", async () => {
    const supabase = mockDb();
    searchReturns([business("twin"), business("twin")]);

    const outcome = await runFind(WORKSPACE, input);

    expect(stagedRows(supabase)).toHaveLength(1);
    expect(outcome).toMatchObject({ found: 2, added: 1, skipped: { alreadyInReview: 1 } });
  });

  it("counts records it could not read, and a channel returned to a search for businesses", async () => {
    const supabase = mockDb();
    searchReturns([business("ok"), ProspectItemSchema.parse(channelItem), business("nameless", { name: " \n " })], { unreadable: 2 });

    const outcome = await runFind(WORKSPACE, input);

    expect(stagedRows(supabase).map((row) => row.external_id)).toEqual(["ok"]);
    expect(outcome).toMatchObject({ found: 5, added: 1, skipped: { unreadable: 4 } });
  });

  it("reports a provider that did not answer inside an otherwise successful run", async () => {
    mockDb();
    searchReturns([business("a")], {
      metadata: { matched: 1, asOf: "2026-11-11T13:00:00Z", providers: [{ id: "stored", status: "ok", returned: 1 }, { id: "google_places", status: "quota", returned: 0 }] },
    });

    const outcome = await runFind(WORKSPACE, input);

    expect(outcome).toMatchObject({ status: "completed", providerIssues: [{ id: "google_places", status: "quota" }] });
  });
});

describe("refusals and failures", () => {
  it("refuses, before any check or call, a workspace the caller cannot read", async () => {
    h.getBusinessIdForWorkspace.mockResolvedValue(null);

    await expect(runFind(WORKSPACE, input)).rejects.toThrow("Workspace not found.");
    expect(h.listDataSources).not.toHaveBeenCalled();
    expect(h.searchProspects).not.toHaveBeenCalled();
  });

  it("does nothing for a business without a Discovery licence", async () => {
    mockDb();
    h.requireModule.mockRejectedValue(new Error("Discovery isn't licensed for this business."));

    await expect(runFind(WORKSPACE, input)).rejects.toThrow("isn't licensed");
    expect(h.searchProspects).not.toHaveBeenCalled();
    expect(h.recordDataSourceRun).not.toHaveBeenCalled();
  });

  it("does not ask the gateway once the usage allowance is used up", async () => {
    mockDb();
    h.assertWithinUsageLimit.mockRejectedValue(new Error("This workspace has used its free-tier allowance."));

    await expect(runFind(WORKSPACE, input)).rejects.toThrow("free-tier allowance");
    expect(h.searchProspects).not.toHaveBeenCalled();
  });

  it("says Needs setup, asks nothing and records nothing, when the gateway is not set up", async () => {
    const supabase = mockDb();
    sources({
      sources: [{ ...stored, status: "needs_setup" }, webSearch, fileImport],
      quota: null,
      gateway: { state: "needs_setup", resetAt: null },
    });

    const outcome = await runFind(WORKSPACE, input);

    expect(outcome).toEqual({
      status: "failed",
      reason: "needs_setup",
      message: "Needs setup: WorksLake business data isn't set up yet.",
    });
    expect(h.searchProspects).not.toHaveBeenCalled();
    expect(h.recordDataSourceRun).not.toHaveBeenCalled();
    expect(supabase.queries()).toEqual([]);
  });

  it.each([
    ["a source the gateway lists as needing setup", "google_places", "needs_setup"],
    ["a source that is not in the server's list", "apollo", "invalid"],
    ["the file import, which is not a search", "file_import", "invalid"],
  ])("refuses %s, whatever the form sent", async (_label, sourceId, reason) => {
    mockDb();

    const outcome = await runFind(WORKSPACE, { ...input, sourceId });

    expect(outcome).toMatchObject({ status: "failed", reason });
    expect(h.searchProspects).not.toHaveBeenCalled();
  });

  it("asks what to look for rather than searching for a default", async () => {
    mockDb();

    const outcome = await runFind(WORKSPACE, { ...input, what: "  " });

    expect(outcome).toEqual({ status: "failed", reason: "invalid", message: "Enter what to look for." });
    expect(h.searchProspects).not.toHaveBeenCalled();
    expect(h.assertWithinUsageLimit).not.toHaveBeenCalled();
  });

  it("reports Unavailable, adds nothing and records the failed run, when the gateway fails", async () => {
    const supabase = mockDb();
    h.searchProspects.mockResolvedValue({ ok: false, failure: "unavailable", code: "TIMEOUT", resetAt: null, called: true });

    const outcome = await runFind(WORKSPACE, input);

    expect(outcome).toMatchObject({ status: "failed", reason: "unavailable" });
    expect((outcome as { message: string }).message).toMatch(/^Unavailable/);
    expect(supabase.queries()).toEqual([]);
    expect(h.recordDataSourceRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorCode: "TIMEOUT", source: "stored", operation: "gateway_search" }),
    );
  });

  it("shows the limit and when it resets on a quota refusal", async () => {
    mockDb();
    h.searchProspects.mockResolvedValue({
      ok: false,
      failure: "quota",
      code: "QUOTA_EXCEEDED",
      resetAt: "2026-12-01T00:00:00.000Z",
      called: true,
    });

    const outcome = await runFind(WORKSPACE, input);

    expect(outcome).toMatchObject({ status: "failed", reason: "quota" });
    const { message } = outcome as { message: string };
    expect(message).toContain("500 searches and 50 paid lookups a month");
    expect(message).toContain("1 Dec 2026");
  });

  it("treats a key the gateway refuses as a setup problem", async () => {
    mockDb();
    h.searchProspects.mockResolvedValue({ ok: false, failure: "forbidden", code: "HTTP_403", resetAt: null, called: true });

    expect(await runFind(WORKSPACE, input)).toMatchObject({ status: "failed", reason: "needs_setup" });
  });

  it("propagates a failure to stage the results rather than reporting success", async () => {
    h.createClient.mockResolvedValue(createFakeSupabase({ query: () => ({ data: null, error: new Error("insert denied") }) }));

    await expect(runFind(WORKSPACE, input)).rejects.toThrow("insert denied");
  });
});

describe("companies hiring for…", () => {
  it("asks the signals route with the keywords and stages what it returns", async () => {
    const supabase = mockDb();
    h.hiringSignals.mockResolvedValue({
      ok: true,
      data: { ...signalsResponse, results: [BusinessItemSchema.parse(signalsItem)], unreadable: 0 },
    });

    const outcome = await runFind(WORKSPACE, { sourceId: "signals:hiring", what: "identity governance, Saviynt", where: "" });

    expect(h.hiringSignals).toHaveBeenCalledWith({ tenantId: TENANT_ID }, {
      signal: "hiring",
      keywords: ["identity governance", "Saviynt"],
      locations: [],
      sinceDays: 30,
      limit: FIND_PAGE_SIZE,
      cursor: null,
    });
    expect(h.searchProspects).not.toHaveBeenCalled();
    expect(stagedRows(supabase)[0]).toMatchObject({
      company_name: "Acme Identity",
      match_reason: "2 open roles match your keywords (1 new this week).",
      source: "stored",
    });
    expect(h.recordDataSourceRun).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "gateway_signals", source: "hiring", status: "succeeded", resultCount: 1 }),
    );
    expect(outcome).toMatchObject({ status: "completed", sourceLabel: "Hiring signals", added: 1 });
  });

  it("is refused when the gateway does not list the signal", async () => {
    mockDb();
    sources({ sources: [stored, webSearch, fileImport] });

    const outcome = await runFind(WORKSPACE, { sourceId: "signals:hiring", what: "IAM", where: "" });

    expect(outcome).toMatchObject({ status: "failed", reason: "invalid" });
    expect(h.hiringSignals).not.toHaveBeenCalled();
  });
});

describe("Web search (AI)", () => {
  it("runs the existing AI discovery with the form's filters, and nothing of the gateway's", async () => {
    mockDb();
    h.discoverProspects.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

    const outcome = await runFind(WORKSPACE, {
      sourceId: "web_search",
      what: "Fintech",
      where: "Bengaluru",
      companySize: "50-500",
      alsoLookFor: "recently raised funding",
    });

    expect(h.discoverProspects).toHaveBeenCalledWith(WORKSPACE, {
      industry: "Fintech",
      location: "Bengaluru",
      companySize: "50-500",
      keywords: "recently raised funding",
    });
    expect(h.searchProspects).not.toHaveBeenCalled();
    expect(h.recordDataSourceRun).not.toHaveBeenCalled();
    // discoverProspects does its own usage check, inside its own lock.
    expect(h.assertWithinUsageLimit).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: "completed", sourceLabel: "Web search (AI)", found: 2, added: 2 });
  });

  it("falls back to the ICP's own criteria for a field left blank, as before", async () => {
    mockDb();
    h.discoverProspects.mockResolvedValue([]);

    await runFind(WORKSPACE, { sourceId: "web_search", what: "", where: "" });

    expect(h.discoverProspects).toHaveBeenCalledWith(WORKSPACE, {
      industry: undefined,
      location: undefined,
      companySize: undefined,
      keywords: undefined,
    });
  });

  it("still works when the gateway is not set up", async () => {
    mockDb();
    sources({ sources: [{ ...stored, status: "needs_setup" }, webSearch, fileImport], quota: null, gateway: { state: "needs_setup", resetAt: null } });
    h.discoverProspects.mockResolvedValue([{ id: "s1" }]);

    expect(await runFind(WORKSPACE, { sourceId: "web_search", what: "", where: "" })).toMatchObject({
      status: "completed",
      added: 1,
    });
    // It never asks the gateway for anything, so a gateway that is down cannot hold it up.
    expect(h.listDataSources).not.toHaveBeenCalled();
  });

  it("lets the AI discovery's own errors through for the screen to report", async () => {
    mockDb();
    h.discoverProspects.mockRejectedValue(new Error("Approve an ICP before discovering prospects."));

    await expect(runFind(WORKSPACE, { sourceId: "web_search", what: "", where: "" })).rejects.toThrow("Approve an ICP");
  });
});

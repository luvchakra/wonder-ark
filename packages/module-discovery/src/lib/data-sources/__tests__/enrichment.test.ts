/**
 * DISC-DATA-P0-04.1 (B8): enrichment. The gateway is stood in for at `fetch`, with the
 * contract's own JSON, so the real client and its checks run. What is pinned here:
 *  - a value a person typed is never overwritten: only blank columns are asked for, the
 *    write is conditional on the column still being blank, and a value typed while the
 *    lookup ran is kept;
 *  - every filled column is recorded in `field_sources` with the source the gateway named;
 *  - the free lookup sends `allowPaid: false`, and is not repeated once it has succeeded
 *    (the queued job after the immediate attempt);
 *  - a failed lookup changes nothing and is recorded as failed, so the page can say
 *    "Enrichment unavailable" and offer Retry;
 *  - "Fill missing details" sends `allowPaid: true`, and a double click spends once;
 *  - with no gateway settings nothing is sent and nothing is recorded;
 *  - the tenant is the prospect's business, and the drain cannot enrich a prospect of a
 *    business other than the event's;
 *  - what the gateway sends is stored as text, and an unusable value is not stored.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "./memory-db";
import {
  GATEWAY_KEY,
  GATEWAY_URL,
  INSTRUCTION_LOOKING_TEXT,
  TENANT_ID,
  enrichResponse,
  enrichResponseByName,
  enrichResponseFull,
  errorBody,
} from "./fixtures/contract";

const h = vi.hoisted(() => ({
  requireModule: vi.fn(),
  createClient: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/events/mutations", () => ({ publish: h.publish }));
vi.mock("../../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));
vi.mock("../../usage/limits", async (original) => ({
  ...(await original<typeof import("../../usage/limits")>()),
  assertWithinUsageLimit: h.assertWithinUsageLimit,
}));

const {
  ENRICHMENT_REQUESTED_EVENT,
  enrichProspect,
  enrichmentMessage,
  getEnrichmentState,
  missingEnrichFields,
  planEnrichment,
  queueProspectEnrichment,
  readEnrichedValue,
  runQueuedEnrichmentNow,
} = await import("../enrichment");

const WORKSPACE = "w1";
const PROSPECT = "p1";

/** A prospect a person added by hand: a name, a website and the industry they typed. */
function prospect(overrides: Record<string, unknown> = {}) {
  return {
    id: PROSPECT,
    workspace_id: WORKSPACE,
    kind: "company",
    company_name: "Acme",
    website: "https://acme.example",
    domain: "acme.example",
    industry: null,
    company_size: null,
    location: null,
    description: null,
    phone: null,
    company_email: null,
    linkedin_url: null,
    field_sources: {},
    ...overrides,
  };
}

let db: ReturnType<typeof createMemoryDb>;
let fetchMock: ReturnType<typeof vi.fn>;

function setup(row: Record<string, unknown> = prospect()) {
  db = createMemoryDb({ prospects: [row] }, { prospect_discovery_locks: "workspace_id" });
  h.createClient.mockResolvedValue(db.client);
}

function gatewayAnswers(body: unknown, status = 200) {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

const sentBody = (call = 0) => JSON.parse(String((fetchMock.mock.calls[call]![1] as RequestInit).body));
const stored = () => db.rows("prospects")[0]!;
const runs = () => db.rows("ai_runs");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSLAKE_GATEWAY_URL", GATEWAY_URL);
  vi.stubEnv("WORKSLAKE_GATEWAY_API_KEY", GATEWAY_KEY);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  h.getBusinessIdForWorkspace.mockResolvedValue(TENANT_ID);
  setup();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enrichment never overwrites a value a person typed", () => {
  it("asks only for the columns that are blank", async () => {
    setup(prospect({ industry: "Banking software", description: "Typed by the founder" }));
    gatewayAnswers(enrichResponseFull);

    await enrichProspect(PROSPECT, { allowPaid: false });

    expect(sentBody().fields).toEqual(["employeeRange", "phone", "email", "linkedinUrl", "hq"]);
    expect(stored().industry).toBe("Banking software");
    expect(stored().description).toBe("Typed by the founder");
  });

  it("ignores a value the gateway sends for a column that was not asked for", async () => {
    setup(prospect({ industry: "Banking software" }));
    // The full answer includes `industry: "Software"` although it was not requested.
    gatewayAnswers(enrichResponseFull);

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(stored().industry).toBe("Banking software");
    expect((stored().field_sources as Record<string, unknown>).industry).toBeUndefined();
    expect(outcome.status === "completed" && outcome.filled).not.toContain("Industry");
  });

  it("keeps a value typed while the lookup was running, and does not credit it to a source", async () => {
    fetchMock.mockImplementation(async () => {
      // The person saves an industry after the request left and before the answer came.
      stored().industry = "Typed meanwhile";
      return new Response(JSON.stringify(enrichResponseFull), { status: 200 });
    });

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(stored().industry).toBe("Typed meanwhile");
    expect((stored().field_sources as Record<string, unknown>).industry).toBeUndefined();
    expect(outcome.status === "completed" && outcome.filled).not.toContain("Industry");
    // Every write to a detail column was conditional on that column being empty.
    const writes = db.client.queries("prospects").filter((call) => call.ops.some((op) => op.method === "update"));
    const detailWrites = writes.filter((call) => !("field_sources" in (call.ops.find((op) => op.method === "update")!.args[0] as object)));
    expect(detailWrites.length).toBeGreaterThan(0);
    for (const call of detailWrites) {
      const column = Object.keys(call.ops.find((op) => op.method === "update")!.args[0] as object)[0];
      expect(call.ops.find((op) => op.method === "is")?.args).toEqual([column, null]);
    }
  });

  it("asks nothing at all when every column already has a value", async () => {
    setup(
      prospect({
        industry: "a",
        company_size: "b",
        location: "c",
        description: "d",
        phone: "e",
        company_email: "f@acme.example",
        linkedin_url: "https://www.linkedin.com/company/x",
      }),
    );

    expect(await enrichProspect(PROSPECT, { allowPaid: false })).toEqual({ status: "nothing_to_fill" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("enrich on approval (free lookup)", () => {
  it("fills the blanks, with free sources only, for the prospect's business", async () => {
    gatewayAnswers(enrichResponseFull);

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${GATEWAY_URL}/v1/prospects/enrich`);
    expect((init.headers as Record<string, string>)["X-Tenant-Id"]).toBe(TENANT_ID);
    expect(sentBody()).toMatchObject({ domain: "acme.example", name: "Acme", allowPaid: false });
    expect(stored()).toMatchObject({
      industry: "Software",
      company_size: "51-200",
      description: "Identity governance software for mid-sized banks.",
      phone: "+91 20 5550 0100",
      company_email: "info@acme.example",
      linkedin_url: "https://www.linkedin.com/company/acme-example",
      location: "Pune, IN",
    });
    expect(outcome).toMatchObject({ status: "completed", unitsSpent: 0 });
    expect(h.requireModule).toHaveBeenCalledWith(TENANT_ID, "discovery");
    expect(h.assertWithinUsageLimit).toHaveBeenCalled();
  });

  it("records where each filled column came from", async () => {
    gatewayAnswers(enrichResponseFull);

    await enrichProspect(PROSPECT, { allowPaid: false });

    expect(stored().field_sources).toMatchObject({
      industry: { provider: "wikidata", name: "Wikidata", url: "https://www.wikidata.org/wiki/Q1", observedAt: "2026-10-30T00:00:00Z" },
      company_size: { provider: "directory", name: "Company directory", url: null },
      phone: { provider: "stored", name: "OpenStreetMap contributors (ODbL)" },
      company_email: { provider: "site", name: "acme.example" },
    });
  });

  it("keeps the sources already recorded for other columns", async () => {
    const website = { provider: "stored", name: "OpenStreetMap contributors (ODbL)", url: null, observedAt: null };
    setup(prospect({ field_sources: { website } }));
    gatewayAnswers(enrichResponse);

    await enrichProspect(PROSPECT, { allowPaid: false });

    expect(stored().field_sources).toMatchObject({ website, industry: { name: "Wikidata" } });
  });

  it("leaves a field the gateway could not fill blank", async () => {
    gatewayAnswers(enrichResponse); // industry filled, employeeRange null, the rest absent

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(stored()).toMatchObject({ industry: "Software", company_size: null, description: null });
    expect(outcome).toMatchObject({ status: "completed", filled: ["Industry"] });
  });

  it("looks up by name alone when the prospect has no website", async () => {
    setup(prospect({ website: null, domain: null, location: "Pune" }));
    gatewayAnswers(enrichResponseByName);

    await enrichProspect(PROSPECT, { allowPaid: false });

    expect(sentBody()).toMatchObject({ name: "Acme", location: "Pune" });
    expect(sentBody()).not.toHaveProperty("domain");
    expect(stored().industry).toBe("Software");
  });

  it("records the run, and is not repeated once it has succeeded", async () => {
    gatewayAnswers(enrichResponse);

    await enrichProspect(PROSPECT, { allowPaid: false });
    // The queued job, arriving after the immediate attempt. A blank still remains.
    expect(await enrichProspect(PROSPECT, { allowPaid: false })).toEqual({ status: "already_done" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({
      workspace_id: WORKSPACE,
      operation: "gateway_enrich",
      status: "succeeded",
      result_count: 1,
      units_spent: 0,
    });
    expect(await getEnrichmentState({ id: PROSPECT, workspace_id: WORKSPACE })).toBe("succeeded");
  });
});

describe("a failed lookup", () => {
  it("leaves the prospect exactly as it was and is recorded as failed", async () => {
    const before = structuredClone(prospect({ industry: "Typed" }));
    setup(structuredClone(before));
    gatewayAnswers(errorBody("NOT_FOUND"), 404);

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(outcome).toMatchObject({ status: "failed", reason: "unavailable" });
    expect(enrichmentMessage(outcome)).toContain("Enrichment unavailable");
    expect(stored()).toEqual(before);
    expect(db.client.queries("prospects").some((call) => call.ops.some((op) => op.method === "update"))).toBe(false);
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ status: "failed", error_code: "NOT_FOUND" });
    expect(await getEnrichmentState({ id: PROSPECT, workspace_id: WORKSPACE })).toBe("failed");
  });

  it("can be retried, and the retry fills the blanks", async () => {
    gatewayAnswers(errorBody("PROVIDER_UNAVAILABLE"), 502);
    await enrichProspect(PROSPECT, { allowPaid: false });
    gatewayAnswers(enrichResponse);

    const retry = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(retry).toMatchObject({ status: "completed", filled: ["Industry"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await getEnrichmentState({ id: PROSPECT, workspace_id: WORKSPACE })).toBe("succeeded");
  });

  it("is a failure, not a result, when the answer does not match the contract", async () => {
    gatewayAnswers({ requestId: "req", fields: "everything" });

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(outcome).toMatchObject({ status: "failed", reason: "unavailable" });
    expect(stored().industry).toBeNull();
    expect(runs()[0]).toMatchObject({ status: "failed", error_code: "BAD_RESPONSE" });
  });

  it("says when the quota is used up", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify(errorBody("QUOTA_EXCEEDED")), { status: 429, headers: { "Retry-After": "3600" } }),
    );

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(outcome).toMatchObject({ status: "failed", reason: "quota" });
    expect(enrichmentMessage(outcome)).toContain("lookup limit");
  });

  it("says Needs setup, sends nothing and records nothing without gateway settings", async () => {
    vi.stubEnv("WORKSLAKE_GATEWAY_URL", "");

    const outcome = await enrichProspect(PROSPECT, { allowPaid: false });

    expect(outcome).toMatchObject({ status: "failed", reason: "needs_setup" });
    expect(enrichmentMessage(outcome)).toContain("Needs setup");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runs()).toHaveLength(0);
    expect(await getEnrichmentState({ id: PROSPECT, workspace_id: WORKSPACE })).toBeNull();
  });
});

describe("Fill missing details (paid lookup)", () => {
  it("allows paid sources and reports what it spent", async () => {
    gatewayAnswers({ ...enrichResponseFull, usage: { unitsSpent: 2, tenantRemaining: { search: 480, paid: 48 } } });

    const outcome = await enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" });

    expect(sentBody().allowPaid).toBe(true);
    expect(outcome).toMatchObject({ status: "completed", unitsSpent: 2, paidRemaining: 48 });
    expect(enrichmentMessage(outcome)).toContain("Used 2 paid lookups; 48 left.");
    expect(runs()[0]).toMatchObject({ status: "succeeded", units_spent: 2 });
  });

  it("spends once when the same click arrives twice", async () => {
    gatewayAnswers(enrichResponse);

    const first = await enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" });
    const second = await enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" });

    expect(first.status).toBe("completed");
    expect(second).toEqual({ status: "already_done" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runs()).toHaveLength(1);
  });

  it("spends once when two requests for the same click run at the same moment", async () => {
    gatewayAnswers(enrichResponse);

    const outcomes = await Promise.all([
      enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" }),
      enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((outcome) => outcome.status === "completed")).toHaveLength(1);
    // The other was turned away before anything was sent, and says nothing was spent.
    const other = outcomes.find((outcome) => outcome.status !== "completed")!;
    expect(other.status === "already_done" || (other.status === "failed" && other.reason === "busy")).toBe(true);
    expect(db.rows("prospect_discovery_locks")).toHaveLength(0);
  });

  it("does not ask again for a click whose lookup failed, since it may have been charged", async () => {
    gatewayAnswers(errorBody("PROVIDER_UNAVAILABLE"), 502);
    await enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" });

    expect(await enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" })).toEqual({ status: "already_done" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A new click is a new decision and is asked.
    await enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("releases the lookup lock when the gateway fails", async () => {
    gatewayAnswers(errorBody("PROVIDER_UNAVAILABLE"), 502);
    await enrichProspect(PROSPECT, { allowPaid: true, requestKey: "click-1" });
    expect(db.rows("prospect_discovery_locks")).toHaveLength(0);
  });

  it("refuses a paid lookup that carries no click key", async () => {
    await expect(enrichProspect(PROSPECT, { allowPaid: true })).rejects.toThrow("key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("checks before the gateway is asked", () => {
  it("stops at the licence check", async () => {
    h.requireModule.mockRejectedValueOnce(new Error("Discovery is not licensed."));
    await expect(enrichProspect(PROSPECT, { allowPaid: false })).rejects.toThrow("not licensed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops at the usage allowance", async () => {
    h.assertWithinUsageLimit.mockRejectedValueOnce(new Error("allowance used"));
    await expect(enrichProspect(PROSPECT, { allowPaid: false })).rejects.toThrow("allowance used");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for a prospect the caller cannot read", async () => {
    setup(prospect({ id: "someone-elses" }));
    expect(await enrichProspect(PROSPECT, { allowPaid: false })).toMatchObject({ status: "failed", reason: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for a channel, which is not an organisation", async () => {
    setup(prospect({ kind: "channel" }));
    expect(await enrichProspect(PROSPECT, { allowPaid: false })).toEqual({ status: "nothing_to_fill" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("from the drain, refuses a prospect that is not the event's business's", async () => {
    gatewayAnswers(enrichResponse);
    const outcome = await enrichProspect(PROSPECT, {
      allowPaid: false,
      client: db.client as never,
      businessId: "00000000-0000-4000-8000-000000000999",
    });
    expect(outcome).toMatchObject({ status: "failed", reason: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
    // With the right business it runs, and without a session there is no licence call:
    // the drain parked the event already if the business had no licence.
    await enrichProspect(PROSPECT, { allowPaid: false, client: db.client as never, businessId: TENANT_ID });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.requireModule).not.toHaveBeenCalled();
  });
});

describe("what the gateway sends is data", () => {
  it("stores text that reads like an instruction as one tidied line of text", async () => {
    gatewayAnswers({
      ...enrichResponse,
      fields: {
        description: { value: INSTRUCTION_LOOKING_TEXT, source: { provider: "site", name: "acme.example", url: null }, observedAt: "2026-11-01T00:00:00Z" },
      },
    });

    await enrichProspect(PROSPECT, { allowPaid: false });

    expect(stored().description).toBe(INSTRUCTION_LOOKING_TEXT.replace(/\s+/g, " "));
    expect(sentBody()).not.toHaveProperty("X-Tenant-Id");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "X-Tenant-Id": TENANT_ID });
  });

  it("stores no link that is not plain http(s), no mailbox that is not one, and no value without a named source", () => {
    expect(readEnrichedValue("linkedinUrl", "javascript:alert(1)")).toBeNull();
    expect(readEnrichedValue("linkedinUrl", "https://www.linkedin.com/company/acme")).toBe("https://www.linkedin.com/company/acme");
    expect(readEnrichedValue("email", "not an address")).toBeNull();
    expect(readEnrichedValue("industry", 42)).toBeNull();
    expect(readEnrichedValue("hq", { text: null, city: "Pune", region: null, country: "IN" })).toBe("Pune, IN");
    expect(
      planEnrichment(["industry"], {
        industry: { value: "Software", source: { provider: "wikidata", name: "   " }, observedAt: "2026-10-30T00:00:00Z" },
      }),
    ).toEqual([]);
  });

  it("treats a blank or whitespace value as missing", () => {
    expect(missingEnrichFields({ industry: "  ", company_size: "51-200" })).toEqual([
      "industry",
      "description",
      "phone",
      "email",
      "linkedinUrl",
      "hq",
    ]);
  });
});

describe("queueing and the attempt after approval", () => {
  it("queues one event per prospect for the workspace's business, licence-gated", async () => {
    await queueProspectEnrichment(WORKSPACE, ["p1", "p2"]);

    expect(h.publish).toHaveBeenCalledTimes(2);
    expect(h.publish).toHaveBeenCalledWith({
      businessId: TENANT_ID,
      type: ENRICHMENT_REQUESTED_EVENT,
      payload: { prospectId: "p1" },
      requiredModule: "discovery",
    });
  });

  it("queues nothing for an empty list", async () => {
    await queueProspectEnrichment(WORKSPACE, []);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("the attempt after approval never throws, whatever a lookup does", async () => {
    h.requireModule.mockRejectedValue(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runQueuedEnrichmentNow([PROSPECT, "p2"])).resolves.toBeUndefined();
    error.mockRestore();
  });
});

describe("enrichmentMessage", () => {
  it("names what was filled, and says when nothing was spent", () => {
    expect(
      enrichmentMessage({ status: "completed", filled: ["Industry", "Phone"], unitsSpent: 0, paidRemaining: 50, providerIssues: [] }),
    ).toBe("Filled: Industry, Phone. No paid lookups were used.");
  });

  it("says when nothing was found, and when a source needs setup", () => {
    expect(
      enrichmentMessage({
        status: "completed",
        filled: [],
        unitsSpent: 0,
        paidRemaining: 50,
        providerIssues: [{ id: "apollo", status: "needs_setup" }],
      }),
    ).toBe("Nothing new was found for the missing details. No paid lookups were used. Some sources need setup and were not asked.");
  });

  it("never words a second click as a second spend", () => {
    expect(enrichmentMessage({ status: "already_done" })).toBe("This lookup already ran. Nothing more was spent.");
  });
});

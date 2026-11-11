/**
 * DISC-DATA-P0-02.1/02.2 (B8): the WorksLake gateway client against the shared
 * contract. What is pinned here:
 *  - it talks to one host, with the key as a bearer token and the server-resolved
 *    business id as X-Tenant-Id;
 *  - without settings it reports `needs_setup` and makes no request;
 *  - each expected failure is a typed result, never an exception, and never retried;
 *  - a response is accepted only in the contract's shape: unknown extra fields are
 *    ignored, a missing or mistyped named field is refused;
 *  - text that looks like an instruction is returned as the data it is and changes
 *    nothing about the request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GATEWAY_KEY,
  GATEWAY_URL,
  INSTRUCTION_LOOKING_TEXT,
  TENANT_ID,
  businessItem,
  channelItem,
  contactsRequest,
  contactsResponse,
  enrichRequest,
  enrichResponse,
  errorBody,
  searchRequest,
  searchResponse,
  signalsRequest,
  signalsResponse,
  sourcesResponse,
  suppressRequest,
  suppressResponse,
} from "./fixtures/contract";
import {
  GATEWAY_TIMEOUT_MS,
  enrichOrganisation,
  findContacts,
  hiringSignals,
  isGatewayConfigured,
  listSources,
  parseRetryAfter,
  readGatewayConfig,
  searchProspects,
  suppress,
  type GatewayFailure,
} from "../workslake-client";

const caller = { tenantId: TENANT_ID };
const fetchMock = vi.fn();

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

function lastCall(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: url as string, init: init as RequestInit & { headers: Record<string, string> } };
}

function asFailure(result: { ok: boolean }): GatewayFailure {
  expect(result.ok).toBe(false);
  return result as GatewayFailure;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WORKSLAKE_GATEWAY_URL", GATEWAY_URL);
  vi.stubEnv("WORKSLAKE_GATEWAY_API_KEY", GATEWAY_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("settings", () => {
  it("reports needs_setup, and makes no request, when the address is missing", async () => {
    vi.stubEnv("WORKSLAKE_GATEWAY_URL", "");

    const result = asFailure(await listSources(caller));

    expect(result).toMatchObject({ failure: "needs_setup", code: "NOT_CONFIGURED", called: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isGatewayConfigured()).toBe(false);
  });

  it("reports needs_setup, and makes no request, when the key is missing", async () => {
    vi.stubEnv("WORKSLAKE_GATEWAY_API_KEY", "");

    const result = asFailure(await searchProspects(caller, searchRequest));

    expect(result).toMatchObject({ failure: "needs_setup", called: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the gateway root", "https://gateway.workslake.test", "https://gateway.workslake.test/v1"],
    ["a trailing slash", "https://gateway.workslake.test/", "https://gateway.workslake.test/v1"],
    ["the root already ending in /v1", "https://gateway.workslake.test/v1", "https://gateway.workslake.test/v1"],
    ["a path prefix", "https://app.workslake.test/api/gateway/", "https://app.workslake.test/api/gateway/v1"],
    ["a local address in development", "http://localhost:3000", "http://localhost:3000/v1"],
  ])("accepts %s", (_label, url, baseUrl) => {
    expect(readGatewayConfig({ WORKSLAKE_GATEWAY_URL: url, WORKSLAKE_GATEWAY_API_KEY: "k" } as NodeJS.ProcessEnv)).toEqual({
      baseUrl,
      apiKey: "k",
    });
  });

  it.each([
    ["plain http to a real host, which would send the key in the clear", "http://gateway.workslake.test"],
    ["an address carrying credentials", "https://user:pass@gateway.workslake.test"],
    ["something that is not an address", "gateway"],
  ])("refuses %s", (_label, url) => {
    expect(readGatewayConfig({ WORKSLAKE_GATEWAY_URL: url, WORKSLAKE_GATEWAY_API_KEY: "k" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("the request", () => {
  it("goes to the gateway's /v1/prospects route with the key and the tenant", async () => {
    respond(200, searchResponse);

    await searchProspects(caller, searchRequest);

    const { url, init } = lastCall();
    expect(url).toBe(`${GATEWAY_URL}/v1/prospects/search`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${GATEWAY_KEY}`);
    expect(init.headers["X-Tenant-Id"]).toBe(TENANT_ID);
    expect(JSON.parse(init.body as string)).toEqual(searchRequest);
    expect(init.cache).toBe("no-store");
    // A redirect is refused rather than followed: the key goes to one host only.
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(GATEWAY_TIMEOUT_MS).toBe(12_000);
  });

  it("lists sources with a GET and no body", async () => {
    respond(200, sourcesResponse);

    await listSources(caller);

    const { url, init } = lastCall();
    expect(url).toBe(`${GATEWAY_URL}/v1/prospects/sources`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers["X-Tenant-Id"]).toBe(TENANT_ID);
  });

  it.each([["an empty tenant", ""], ["a tenant that is not a business id", "acme"], ["a header-injection attempt", `${TENANT_ID}\r\nX-Admin: 1`]])(
    "refuses %s without calling the gateway",
    async (_label, tenantId) => {
      const result = asFailure(await searchProspects({ tenantId }, searchRequest));

      expect(result).toMatchObject({ failure: "unavailable", code: "TENANT_REQUIRED", called: false });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("refuses a request that breaks the contract before it is sent", async () => {
    const tooMany = asFailure(await searchProspects(caller, { ...searchRequest, limit: 51 }));
    const noSubject = asFailure(await enrichOrganisation(caller, { fields: ["industry"], allowPaid: false }));

    expect(tooMany).toMatchObject({ failure: "unavailable", code: "BAD_REQUEST", called: false });
    expect(noSubject).toMatchObject({ failure: "unavailable", code: "BAD_REQUEST", called: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("each failure type", () => {
  it("503 PROVIDER_NEEDS_SETUP is needs_setup", async () => {
    respond(503, errorBody("PROVIDER_NEEDS_SETUP"));

    expect(asFailure(await searchProspects(caller, searchRequest))).toMatchObject({
      failure: "needs_setup",
      code: "PROVIDER_NEEDS_SETUP",
      called: true,
    });
  });

  it.each([
    ["502 PROVIDER_UNAVAILABLE", 502, errorBody("PROVIDER_UNAVAILABLE"), "PROVIDER_UNAVAILABLE"],
    ["a 503 that is not a setup problem", 503, errorBody("MAINTENANCE"), "MAINTENANCE"],
    ["a 500 with no readable body", 500, "<html>oops</html>", "HTTP_500"],
    ["400 TENANT_REQUIRED", 400, errorBody("TENANT_REQUIRED"), "TENANT_REQUIRED"],
    ["a 404", 404, errorBody("NOT_FOUND"), "NOT_FOUND"],
  ])("%s is unavailable", async (_label, status, body, code) => {
    respond(status, body);

    expect(asFailure(await searchProspects(caller, searchRequest))).toMatchObject({
      failure: "unavailable",
      code,
      called: true,
    });
  });

  it("a timeout is unavailable", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    expect(asFailure(await searchProspects(caller, searchRequest))).toMatchObject({
      failure: "unavailable",
      code: "TIMEOUT",
      called: true,
    });
  });

  it("a network failure is unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(asFailure(await listSources(caller))).toMatchObject({ failure: "unavailable", code: "NETWORK" });
  });

  it("429 QUOTA_EXCEEDED is quota, with the reset time from Retry-After", async () => {
    respond(429, errorBody("QUOTA_EXCEEDED"), { "Retry-After": "3600" });
    const before = Date.now();

    const result = asFailure(await searchProspects(caller, searchRequest));

    expect(result).toMatchObject({ failure: "quota", code: "QUOTA_EXCEEDED", called: true });
    const resetAt = new Date(result.resetAt!).getTime();
    expect(resetAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(resetAt).toBeLessThanOrEqual(Date.now() + 3_600_000);
  });

  it("reads Retry-After as seconds or as a date, and reports no reset time when it has neither", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    expect(parseRetryAfter("120", now)).toBe("2026-11-11T00:02:00.000Z");
    expect(parseRetryAfter("Tue, 01 Dec 2026 00:00:00 GMT", now)).toBe("2026-12-01T00:00:00.000Z");
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });

  it.each([[401], [403]])("%i is forbidden", async (status) => {
    respond(status, errorBody("FORBIDDEN"));

    expect(asFailure(await findContacts(caller, contactsRequest))).toMatchObject({
      failure: "forbidden",
      called: true,
      resetAt: null,
    });
  });

  it.each([
    ["a timeout", () => fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"))],
    ["a 502", () => respond(502, errorBody("PROVIDER_UNAVAILABLE"))],
    ["a 429", () => respond(429, errorBody("QUOTA_EXCEEDED"))],
  ])("never retries a POST that can spend units after %s", async (_label, arrange) => {
    arrange();

    await findContacts(caller, contactsRequest);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("a malformed response", () => {
  it("is unavailable when the body is not JSON", async () => {
    respond(200, "not json");

    expect(asFailure(await searchProspects(caller, searchRequest))).toMatchObject({
      failure: "unavailable",
      code: "BAD_RESPONSE",
      called: true,
    });
  });

  it.each([
    ["no usage", { ...searchResponse, usage: undefined }],
    ["results that are not a list", { ...searchResponse, results: "none" }],
    ["a provider status the contract does not name", {
      ...searchResponse,
      metadata: { ...searchResponse.metadata, providers: [{ id: "stored", status: "fine", returned: 1 }] },
    }],
    ["an error body sent with 200", errorBody("PROVIDER_UNAVAILABLE")],
  ])("is unavailable when the envelope has %s", async (_label, body) => {
    respond(200, body);

    expect(asFailure(await searchProspects(caller, searchRequest))).toMatchObject({
      failure: "unavailable",
      code: "BAD_RESPONSE",
    });
  });

  it("drops and counts a result that breaks the item shape, keeping the rest", async () => {
    const noSource = { ...businessItem, id: "businesses_bad1", source: undefined };
    const noName = { ...businessItem, id: "businesses_bad2", name: "" };
    const wrongKind = { ...businessItem, id: "businesses_bad3", kind: "person" };
    respond(200, { ...searchResponse, results: [businessItem, noSource, noName, wrongKind, "text"] });

    const result = await searchProspects(caller, searchRequest);

    expect(result.ok && result.data.results.map((item) => item.id)).toEqual([businessItem.id]);
    expect(result.ok && result.data.unreadable).toBe(4);
  });

  it.each([
    ["sources", () => listSources(caller), { sources: [{ id: "stored" }], quota: sourcesResponse.quota }],
    ["enrich", () => enrichOrganisation(caller, enrichRequest), { ...enrichResponse, fields: [] }],
    ["contacts", () => findContacts(caller, contactsRequest), {
      ...contactsResponse,
      contacts: [{ ...contactsResponse.contacts[0], emailStatus: "probably fine" }],
    }],
    ["signals", () => hiringSignals(caller, signalsRequest), { requestId: "req_1" }],
    ["suppress", () => suppress(caller, suppressRequest), { accepted: "yes" }],
  ])("refuses a %s response that breaks the contract", async (_label, call, body) => {
    respond(200, body);

    expect(asFailure(await call())).toMatchObject({ failure: "unavailable", code: "BAD_RESPONSE" });
  });
});

describe("the contract's examples", () => {
  it("reads a business search response", async () => {
    respond(200, searchResponse);

    const result = await searchProspects(caller, searchRequest);

    expect(result).toEqual({ ok: true, data: { ...searchResponse, unreadable: 0 } });
  });

  it("reads a channel search response", async () => {
    respond(200, { ...searchResponse, kind: "channel", results: [channelItem] });

    const result = await searchProspects(caller, { ...searchRequest, kind: "channel" });

    expect(result.ok && result.data.results).toEqual([channelItem]);
  });

  it("ignores fields the contract does not name", async () => {
    respond(200, {
      ...searchResponse,
      debug: { shard: 3 },
      results: [{ ...businessItem, rating: 4.5, source: { ...businessItem.source, licence: "ODbL" } }],
    });

    const result = await searchProspects(caller, searchRequest);

    expect(result.ok && result.data.results).toEqual([businessItem]);
    expect(result.ok && "debug" in result.data).toBe(false);
  });

  it("reads an enrich response, where an unfilled field is null", async () => {
    respond(200, enrichResponse);

    const result = await enrichOrganisation(caller, enrichRequest);

    expect(result).toEqual({ ok: true, data: enrichResponse });
    expect(JSON.parse(lastCall().init.body as string)).toEqual(enrichRequest);
    expect(lastCall().url).toBe(`${GATEWAY_URL}/v1/prospects/enrich`);
  });

  it("reads a contacts response", async () => {
    respond(200, contactsResponse);

    const result = await findContacts(caller, contactsRequest);

    expect(result).toEqual({ ok: true, data: contactsResponse });
    expect(lastCall().url).toBe(`${GATEWAY_URL}/v1/prospects/contacts`);
  });

  it("reads a hiring-signals response", async () => {
    respond(200, signalsResponse);

    const result = await hiringSignals(caller, signalsRequest);

    expect(result.ok && result.data.results[0]!.signals).toEqual({
      openJobs: 4,
      newJobs7d: 1,
      matched: 2,
      matchedTitles: ["IAM Engineer", "Identity Governance Lead"],
    });
    expect(JSON.parse(lastCall().init.body as string)).toEqual(signalsRequest);
    expect(lastCall().url).toBe(`${GATEWAY_URL}/v1/prospects/signals`);
  });

  it("reads the source list and the tenant's quota", async () => {
    respond(200, sourcesResponse);

    expect(await listSources(caller)).toEqual({ ok: true, data: sourcesResponse });
  });

  it("reads a suppress response", async () => {
    respond(200, suppressResponse);

    expect(await suppress(caller, suppressRequest)).toEqual({ ok: true, data: suppressResponse });
    expect(lastCall().url).toBe(`${GATEWAY_URL}/v1/prospects/suppress`);
  });
});

describe("text that looks like instructions", () => {
  it("comes back as the data it is, and changes nothing about who the call is for", async () => {
    respond(200, {
      ...searchResponse,
      results: [{ ...businessItem, name: INSTRUCTION_LOOKING_TEXT, description: INSTRUCTION_LOOKING_TEXT }],
    });

    const result = await searchProspects(caller, searchRequest);

    const item = result.ok ? result.data.results[0]! : null;
    expect(item).toMatchObject({ name: INSTRUCTION_LOOKING_TEXT, description: INSTRUCTION_LOOKING_TEXT });
    // One request, to the same host, for the same tenant, with the same key.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastCall().url).toBe(`${GATEWAY_URL}/v1/prospects/search`);
    expect(lastCall().init.headers["X-Tenant-Id"]).toBe(TENANT_ID);
    expect(lastCall().init.headers.Authorization).toBe(`Bearer ${GATEWAY_KEY}`);
  });
});

/**
 * DISC-DATA-P0-04.1/04.2: enrich, contacts and suppress as the gateway serves them. The
 * client's checks for these three routes were written against the contract's examples;
 * these fixtures add what the gateway adds (a `metadata.providers` list, `termsPending`
 * on a source, `domain: null` for a lookup by name) and pin that each is read, that
 * extra information the client cannot read never costs the person the answer, and that
 * a broken answer is still refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GATEWAY_KEY,
  GATEWAY_URL,
  TENANT_ID,
  contactsRequest,
  contactsResponseGenericOnly,
  contactsResponseMany,
  enrichRequest,
  enrichResponseByName,
  enrichResponseFull,
  errorBody,
  suppressRequest,
  suppressResponse,
} from "./fixtures/contract";

const { enrichOrganisation, findContacts, providerIssuesOf, suppress } = await import("../workslake-client");

const caller = { tenantId: TENANT_ID };
let fetchMock: ReturnType<typeof vi.fn>;
const answers = (body: unknown, status = 200) =>
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubEnv("WORKSLAKE_GATEWAY_URL", GATEWAY_URL);
  vi.stubEnv("WORKSLAKE_GATEWAY_API_KEY", GATEWAY_KEY);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enrich", () => {
  it("reads every field, termsPending on a source, and the providers that need setup", async () => {
    answers(enrichResponseFull);
    const result = await enrichOrganisation(caller, enrichRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.fields)).toHaveLength(7);
    expect(result.data.fields.employeeRange?.source.termsPending).toBe(false);
    expect(providerIssuesOf(result.data.metadata)).toEqual([{ id: "apollo", status: "needs_setup" }]);
  });

  it("accepts a null domain, as returned for a lookup by name", async () => {
    answers(enrichResponseByName);
    const result = await enrichOrganisation(caller, { name: "Acme", fields: ["industry"], allowPaid: false });
    expect(result.ok && result.data.domain).toBeNull();
  });

  it("still refuses an answer whose filled field names no source", async () => {
    answers({ ...enrichResponseFull, fields: { industry: { value: "Software", observedAt: "2026-10-30T00:00:00Z" } } });
    expect(await enrichOrganisation(caller, enrichRequest)).toMatchObject({ ok: false, failure: "unavailable", code: "BAD_RESPONSE" });
  });
});

describe("contacts", () => {
  it("reads an answer with no named person and the providers reported as needing setup", async () => {
    answers(contactsResponseGenericOnly);
    const result = await findContacts(caller, contactsRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.contacts).toEqual([]);
    expect(result.data.generic[0]).toMatchObject({ email: "info@acme.example", emailStatus: "unverified" });
    expect(providerIssuesOf(result.data.metadata)).toEqual([
      { id: "hunter", status: "needs_setup" },
      { id: "apollo", status: "needs_setup" },
    ]);
  });

  it("reads every address status", async () => {
    answers(contactsResponseMany);
    const result = await findContacts(caller, contactsRequest);
    expect(result.ok && result.data.contacts.map((person) => person.emailStatus)).toEqual(["verified", "risky", "invalid", "verified"]);
  });

  it("refuses an answer with an address status the contract does not name", async () => {
    const person = { ...contactsResponseMany.contacts[0]!, emailStatus: "probably fine" };
    answers({ ...contactsResponseMany, contacts: [person] });
    expect(await findContacts(caller, contactsRequest)).toMatchObject({ ok: false, code: "BAD_RESPONSE" });
  });
});

describe("providerIssuesOf", () => {
  it("is empty when there is no metadata, or none this client can read", () => {
    expect(providerIssuesOf(undefined)).toEqual([]);
    expect(providerIssuesOf("providers: all fine")).toEqual([]);
    expect(providerIssuesOf({ providers: "none" })).toEqual([]);
  });

  it("leaves out an entry it cannot read instead of failing the answer", async () => {
    const metadata = { providers: [{ id: "site", status: "ok" }, { id: "hunter", status: "sleeping" }, { status: "quota" }, { id: "apollo", status: "unavailable" }] };
    expect(providerIssuesOf(metadata)).toEqual([{ id: "apollo", status: "unavailable" }]);
    // And the answer that carried it is still accepted.
    answers({ ...contactsResponseGenericOnly, metadata });
    expect((await findContacts(caller, contactsRequest)).ok).toBe(true);
  });
});

describe("suppress", () => {
  it("sends the addresses and reads how many were accepted", async () => {
    answers(suppressResponse);
    const result = await suppress(caller, suppressRequest);
    expect(result).toEqual({ ok: true, data: { accepted: 1 } });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${GATEWAY_URL}/v1/prospects/suppress`);
    expect(JSON.parse(String(init.body))).toEqual(suppressRequest);
  });

  it("reports a full removal list as unavailable, with the gateway's code", async () => {
    answers(errorBody("SUPPRESSION_LIST_FULL"), 507);
    expect(await suppress(caller, suppressRequest)).toMatchObject({
      ok: false,
      failure: "unavailable",
      code: "SUPPRESSION_LIST_FULL",
      called: true,
    });
  });

  it("reports a route that is not served yet as unavailable", async () => {
    answers(errorBody("NOT_FOUND"), 404);
    expect(await suppress(caller, suppressRequest)).toMatchObject({ ok: false, failure: "unavailable" });
  });
});

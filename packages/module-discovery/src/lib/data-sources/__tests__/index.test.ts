/**
 * DISC-DATA-P0-02.2 (B2 "Done when"): with no settings the source list shows the gateway
 * as "Needs setup" and the two local sources still stand; with settings, the gateway's
 * own answer drives the list. The tenant sent is the workspace's business, read on the
 * server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TENANT_ID, sourcesResponse } from "./fixtures/contract";

const h = vi.hoisted(() => ({
  getBusinessIdForWorkspace: vi.fn(),
  listSources: vi.fn(),
}));

vi.mock("../../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));
vi.mock("../workslake-client", () => ({ listSources: h.listSources }));

const { listDataSources, fromGatewaySource } = await import("../index");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";

function gatewayFails(failure: string, resetAt: string | null = null) {
  h.listSources.mockResolvedValue({ ok: false, failure, code: "X", resetAt, called: failure !== "needs_setup" });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getBusinessIdForWorkspace.mockResolvedValue(TENANT_ID);
});

describe("listDataSources", () => {
  it("shows the gateway as Needs setup, with web search and import still there, when it is not set up", async () => {
    gatewayFails("needs_setup");

    const list = await listDataSources(WORKSPACE);

    expect(list.gateway).toEqual({ state: "needs_setup", resetAt: null });
    expect(list.quota).toBeNull();
    expect(list.sources.map((s) => [s.id, s.status, s.origin])).toEqual([
      ["stored", "needs_setup", "gateway"],
      ["web_search", "active", "local"],
      ["file_import", "active", "local"],
    ]);
  });

  it("is driven by the gateway's own list when it answers", async () => {
    h.listSources.mockResolvedValue({ ok: true, data: sourcesResponse });

    const list = await listDataSources(WORKSPACE);

    expect(list.gateway.state).toBe("ok");
    expect(list.quota).toEqual(sourcesResponse.quota);
    expect(list.sources.map((s) => s.id)).toEqual(["stored", "google_places", "web_search", "file_import"]);
    expect(list.sources[0]).toEqual({
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
    });
    expect(list.sources[1]).toMatchObject({ status: "needs_setup", paid: true, attribution: "Google" });
  });

  it("asks the gateway as the workspace's business, resolved on the server", async () => {
    h.listSources.mockResolvedValue({ ok: true, data: sourcesResponse });

    await listDataSources(WORKSPACE);

    expect(h.getBusinessIdForWorkspace).toHaveBeenCalledWith(WORKSPACE, undefined);
    expect(h.listSources).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it("refuses, without calling the gateway, a workspace the caller cannot read", async () => {
    h.getBusinessIdForWorkspace.mockResolvedValue(null);

    await expect(listDataSources(WORKSPACE)).rejects.toThrow("Workspace not found.");
    expect(h.listSources).not.toHaveBeenCalled();
  });

  it.each([
    ["a gateway that does not answer", "unavailable", "unavailable", "unavailable"],
    ["a key the gateway refuses", "forbidden", "needs_setup", "needs_setup"],
    ["a used-up quota", "quota", "quota", "unavailable"],
  ])("marks the gateway's entry for %s", async (_label, failure, state, status) => {
    gatewayFails(failure, failure === "quota" ? "2026-12-01T00:00:00.000Z" : null);

    const list = await listDataSources(WORKSPACE);

    expect(list.gateway.state).toBe(state);
    expect(list.sources[0]).toMatchObject({ id: "stored", status });
    expect(list.sources.slice(1).every((s) => s.origin === "local" && s.status === "active")).toBe(true);
    if (failure === "quota") expect(list.gateway.resetAt).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("fromGatewaySource", () => {
  const base = sourcesResponse.sources[0]!;

  it("lists a buying signal only when the gateway lists it", () => {
    expect(fromGatewaySource({ ...base, status: "active" }).map((s) => s.action)).toEqual(["search"]);

    const hiring = fromGatewaySource({ ...base, id: "hiring", label: "Hiring signals", kinds: ["signal"], status: "active" });
    expect(hiring).toHaveLength(1);
    expect(hiring[0]).toMatchObject({ id: "signals:hiring", provider: "hiring", action: "signals" });
  });

  it("gives a source that holds both a search entry and a signals entry", () => {
    const both = fromGatewaySource({ ...base, kinds: ["business", "signal"], status: "active" });

    expect(both.map((s) => [s.id, s.action])).toEqual([["stored", "search"], ["signals:stored", "signals"]]);
  });
});

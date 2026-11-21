import { beforeEach, describe, expect, it, vi } from "vitest";

/** PLATFORM-P1-14.1: the gateway's address and key come from Platform Admin → Keys first. */
const h = vi.hoisted(() => ({ saved: {} as Record<string, string | undefined> }));
vi.mock("@cofounderai/core/admin/platform-key-store", () => ({
  platformKey: vi.fn(async (name: string) => h.saved[name] ?? (process.env[name]?.trim() || undefined)),
}));

import { GATEWAY_KEY_ENV, GATEWAY_URL_ENV, isGatewayReady, resolveGatewayConfig, searchProspects } from "../workslake-client";

beforeEach(() => {
  h.saved = {};
  vi.unstubAllEnvs();
  vi.stubEnv(GATEWAY_URL_ENV, "");
  vi.stubEnv(GATEWAY_KEY_ENV, "");
});

describe("the gateway's settings", () => {
  it("are read from the platform's saved keys", async () => {
    h.saved = { [GATEWAY_URL_ENV]: "https://works.example", [GATEWAY_KEY_ENV]: "wlg_saved" };
    expect(await resolveGatewayConfig()).toEqual({ baseUrl: "https://works.example/v1", apiKey: "wlg_saved" });
    expect(await isGatewayReady()).toBe(true);
  });

  it("prefer the saved value over the deployment's variable", async () => {
    vi.stubEnv(GATEWAY_URL_ENV, "https://old.example");
    vi.stubEnv(GATEWAY_KEY_ENV, "wlg_deployment");
    h.saved = { [GATEWAY_KEY_ENV]: "wlg_saved" };
    expect(await resolveGatewayConfig()).toEqual({ baseUrl: "https://old.example/v1", apiKey: "wlg_saved" });
  });

  it("say Needs setup, and call nothing, when neither place has them", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await isGatewayReady()).toBe(false);
    const result = await searchProspects(
      { tenantId: "13309431-dfe2-46c5-9404-6b4a9d505b74" },
      { kind: "business", query: "plumber", filters: { categories: [], industries: [], employeeRanges: [], channelTypes: [], minAudience: null, languages: [] }, locations: [], providers: ["stored"], limit: 10, cursor: null },
    );
    expect(result).toMatchObject({ ok: false, failure: "needs_setup" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("still refuse a saved address that is not https", async () => {
    h.saved = { [GATEWAY_URL_ENV]: "http://works.example", [GATEWAY_KEY_ENV]: "wlg_saved" };
    expect(await resolveGatewayConfig()).toBeNull();
  });
});

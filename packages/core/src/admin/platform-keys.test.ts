import { beforeEach, describe, expect, it, vi } from "vitest";

/** PLATFORM-P1-14.1/14.2: the Keys page's reads and writes, and "Import from deployment". */
const h = vi.hoisted(() => ({
  requireSuperadmin: vi.fn(),
  rpc: vi.fn(),
  statusRows: [] as { name: string; value_hint: string; value_fingerprint: string; origin: string; updated_at: string }[],
  rpcError: null as { message: string } | null,
  listAiProviders: vi.fn(),
  setAiProviderKey: vi.fn(),
  updateAiProviderConfig: vi.fn(),
  resetCache: vi.fn(),
}));
vi.mock("../rbac/platform-admin", () => ({ requireSuperadmin: h.requireSuperadmin }));
vi.mock("../db/server", () => ({ createClient: vi.fn(async () => ({ rpc: h.rpc })) }));
vi.mock("../crypto/api-key", () => ({
  encryptApiKey: (value: string) => `enc(${value.length})`,
  fingerprintApiKey: (value: string) => `fp-${value.length}-${value.slice(-2)}`,
}));
vi.mock("./platform-ai-providers", () => ({
  listAiProviders: h.listAiProviders,
  setAiProviderKey: h.setAiProviderKey,
  updateAiProviderConfig: h.updateAiProviderConfig,
}));
vi.mock("./platform-key-store", () => ({ resetPlatformKeyCache: h.resetCache }));

import { getPlatformKeysOverview, importPlatformKeysFromDeployment, removePlatformKey, setPlatformKey } from "./platform-keys";

const SECRET = "re_live_SECRET_VALUE_1234";
const provider = (overrides: Record<string, unknown> = {}) => ({
  provider: "anthropic",
  label: "Anthropic",
  enabled: false,
  configured: false,
  models: [],
  defaultModel: null,
  fallbackModel: null,
  rateLimits: {},
  costControls: {},
  ...overrides,
});
const setCalls = () => h.rpc.mock.calls.filter(([name]) => name === "set_platform_key").map(([, args]) => args);

beforeEach(() => {
  vi.clearAllMocks();
  h.statusRows = [];
  h.rpcError = null;
  h.requireSuperadmin.mockResolvedValue(undefined);
  h.rpc.mockImplementation(async (name: string) => (name === "platform_key_status" ? { data: h.statusRows, error: null } : { data: null, error: h.rpcError }));
  h.listAiProviders.mockResolvedValue([provider()]);
  h.setAiProviderKey.mockResolvedValue({ ok: true });
  h.updateAiProviderConfig.mockResolvedValue({ ok: true });
});

describe("only a superadmin", () => {
  it.each([
    ["read the overview", () => getPlatformKeysOverview({})],
    ["set a key", () => setPlatformKey({ name: "RESEND_API_KEY", value: SECRET, reason: "why" })],
    ["remove a key", () => removePlatformKey({ name: "RESEND_API_KEY", reason: "why" })],
    ["import from the deployment", () => importPlatformKeysFromDeployment({ reason: "why" }, { RESEND_API_KEY: SECRET })],
  ])("may %s", async (_label, run) => {
    h.requireSuperadmin.mockRejectedValue(new Error("Forbidden: this account does not have SUPERADMIN access."));
    await expect(run()).rejects.toThrow("Forbidden");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.setAiProviderKey).not.toHaveBeenCalled();
  });
});

describe("setPlatformKey", () => {
  it("sends the ciphertext, a hint and a fingerprint, never the value", async () => {
    expect(await setPlatformKey({ name: "RESEND_API_KEY", value: `  ${SECRET}  `, reason: " rotating " })).toEqual({ ok: true });
    expect(setCalls()).toEqual([
      {
        p_name: "RESEND_API_KEY",
        p_encrypted_value: `enc(${SECRET.length})`,
        p_value_hint: "••••1234",
        p_value_fingerprint: `fp-${SECRET.length}-34`,
        p_origin: "admin",
        p_reason: "rotating",
      },
    ]);
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain(SECRET);
    expect(h.resetCache).toHaveBeenCalledTimes(1);
  });

  it("keeps a value that is not secret readable as its own hint", async () => {
    await setPlatformKey({ name: "WORKSLAKE_GATEWAY_URL", value: "https://works.example", reason: "gateway" });
    expect(setCalls()[0]).toMatchObject({ p_value_hint: "https://works.example" });
  });

  it.each([
    ["a name not in the registry", { name: "SUPABASE_SERVICE_ROLE_KEY", value: "x".repeat(20), reason: "why" }],
    ["no reason", { name: "RESEND_API_KEY", value: SECRET, reason: "   " }],
    ["no value", { name: "RESEND_API_KEY", value: "  ", reason: "why" }],
    ["a gateway address that is not https", { name: "WORKSLAKE_GATEWAY_URL", value: "http://works.example", reason: "why" }],
  ])("refuses %s and saves nothing", async (_label, input) => {
    expect(await setPlatformKey(input)).toMatchObject({ ok: false, error: expect.any(String) });
    expect(setCalls()).toEqual([]);
    expect(h.resetCache).not.toHaveBeenCalled();
  });

  it("reports the database's refusal and does not claim the key changed", async () => {
    h.rpcError = { message: "Forbidden: only a SUPERADMIN can set a platform key." };
    expect(await setPlatformKey({ name: "RESEND_API_KEY", value: SECRET, reason: "why" })).toEqual({ ok: false, error: h.rpcError.message });
    expect(h.resetCache).not.toHaveBeenCalled();
  });
});

describe("removePlatformKey", () => {
  it("removes through the audited function, with the reason", async () => {
    expect(await removePlatformKey({ name: "RESEND_API_KEY", reason: "no longer used" })).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("remove_platform_key", { p_name: "RESEND_API_KEY", p_reason: "no longer used" });
    expect(h.resetCache).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown name or a missing reason", async () => {
    expect((await removePlatformKey({ name: "NOT_A_KEY", reason: "why" })).ok).toBe(false);
    expect((await removePlatformKey({ name: "RESEND_API_KEY", reason: "" })).ok).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("getPlatformKeysOverview", () => {
  it("says where each key is set, and never shows a deployment secret", async () => {
    h.statusRows = [{ name: "RESEND_API_KEY", value_hint: "••••1234", value_fingerprint: `fp-${SECRET.length}-34`, origin: "deployment", updated_at: "2026-11-20T10:00:00Z" }];
    const overview = await getPlatformKeysOverview({
      RESEND_API_KEY: SECRET,
      WORKSLAKE_GATEWAY_URL: "https://works.example",
      WORKSLAKE_GATEWAY_API_KEY: "wlg_deployment_secret_value",
      CRON_SECRET: "cron",
    });
    const key = (name: string) => overview.keys.find((item) => item.name === name)!;

    expect(key("RESEND_API_KEY")).toMatchObject({ state: "platform", shown: "••••1234", origin: "deployment", inDeployment: true, deploymentRedundant: true });
    expect(key("WORKSLAKE_GATEWAY_URL")).toMatchObject({ state: "deployment", shown: "https://works.example" });
    expect(key("WORKSLAKE_GATEWAY_API_KEY")).toMatchObject({ state: "deployment", shown: null });
    expect(key("RESEND_FROM_EMAIL")).toMatchObject({ state: "unset", shown: null, inDeployment: false });
    expect(overview.importable).toBe(2);
    expect(overview.deploymentOnly.find((item) => item.name === "CRON_SECRET")).toMatchObject({ set: true });
    expect(overview.deploymentOnly.find((item) => item.name === "BASE_APP_HOST")).toMatchObject({ set: false });
    expect(JSON.stringify(overview)).not.toContain("wlg_deployment_secret_value");
    expect(JSON.stringify(overview)).not.toContain(SECRET);
  });

  it("does not call a deployment variable redundant when its value differs from the saved one", async () => {
    h.statusRows = [{ name: "RESEND_API_KEY", value_hint: "••••9999", value_fingerprint: "fp-of-another-value", origin: "admin", updated_at: "2026-11-20T10:00:00Z" }];
    const overview = await getPlatformKeysOverview({ RESEND_API_KEY: SECRET });
    expect(overview.keys.find((item) => item.name === "RESEND_API_KEY")).toMatchObject({ state: "platform", inDeployment: true, deploymentRedundant: false });
  });

  it("counts the AI key as importable only while no enabled provider has one", async () => {
    expect((await getPlatformKeysOverview({ PLATFORM_AI_API_KEY: "sk-ant-x" })).ai).toEqual({ onPlatform: false, inDeployment: true });
    expect((await getPlatformKeysOverview({ PLATFORM_AI_API_KEY: "sk-ant-x" })).importable).toBe(1);
    h.listAiProviders.mockResolvedValue([provider({ enabled: true, configured: true })]);
    const overview = await getPlatformKeysOverview({ PLATFORM_AI_API_KEY: "sk-ant-x" });
    expect(overview.ai).toEqual({ onPlatform: true, inDeployment: true });
    expect(overview.importable).toBe(0);
  });
});

describe("importPlatformKeysFromDeployment", () => {
  const env = { RESEND_API_KEY: SECRET, RESEND_FROM_EMAIL: "team@example.com", WORKSLAKE_GATEWAY_URL: "https://works.example", UNRELATED: "x" };

  it("copies what the deployment sets and the platform lacks, marked as imported, by name only", async () => {
    h.statusRows = [{ name: "RESEND_FROM_EMAIL", value_hint: "other@example.com", value_fingerprint: "fp", origin: "admin", updated_at: "2026-11-20T10:00:00Z" }];
    const result = await importPlatformKeysFromDeployment({ reason: "moving off the hosting dashboard" }, env);

    expect(result).toEqual({ ok: true, outcome: { imported: ["RESEND_API_KEY", "WORKSLAKE_GATEWAY_URL"], failed: [] } });
    expect(setCalls().map((call) => [call.p_name, call.p_origin])).toEqual([
      ["RESEND_API_KEY", "deployment"],
      ["WORKSLAKE_GATEWAY_URL", "deployment"],
    ]);
    expect(setCalls()[0].p_reason).toBe("Imported from the deployment: moving off the hosting dashboard");
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain(SECRET);
    expect(h.resetCache).toHaveBeenCalledTimes(1);
  });

  it("copies nothing the second time", async () => {
    h.statusRows = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "WORKSLAKE_GATEWAY_URL"].map((name) => ({ name, value_hint: "h", value_fingerprint: "f", origin: "deployment", updated_at: "2026-11-20T10:00:00Z" }));
    const result = await importPlatformKeysFromDeployment({ reason: "again" }, env);
    expect(result).toEqual({ ok: true, outcome: { imported: [], failed: [] } });
    expect(setCalls()).toEqual([]);
    expect(h.resetCache).not.toHaveBeenCalled();
  });

  it("needs a reason", async () => {
    expect(await importPlatformKeysFromDeployment({ reason: " " }, env)).toMatchObject({ ok: false });
    expect(setCalls()).toEqual([]);
  });

  it("reports a value it could not save by name, and still copies the rest", async () => {
    const result = await importPlatformKeysFromDeployment({ reason: "move" }, { ...env, WORKSLAKE_GATEWAY_URL: "http://not-https.example" });
    expect(result).toMatchObject({ ok: true, outcome: { imported: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"], failed: [{ name: "WORKSLAKE_GATEWAY_URL", error: expect.any(String) }] } });
  });

  it("moves the AI key to the AI Providers store, tested first, and switches its provider on", async () => {
    const result = await importPlatformKeysFromDeployment({ reason: "move" }, { PLATFORM_AI_API_KEY: "sk-ant-deployment-key" });

    expect(h.setAiProviderKey).toHaveBeenCalledWith({ provider: "anthropic", apiKey: "sk-ant-deployment-key", reason: "Imported from the deployment: move" });
    expect(h.updateAiProviderConfig).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", enabled: true, models: "", rateLimits: "{}", costControls: "{}" }));
    expect(result).toEqual({ ok: true, outcome: { imported: ["PLATFORM_AI_API_KEY"], failed: [] } });
    expect(JSON.stringify(result)).not.toContain("sk-ant-deployment-key");
  });

  it("leaves the AI key alone when the platform already has a working one", async () => {
    h.listAiProviders.mockResolvedValue([provider({ provider: "openai", enabled: true, configured: true })]);
    const result = await importPlatformKeysFromDeployment({ reason: "move" }, { PLATFORM_AI_API_KEY: "sk-ant-deployment-key" });
    expect(h.setAiProviderKey).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, outcome: { imported: [], failed: [] } });
  });

  it("says so, and enables nothing, when the provider refuses the deployment's AI key", async () => {
    h.setAiProviderKey.mockResolvedValue({ ok: false, error: "Anthropic rejected this key." });
    const result = await importPlatformKeysFromDeployment({ reason: "move" }, { PLATFORM_AI_API_KEY: "sk-ant-revoked" });
    expect(h.updateAiProviderConfig).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, outcome: { imported: [], failed: [{ name: "PLATFORM_AI_API_KEY", error: "Anthropic rejected this key." }] } });
  });
});

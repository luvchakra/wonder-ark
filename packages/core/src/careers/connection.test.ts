import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "../test-support/fake-supabase";
import { decryptApiKey, encryptApiKey } from "../crypto/api-key";

const { createClient, createAdminClient, requireSuperadmin } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock("../db/server", () => ({ createClient }));
vi.mock("../db/admin", () => ({ createAdminClient }));
vi.mock("../rbac/platform-admin", () => ({ requireSuperadmin }));

const { clearCareersKey, getCareersKeyStatus, maskCareersKey, resolveCareersKey, saveCareersKey } = await import("./connection");

/** PLATFORM-P1-13.2 -- the career-site key: superadmin only, encrypted, masked, audited. */

const KEY = "wjcs_live_0123456789abcdefWXyz";

process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");

let platform: FakeSupabase;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WONDERJOBS_CAREERS_KEY;
  requireSuperadmin.mockResolvedValue(undefined);
  platform = createFakeSupabase();
  createClient.mockResolvedValue(platform);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin only", () => {
  const forbidden = new Error("Forbidden: this account does not have SUPERADMIN access.");

  it.each([
    ["save", () => saveCareersKey({ key: KEY })],
    ["clear", () => clearCareersKey()],
    ["read the status", () => getCareersKeyStatus()],
  ])("refuses a non-superadmin trying to %s, before touching the database", async (_label, run) => {
    requireSuperadmin.mockRejectedValue(forbidden);
    await expect(run()).rejects.toThrow("Forbidden");
    expect(platform.calls).toHaveLength(0);
  });
});

describe("saving", () => {
  it("stores the key encrypted, with only its last four characters in clear", async () => {
    const result = await saveCareersKey({ key: `  ${KEY}  ` });
    expect(result).toEqual({ ok: true, masked: "wjcs_••••••••WXyz" });

    const rpc = platform.rpcs("set_careers_key")[0]!;
    const encrypted = rpc.args.p_encrypted_key as string;
    expect(encrypted).not.toContain(KEY);
    expect(decryptApiKey(encrypted)).toBe(KEY);
    expect(rpc.args.p_key_last4).toBe("WXyz");
    // The audit entry is written by set_careers_key() itself from p_key_last4 -- nothing
    // else about the key reaches the database in clear.
    expect(JSON.stringify(rpc.args)).not.toContain(KEY);
  });

  it("refuses something that isn't a career-site key", async () => {
    for (const key of ["", "sk_live_abc123456789", "wjcs_", "wjcs_short", "wjcs_has spaces in it"]) {
      const result = await saveCareersKey({ key });
      expect(result.ok).toBe(false);
    }
    expect(platform.rpcs()).toHaveLength(0);
  });

  it("reports a failed save without echoing the key", async () => {
    platform = createFakeSupabase({ rpc: () => ({ data: null, error: { code: "42501", message: "Forbidden" } }) });
    createClient.mockResolvedValue(platform);
    const result = await saveCareersKey({ key: KEY });
    expect(result).toEqual({ ok: false, error: "The key couldn't be saved (42501)." });
  });

  it("clears through the audited function", async () => {
    expect(await clearCareersKey()).toEqual({ ok: true });
    expect(platform.rpcs().map((r) => r.fn)).toEqual(["clear_careers_key"]);
  });
});

describe("masked on read", () => {
  it("returns a mask and never the key", async () => {
    platform = createFakeSupabase({
      rpc: () => ({ data: [{ configured: true, key_last4: "WXyz", updated_at: "2026-10-21T00:00:00Z" }], error: null }),
    });
    createClient.mockResolvedValue(platform);
    expect(await getCareersKeyStatus()).toEqual({ source: "saved", masked: "wjcs_••••••••WXyz", updatedAt: "2026-10-21T00:00:00Z" });
  });

  it("falls back to the environment variable, still masked", async () => {
    process.env.WONDERJOBS_CAREERS_KEY = KEY;
    platform = createFakeSupabase({ rpc: () => ({ data: [], error: null }) });
    createClient.mockResolvedValue(platform);
    const status = await getCareersKeyStatus();
    expect(status).toEqual({ source: "environment", masked: maskCareersKey("WXyz"), updatedAt: null });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });

  it("says when no key is set anywhere", async () => {
    platform = createFakeSupabase({ rpc: () => ({ data: [], error: null }) });
    createClient.mockResolvedValue(platform);
    expect(await getCareersKeyStatus()).toEqual({ source: "none", masked: null, updatedAt: null });
  });
});

describe("resolving the key for a call", () => {
  it("prefers the saved key over the environment", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: { encrypted_key: encryptApiKey(KEY) }, error: null }) }));
    expect(await resolveCareersKey({ WONDERJOBS_CAREERS_KEY: "wjcs_env_key_00000000" })).toEqual({ state: "ok", key: KEY, source: "saved" });
  });

  it("uses the environment variable only when the database has no key", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: null, error: null }) }));
    expect(await resolveCareersKey({ WONDERJOBS_CAREERS_KEY: "wjcs_env_key_00000000" })).toEqual({
      state: "ok",
      key: "wjcs_env_key_00000000",
      source: "environment",
    });
    expect(await resolveCareersKey({})).toEqual({ state: "missing" });
  });

  it("does not fall back to the environment when the database read fails", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: null, error: { code: "57014" } }) }));
    expect(await resolveCareersKey({ WONDERJOBS_CAREERS_KEY: "wjcs_env_key_00000000" })).toEqual({ state: "unreadable" });
  });

  it("treats a key encrypted under another secret as unreadable", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: { encrypted_key: "bm90LXZhbGlk" }, error: null }) }));
    expect(await resolveCareersKey({})).toEqual({ state: "unreadable" });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** PLATFORM-P1-14.1: how the running application reads a platform key. */
const h = vi.hoisted(() => ({
  rows: [] as { name: string; encrypted_value: string }[],
  error: null as { message: string } | null,
  selects: 0,
  createAdminClient: vi.fn(),
}));
vi.mock("../db/admin", () => ({ createAdminClient: h.createAdminClient }));
// Stand-in for AES-GCM: "enc:<value>" decrypts to <value>; anything else is undecryptable.
vi.mock("../crypto/api-key", () => ({
  decryptApiKey: (value: string) => {
    if (!value.startsWith("enc:")) throw new Error("Unsupported state or unable to authenticate data");
    return value.slice(4);
  },
}));

import { loadPlatformKeys, platformKey, platformKeySource, resetPlatformKeyCache } from "./platform-key-store";

const SECRET = "re_live_SECRET_VALUE_1234";

beforeEach(() => {
  vi.clearAllMocks();
  resetPlatformKeyCache();
  h.rows = [];
  h.error = null;
  h.selects = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  h.createAdminClient.mockImplementation(() => ({
    from: (table: string) => ({
      select: async () => {
        h.selects += 1;
        expect(table).toBe("platform_keys");
        return h.error ? { data: null, error: h.error } : { data: h.rows, error: null };
      },
    }),
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("platformKey", () => {
  it("returns the value saved on the platform, over the deployment's variable", async () => {
    h.rows = [{ name: "RESEND_API_KEY", encrypted_value: `enc:${SECRET}` }];
    expect(await platformKey("RESEND_API_KEY", { RESEND_API_KEY: "from-deployment" })).toBe(SECRET);
    expect(await platformKeySource("RESEND_API_KEY", { RESEND_API_KEY: "from-deployment" })).toBe("platform");
    expect(h.createAdminClient).toHaveBeenCalledWith({ schema: "platform" });
  });

  it("falls back to the deployment's variable, trimmed, when nothing is saved", async () => {
    expect(await platformKey("RESEND_API_KEY", { RESEND_API_KEY: "  from-deployment \n" })).toBe("from-deployment");
    expect(await platformKeySource("RESEND_API_KEY", { RESEND_API_KEY: "from-deployment" })).toBe("deployment");
  });

  it("is undefined when neither holds a value", async () => {
    expect(await platformKey("RESEND_API_KEY", { RESEND_API_KEY: "   " })).toBeUndefined();
    expect(await platformKeySource("RESEND_API_KEY", {})).toBeNull();
  });

  it("ignores a saved row whose name is not in the registry", async () => {
    h.rows = [{ name: "SUPABASE_SERVICE_ROLE_KEY", encrypted_value: "enc:planted" }];
    expect(await platformKey("SUPABASE_SERVICE_ROLE_KEY", {})).toBeUndefined();
  });

  it("reads the database once for many keys, and again only after a minute", async () => {
    h.rows = [{ name: "RESEND_API_KEY", encrypted_value: `enc:${SECRET}` }];
    await Promise.all([platformKey("RESEND_API_KEY", {}), platformKey("RESEND_FROM_EMAIL", {}), platformKey("WORKSLAKE_GATEWAY_URL", {})]);
    await platformKey("RESEND_API_KEY", {});
    expect(h.selects).toBe(1);

    const start = Date.now();
    await loadPlatformKeys({ now: start + 30_000 });
    expect(h.selects).toBe(1);
    await loadPlatformKeys({ now: start + 61_000 });
    expect(h.selects).toBe(2);
  });

  it("picks up a replaced key on a forced read, as after a save", async () => {
    h.rows = [{ name: "RESEND_API_KEY", encrypted_value: "enc:old-key-value" }];
    expect(await platformKey("RESEND_API_KEY", {})).toBe("old-key-value");
    h.rows = [{ name: "RESEND_API_KEY", encrypted_value: "enc:new-key-value" }];
    expect(await platformKey("RESEND_API_KEY", {})).toBe("old-key-value");
    await loadPlatformKeys({ force: true });
    expect(await platformKey("RESEND_API_KEY", {})).toBe("new-key-value");
  });
});

describe("when the saved keys cannot be read", () => {
  it("uses the deployment's variable when the database is down, and logs no value", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.error = { message: "connection refused" };
    expect(await platformKey("RESEND_API_KEY", { RESEND_API_KEY: "from-deployment" })).toBe("from-deployment");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("from-deployment");
  });

  it("keeps the last values it read when a later read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.rows = [{ name: "RESEND_API_KEY", encrypted_value: `enc:${SECRET}` }];
    expect(await platformKey("RESEND_API_KEY", {})).toBe(SECRET);
    h.error = { message: "timeout" };
    await loadPlatformKeys({ force: true });
    expect(await platformKey("RESEND_API_KEY", {})).toBe(SECRET);
  });

  it("falls back, without logging the ciphertext, when a saved value no longer decrypts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.rows = [{ name: "RESEND_API_KEY", encrypted_value: "garbled-ciphertext" }];
    expect(await platformKey("RESEND_API_KEY", { RESEND_API_KEY: "from-deployment" })).toBe("from-deployment");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("garbled-ciphertext");
  });

  it("does not try the database at all when none is configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await platformKey("RESEND_API_KEY", { RESEND_API_KEY: "from-deployment" })).toBe("from-deployment");
    expect(h.createAdminClient).not.toHaveBeenCalled();
  });
});

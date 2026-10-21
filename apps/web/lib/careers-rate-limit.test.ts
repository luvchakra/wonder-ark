/**
 * PLATFORM-P1-13.1 -- the Careers forms' per-address limit. The address is never sent to
 * the database (only a keyed hash), and a broken counter lets the request through rather
 * than locking every applicant out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { headers, rpc } = vi.hoisted(() => ({ headers: vi.fn(), rpc: vi.fn() }));
vi.mock("next/headers", () => ({ headers }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: () => ({ rpc }) }));

const { careersRateLimited, clientAddress, hashClientAddress } = await import("./careers-rate-limit");

beforeEach(() => {
  vi.clearAllMocks();
  headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("careersRateLimited", () => {
  it("counts by a hash of the client address, never the address", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await careersRateLimited("apply", 10)).toBe(false);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("check_careers_rate_limit");
    expect(args).toEqual({ p_bucket: "apply", p_client_hash: hashClientAddress("203.0.113.7"), p_limit: 10 });
    expect(JSON.stringify(args)).not.toContain("203.0.113.7");
  });

  it("is limited once the counter says so", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await careersRateLimited("apply", 10)).toBe(true);
  });

  it("lets the request through when the counter can't be reached", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await careersRateLimited("apply", 10)).toBe(false);
  });
});

describe("clientAddress", () => {
  it("prefers x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "203.0.113.7" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers())).toBeNull();
  });

  it("hashes to 64 hex characters, keyed by the server secret", () => {
    expect(hashClientAddress("203.0.113.7", "secret-a")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClientAddress("203.0.113.7", "secret-a")).not.toBe(hashClientAddress("203.0.113.7", "secret-b"));
  });
});

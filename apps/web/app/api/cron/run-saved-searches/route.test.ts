/**
 * DISC-DATA-P0-05.1: the saved-search cron route queues work with the service role, so
 * its shared-secret check is closed by default, like the drain's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueDueSavedSearches } = vi.hoisted(() => ({ enqueueDueSavedSearches: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/data-sources/saved-searches", () => ({ enqueueDueSavedSearches }));

const { GET } = await import("./route");

const SECRET = "cron-secret-value";
const request = (authorization?: string) =>
  new Request("https://example.com/api/cron/run-saved-searches", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  enqueueDueSavedSearches.mockResolvedValue({ queued: 2, failed: 0 });
  vi.stubEnv("CRON_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/run-saved-searches", () => {
  it("queues due searches for a correctly authenticated scheduler", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ queued: 2, failed: 0 });
    expect(enqueueDueSavedSearches).toHaveBeenCalledOnce();
  });

  it.each([
    ["no Authorization header", undefined],
    ["the wrong secret", "Bearer wrong"],
    ["the secret without the Bearer scheme", SECRET],
  ])("rejects %s and queues nothing", async (_label, header) => {
    const response = await GET(request(header));
    expect(response.status).toBe(401);
    expect(enqueueDueSavedSearches).not.toHaveBeenCalled();
  });

  it("denies everything when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    expect(enqueueDueSavedSearches).not.toHaveBeenCalled();
  });
});

/**
 * DISC-CAMP-P0-07.1: the campaign tick sends email with the service role, so its
 * shared-secret check is closed by default, and its daily schedule is the one the
 * campaign page tells people about.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_TICK_UTC } from "@cofounderai/module-discovery/lib/campaigns/types";

const { runCampaignTick } = vi.hoisted(() => ({ runCampaignTick: vi.fn() }));
vi.mock("@cofounderai/module-discovery/lib/campaigns/tick", () => ({ runCampaignTick }));

const { GET } = await import("./route");

const SECRET = "cron-secret-value";
const request = (authorization?: string) =>
  new Request("https://example.com/api/cron/discovery-campaigns", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  runCampaignTick.mockResolvedValue({ campaigns: 1, sent: 2 });
  vi.stubEnv("CRON_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/discovery-campaigns", () => {
  it("runs the tick for a correctly authenticated scheduler", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ campaigns: 1, sent: 2 });
    expect(runCampaignTick).toHaveBeenCalledOnce();
  });

  it.each([
    ["no Authorization header", undefined],
    ["the wrong secret", "Bearer wrong"],
    ["the secret without the Bearer scheme", SECRET],
  ])("rejects %s and sends nothing", async (_label, header) => {
    expect((await GET(request(header))).status).toBe(401);
    expect(runCampaignTick).not.toHaveBeenCalled();
  });

  it("denies everything when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect(runCampaignTick).not.toHaveBeenCalled();
  });

  it("is scheduled once a day, at the time the campaign page names", () => {
    const { crons } = JSON.parse(readFileSync(new URL("../../../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(crons.filter((cron) => cron.path === "/api/cron/discovery-campaigns")).toEqual([
      { path: "/api/cron/discovery-campaigns", schedule: `${DAILY_TICK_UTC.minute} ${DAILY_TICK_UTC.hour} * * *` },
    ]);
  });
});

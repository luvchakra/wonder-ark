/**
 * PLATFORM-P0-01.2: the data behind a `/platform` page is refused to anyone but a
 * SUPERADMIN by the function that reads it, not only by the page's layout.
 *
 * A layout and its page render side by side, so a layout that redirects does not stop the
 * page from fetching. The functions below read across every tenant with the service role;
 * each one used to trust the layout, and what they returned reached a signed-in
 * non-admin inside the redirect's body.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ requireSuperadmin: vi.fn(), createAdminClient: vi.fn() }));

vi.mock("../rbac/platform-admin", () => ({ requireSuperadmin: h.requireSuperadmin }));
vi.mock("../db/admin", () => ({ createAdminClient: h.createAdminClient }));

const { getPlatformOverview, getConfigurationHealth, getRecentGlobalChanges } = await import("./platform-dashboard-queries");
const { getHealthSnapshot } = await import("./platform-health");
const { listOpsAlerts } = await import("./platform-ops-alerts");

beforeEach(() => {
  vi.clearAllMocks();
  h.requireSuperadmin.mockRejectedValue(new Error("Forbidden: this account does not have SUPERADMIN access."));
});

describe("platform page data is refused to a non-superadmin before anything is read", () => {
  const reads: [string, () => Promise<unknown>][] = [
    ["the dashboard's totals", () => getPlatformOverview()],
    ["the dashboard's configuration checks", () => getConfigurationHealth()],
    ["the dashboard's recent changes, which name organizations", () => getRecentGlobalChanges()],
    ["the system health snapshot", () => getHealthSnapshot()],
    ["the operations alerts", () => listOpsAlerts()],
  ];

  for (const [what, read] of reads) {
    it(what, async () => {
      await expect(read()).rejects.toThrow("Forbidden");
      expect(h.createAdminClient).not.toHaveBeenCalled();
    });
  }
});

/**
 * The same rule for whatever is added next: an exported function in this folder that
 * builds a service-role client checks the caller itself, or is listed here with the reason
 * it does not need to.
 */
const UNCHECKED: Record<string, string> = {
  "demo-seed-tracking.ts:createSeedBatch": "called by the demo-data actions after requireBusinessAdmin()",
  "demo-seed-tracking.ts:trackSeedRecords": "called by the demo-data actions after requireBusinessAdmin()",
  "demo-seed-tracking.ts:finalizeSeedBatch": "called by the demo-data actions after requireBusinessAdmin()",
  "demo-seed-tracking.ts:listSeedBatches": "read by /dashboard/admin after its own requireBusinessAdmin()",
  "demo-seed-tracking.ts:deleteAllSeedDataForBusiness": "called by the demo-data actions after requireBusinessAdmin()",
  "platform-branding.ts:getPublicLoginBranding": "the sign-in page's public branding",
  "platform-health.ts:collectHealthSnapshot": "the ops-alerts cron, behind CRON_SECRET; pages use getHealthSnapshot()",
  "platform-ops-alerts.ts:runOpsAlertCheck": "the ops-alerts cron, behind CRON_SECRET",
  "platform-plans.ts:listPublicPlans": "the public pricing page",
  "queries.ts:listAllUsers": "read by /dashboard/admin and the audit log after their own checks",
  "queries.ts:listBusinessesForUser": "read by /dashboard/admin after its own requireBusinessAdmin()",
};

const CHECK = /\b(requireSuperadmin|requireBusinessAdmin|requirePlatformRole|isSuperadmin|actorId)\(/;

describe("every service-role read in admin/ checks its caller", () => {
  it("has no exported function that builds a service-role client without a check or a listed reason", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const unchecked: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
      const source = readFileSync(join(dir, file), "utf8");
      const starts = [...source.matchAll(/^export async function (\w+)/gm)];
      starts.forEach((match, i) => {
        const body = source.slice(match.index, starts[i + 1]?.index ?? source.length);
        if (!body.includes("createAdminClient(")) return;
        if (CHECK.test(body)) return;
        const key = `${file}:${match[1]}`;
        if (!(key in UNCHECKED)) unchecked.push(key);
      });
    }
    expect(unchecked).toEqual([]);
  });

  it("lists no exception that no longer exists", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const key of Object.keys(UNCHECKED)) {
      const [file, name] = key.split(":");
      expect(readFileSync(join(dir, file!), "utf8"), key).toContain(`export async function ${name}(`);
    }
  });
});

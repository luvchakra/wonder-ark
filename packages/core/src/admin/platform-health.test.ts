import { describe, expect, it } from "vitest";
import { deriveComponents, evaluateAlerts, type HealthSnapshot, type QueueRow } from "./platform-health";

const NOW = "2026-10-10T12:00:00.000Z";
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3600_000).toISOString();

function queue(key: QueueRow["key"], overrides: Partial<QueueRow> = {}): QueueRow {
  return { key, label: key, queued: 0, processing: 0, retrying: 0, deadLetter: 0, oldestWaitingAt: null, note: null, ...overrides };
}

function healthy(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    checkedAt: NOW,
    database: { ok: true, latencyMs: 12, error: null },
    ai: { enabledProviders: 1, configuredProviders: 1, platformKeyEnv: false, last24h: { failed: 0, total: 40 }, last7d: { failed: 1, total: 300 } },
    email: { sendConfigured: true, failed24h: 0, failed7d: 0 },
    whatsapp: { webhookConfigured: true, connections: { connected: 2 }, errors24h: 0, errors7d: 0 },
    storage: { ok: true, missing: [], error: null },
    queues: [queue("domain_events"), queue("billing_events"), queue("export_jobs", { retrying: null })],
    integrations: [{ key: "email", name: "Email", status: "connected" }],
    webhooks: { last24h: { failed: 0, total: 3 }, last7d: { failed: 0, total: 10 }, providerFailure24h: [] },
    api: { rateLimited24h: 0, rateLimited7d: 0 },
    invoiceNow: { last24h: { failed: 0, total: 0 }, last7d: { failed: 0, total: 0 } },
    ...overrides,
  };
}

const statusOf = (s: HealthSnapshot, key: string) => deriveComponents(s).find((c) => c.key === key)?.status;

describe("deriveComponents (PLATFORM-P1-07.1)", () => {
  it("reports every component ok on a healthy snapshot", () => {
    expect(deriveComponents(healthy()).map((c) => c.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok", "ok"]);
  });

  it("reports only the database, as down, when it is unreachable", () => {
    const components = deriveComponents(healthy({ database: { ok: false, latencyMs: null, error: "timeout" } }));
    expect(components).toEqual([{ key: "database", label: "Database", status: "down", detail: "timeout" }]);
  });

  it("says Needs setup rather than ok when a provider isn't configured", () => {
    const s = healthy({
      ai: { ...healthy().ai, configuredProviders: 0 },
      email: { ...healthy().email, sendConfigured: false },
      whatsapp: { ...healthy().whatsapp, webhookConfigured: false },
    });
    expect(statusOf(s, "ai")).toBe("needs_setup");
    expect(statusOf(s, "email")).toBe("needs_setup");
    expect(statusOf(s, "whatsapp")).toBe("needs_setup");
  });

  it("treats a platform AI key from the environment as configured", () => {
    expect(statusOf(healthy({ ai: { ...healthy().ai, configuredProviders: 0, platformKeyEnv: true } }), "ai")).toBe("ok");
  });

  it("marks WhatsApp not in use when no business has connected it", () => {
    expect(statusOf(healthy({ whatsapp: { ...healthy().whatsapp, connections: {} } }), "whatsapp")).toBe("not_in_use");
  });

  it("marks queues down when domain events wait past the drain window, degraded on dead letters", () => {
    expect(statusOf(healthy({ queues: [queue("domain_events", { oldestWaitingAt: hoursAgo(30) })] }), "queues")).toBe("down");
    expect(statusOf(healthy({ queues: [queue("domain_events", { oldestWaitingAt: hoursAgo(2) })] }), "queues")).toBe("ok");
    expect(statusOf(healthy({ queues: [queue("billing_events", { deadLetter: 1 })] }), "queues")).toBe("degraded");
  });

  it("marks storage degraded for a missing bucket and unavailable when it can't be read", () => {
    expect(statusOf(healthy({ storage: { ok: true, missing: ["exports"], error: null } }), "storage")).toBe("degraded");
    expect(statusOf(healthy({ storage: { ok: false, missing: [], error: "403" } }), "storage")).toBe("unavailable");
  });
});

describe("evaluateAlerts (PLATFORM-P1-07.4)", () => {
  const keys = (s: HealthSnapshot) => evaluateAlerts(s).map((a) => a.key);

  it("raises nothing on a healthy snapshot", () => {
    expect(evaluateAlerts(healthy())).toEqual([]);
  });

  it("raises only a critical database alert when the database is unreachable", () => {
    const alerts = evaluateAlerts(healthy({ database: { ok: false, latencyMs: null, error: "timeout" } }));
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([["database.unreachable", "critical"]]);
  });

  it("catches a drain that stopped running (the September 2026 incident)", () => {
    const alerts = evaluateAlerts(healthy({ queues: [queue("domain_events", { queued: 26, oldestWaitingAt: hoursAgo(24 * 33) })] }));
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([["queue.domain_events.stalled", "critical"]]);
  });

  it("raises dead-letter alerts per queue", () => {
    expect(keys(healthy({ queues: [queue("domain_events", { deadLetter: 4 }), queue("billing_events", { deadLetter: 1 })] }))).toEqual([
      "queue.domain_events.dead_letter",
      "queue.billing_events.dead_letter",
    ]);
  });

  it("alerts on AI failure rate only past the threshold and minimum volume", () => {
    expect(keys(healthy({ ai: { ...healthy().ai, last24h: { failed: 3, total: 10 } } }))).toEqual(["ai.failure_rate"]);
    expect(keys(healthy({ ai: { ...healthy().ai, last24h: { failed: 2, total: 10 } } }))).toEqual([]);
    expect(keys(healthy({ ai: { ...healthy().ai, last24h: { failed: 5, total: 5 } } }))).toEqual([]);
  });

  it("alerts on WhatsApp connections needing attention, ignoring disconnected ones", () => {
    expect(keys(healthy({ whatsapp: { ...healthy().whatsapp, connections: { connected: 1, provider_error: 1 } } }))).toEqual(["whatsapp.connections"]);
    expect(keys(healthy({ whatsapp: { ...healthy().whatsapp, connections: { connected: 1, disconnected: 3 } } }))).toEqual([]);
  });

  it("alerts on rejected billing webhooks, missing buckets and broken integrations", () => {
    const s = healthy({
      webhooks: { ...healthy().webhooks, providerFailure24h: ["razorpay"] },
      storage: { ok: true, missing: ["exports"], error: null },
      integrations: [{ key: "whatsapp", name: "WhatsApp", status: "needs_reauthorization" }],
    });
    expect(keys(s)).toEqual(["storage.missing_buckets", "billing.webhook_rejected", "integrations.broken"]);
  });
});

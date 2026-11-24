import { createAdminClient } from "../db/admin";
import { platformSender } from "../email/platform-mailer";
import { requireSuperadmin } from "../rbac/platform-admin";
import { platformKey } from "./platform-key-store";

/**
 * PLATFORM-P1-07.1 (System Health), PLATFORM-P1-07.2 (Error Rate), PLATFORM-P1-07.3 (Queue
 * Health) and PLATFORM-P1-07.4's thresholds (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §29).
 *
 * Everything here is read from rows and settings that already exist -- no number is
 * estimated. Where the platform does not record a signal at all (API errors other than
 * rate limiting, WhatsApp/Meta webhook rejections, storage usage), the page says "Not
 * recorded" instead of inventing one. `collectHealthSnapshot()` does the reading (service
 * role: these signals cross every tenant by design, the same reasoning
 * platform-dashboard-queries.ts gives); `deriveComponents()` and `evaluateAlerts()` are pure
 * so the status and alert rules are unit-tested on their own.
 *
 * Two callers. The health page reads through `getHealthSnapshot()`, which refuses anyone
 * but a SUPERADMIN itself (PLATFORM-P0-01.2: a page's data is never protected by its layout
 * alone). The ops-alerts cron, which has no signed-in person, checks CRON_SECRET and calls
 * `collectHealthSnapshot()`.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The storage buckets the migrations create; any one missing is a broken deployment. */
export const EXPECTED_BUCKETS = ["attachments", "avatars", "business-logos", "exports", "knowledge-files"] as const;

/** Billing webhook events retry up to this many times (billing/webhooks.ts MAX_ATTEMPTS). */
const BILLING_MAX_ATTEMPTS = 8;
/** core.check_api_rate_limit()'s default per-minute limit; requests above it got a 429. */
const API_RATE_LIMIT_PER_MINUTE = 120;

/** Alert thresholds (PLATFORM-P1-07.4). Shown on /platform/health so operators see the rules. */
export const ALERT_THRESHOLDS = {
  /** The drain runs daily at 06:00 UTC: an event due for longer than this means it isn't running. */
  domainEventOverdueHours: 26,
  exportStuckHours: 1,
  aiFailureRatePercent: 25,
  aiFailureMinRuns: 10,
} as const;

export type WindowCount = { failed: number; total: number | null };

export type QueueRow = {
  key: "domain_events" | "billing_events" | "export_jobs";
  label: string;
  queued: number;
  /** null: this queue has no in-progress state to count. */
  processing: number | null;
  /** Failed but still being retried. null: this queue doesn't retry. */
  retrying: number | null;
  /** Failed for good -- needs a person. */
  deadLetter: number;
  /** Oldest item still waiting, ISO time; null when nothing waits. */
  oldestWaitingAt: string | null;
  note: string | null;
};

export type HealthSnapshot = {
  checkedAt: string;
  database: { ok: boolean; latencyMs: number | null; error: string | null };
  ai: {
    enabledProviders: number;
    configuredProviders: number;
    platformKeyEnv: boolean;
    last24h: WindowCount;
    last7d: WindowCount;
  };
  email: { sendConfigured: boolean; failed24h: number; failed7d: number };
  whatsapp: { webhookConfigured: boolean; connections: Record<string, number>; errors24h: number; errors7d: number };
  storage: { ok: boolean; missing: string[]; error: string | null };
  queues: QueueRow[];
  integrations: { key: string; name: string; status: string }[];
  webhooks: { last24h: WindowCount; last7d: WindowCount; providerFailure24h: string[] };
  api: { rateLimited24h: number; rateLimited7d: number };
  invoiceNow: { last24h: WindowCount; last7d: WindowCount };
};

type Client = ReturnType<typeof createAdminClient>;

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw new Error(error.message);
  return n ?? 0;
}

function since(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

async function checkDatabase(core: Client): Promise<HealthSnapshot["database"]> {
  const started = Date.now();
  const { error } = await core.from("modules").select("key", { head: true, count: "exact" });
  return error ? { ok: false, latencyMs: null, error: error.message } : { ok: true, latencyMs: Date.now() - started, error: null };
}

async function aiWindow(core: Client, discovery: Client, windowMs: number): Promise<WindowCount> {
  const from = since(windowMs);
  const [coreTotal, coreFailed, discTotal, discFailed] = await Promise.all([
    count(core.from("ai_runs").select("id", { head: true, count: "exact" }).gte("created_at", from)),
    count(core.from("ai_runs").select("id", { head: true, count: "exact" }).gte("created_at", from).eq("status", "failed")),
    count(discovery.from("ai_runs").select("id", { head: true, count: "exact" }).gte("created_at", from)),
    count(discovery.from("ai_runs").select("id", { head: true, count: "exact" }).gte("created_at", from).eq("status", "failed")),
  ]);
  return { failed: coreFailed + discFailed, total: coreTotal + discTotal };
}

async function webhookWindow(platform: Client, windowMs: number): Promise<WindowCount> {
  const from = since(windowMs);
  const [total, failed] = await Promise.all([
    count(platform.from("billing_events").select("id", { head: true, count: "exact" }).gte("received_at", from)),
    count(platform.from("billing_events").select("id", { head: true, count: "exact" }).gte("received_at", from).eq("processing_status", "failed")),
  ]);
  return { failed, total };
}

async function invoiceNowWindow(gst: Client, windowMs: number): Promise<WindowCount> {
  const from = since(windowMs);
  const [total, failed] = await Promise.all([
    count(gst.from("invoicenow_transmissions").select("id", { head: true, count: "exact" }).gte("created_at", from)),
    count(gst.from("invoicenow_transmissions").select("id", { head: true, count: "exact" }).gte("updated_at", from).in("status", ["failed", "rejected"])),
  ]);
  return { failed, total };
}

async function rateLimited(core: Client, windowMs: number): Promise<number> {
  const { data, error } = await core
    .from("api_rate_limit_counters")
    .select("request_count")
    .gte("window_start", since(windowMs))
    .gt("request_count", API_RATE_LIMIT_PER_MINUTE);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, r) => sum + (r.request_count as number) - API_RATE_LIMIT_PER_MINUTE, 0);
}

async function whatsappErrors(core: Client, windowMs: number): Promise<number> {
  const { data, error } = await core
    .from("audit_log")
    .select("after")
    .eq("action", "crm_channel_connection.health_changed")
    .gte("created_at", since(windowMs));
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => {
    const status = (r.after as { status?: string } | null)?.status;
    return status !== undefined && status !== "connected";
  }).length;
}

async function oldest(query: PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>, column: string): Promise<string | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data?.[0]?.[column] as string | undefined) ?? null;
}

async function collectQueues(core: Client, platform: Client): Promise<QueueRow[]> {
  const now = new Date().toISOString();
  const staleExport = since(ALERT_THRESHOLDS.exportStuckHours * HOUR);
  const [
    evQueued,
    evRetrying,
    evDead,
    evParked,
    evOldest,
    bQueued,
    bProcessing,
    bRetrying,
    bDead,
    bOldest,
    xQueued,
    xRunning,
    xFailed,
    xOldest,
  ] = await Promise.all([
    count(core.from("domain_events").select("id", { head: true, count: "exact" }).eq("status", "pending").eq("attempts", 0)),
    count(core.from("domain_events").select("id", { head: true, count: "exact" }).eq("status", "pending").gt("attempts", 0)),
    count(core.from("domain_events").select("id", { head: true, count: "exact" }).eq("status", "failed")),
    count(core.from("domain_events").select("id", { head: true, count: "exact" }).eq("status", "parked")),
    oldest(core.from("domain_events").select("next_attempt_at").eq("status", "pending").lte("next_attempt_at", now).order("next_attempt_at").limit(1), "next_attempt_at"),
    count(platform.from("billing_events").select("id", { head: true, count: "exact" }).eq("processing_status", "received")),
    count(platform.from("billing_events").select("id", { head: true, count: "exact" }).eq("processing_status", "processing")),
    count(platform.from("billing_events").select("id", { head: true, count: "exact" }).eq("processing_status", "failed").lt("attempt_count", BILLING_MAX_ATTEMPTS)),
    count(platform.from("billing_events").select("id", { head: true, count: "exact" }).eq("processing_status", "failed").gte("attempt_count", BILLING_MAX_ATTEMPTS)),
    oldest(platform.from("billing_events").select("received_at").in("processing_status", ["received", "processing", "failed"]).order("received_at").limit(1), "received_at"),
    count(core.from("export_jobs").select("id", { head: true, count: "exact" }).eq("status", "queued")),
    count(core.from("export_jobs").select("id", { head: true, count: "exact" }).eq("status", "running")),
    count(core.from("export_jobs").select("id", { head: true, count: "exact" }).eq("status", "failed")),
    oldest(core.from("export_jobs").select("created_at").in("status", ["queued", "running"]).lte("created_at", staleExport).order("created_at").limit(1), "created_at"),
  ]);

  return [
    {
      key: "domain_events",
      label: "Domain events",
      queued: evQueued,
      processing: null,
      retrying: evRetrying,
      deadLetter: evDead,
      oldestWaitingAt: evOldest,
      note: evParked > 0 ? `${evParked} parked until a module is licensed` : null,
    },
    {
      key: "billing_events",
      label: "Billing webhooks",
      queued: bQueued,
      processing: bProcessing,
      retrying: bRetrying,
      deadLetter: bDead,
      oldestWaitingAt: bOldest,
      note: null,
    },
    {
      key: "export_jobs",
      label: "Exports",
      queued: xQueued,
      processing: xRunning,
      retrying: null,
      deadLetter: xFailed,
      oldestWaitingAt: xOldest,
      note: xOldest ? `Waiting over ${ALERT_THRESHOLDS.exportStuckHours}h` : null,
    },
  ];
}

/** The health page's read: a SUPERADMIN only. */
export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  await requireSuperadmin();
  return collectHealthSnapshot();
}

/** Unchecked: only for a caller that has authorized another way (the cron's CRON_SECRET). */
export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
  const core = createAdminClient({ schema: "core" });
  const platform = createAdminClient({ schema: "platform" });
  const discovery = createAdminClient({ schema: "discovery" });
  const crm = createAdminClient({ schema: "crm" });
  const gst = createAdminClient({ schema: "gst" });
  const storageClient = createAdminClient();

  const database = await checkDatabase(core);
  if (!database.ok) {
    // Nothing else can be read without the database; report only what is known.
    return emptySnapshot(database);
  }

  const [providers, keys, ai24, ai7, emailFailed24, emailFailed7, connections, wa24, wa7, buckets, queues, integrations, wh24, wh7, billingProviders, api24, api7, inv24, inv7] =
    await Promise.all([
      platform.from("ai_providers").select("provider, enabled"),
      // Which providers have a stored key -- the provider name only, never the key.
      platform.from("ai_provider_keys").select("provider"),
      aiWindow(core, discovery, DAY),
      aiWindow(core, discovery, 7 * DAY),
      count(discovery.from("messages").select("id", { head: true, count: "exact" }).eq("status", "failed").gte("updated_at", since(DAY))),
      count(discovery.from("messages").select("id", { head: true, count: "exact" }).eq("status", "failed").gte("updated_at", since(7 * DAY))),
      crm.from("channel_connection").select("status").eq("channel", "whatsapp"),
      whatsappErrors(core, DAY),
      whatsappErrors(core, 7 * DAY),
      storageClient.storage.listBuckets(),
      collectQueues(core, platform),
      platform.from("integrations").select("integration_key, display_name, status").order("integration_key"),
      webhookWindow(platform, DAY),
      webhookWindow(platform, 7 * DAY),
      platform.from("billing_providers").select("provider, enabled, last_webhook_failure_at"),
      rateLimited(core, DAY),
      rateLimited(core, 7 * DAY),
      invoiceNowWindow(gst, DAY),
      invoiceNowWindow(gst, 7 * DAY),
    ]);

  for (const result of [providers, keys, connections, integrations, billingProviders]) {
    if (result.error) throw new Error(result.error.message);
  }
  const keyed = new Set(((keys.data ?? []) as { provider: string }[]).map((k) => k.provider));
  const enabled = ((providers.data ?? []) as { provider: string; enabled: boolean }[]).filter((p) => p.enabled);

  const connectionCounts: Record<string, number> = {};
  for (const row of (connections.data ?? []) as { status: string }[]) {
    connectionCounts[row.status] = (connectionCounts[row.status] ?? 0) + 1;
  }

  const bucketNames = new Set((buckets.data ?? []).map((b) => b.name));
  const dayAgo = Date.now() - DAY;

  // PLATFORM-P1-14.1: "configured" means on the platform's Keys page or in the deployment.
  // EMAIL-SMTP-01: email is configured when the platform's SMTP mailbox is.
  const [emailSender, whatsappSecret, whatsappToken] = await Promise.all([
    platformSender(),
    platformKey("CRM_WHATSAPP_APP_SECRET"),
    platformKey("CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    database,
    ai: {
      enabledProviders: enabled.length,
      configuredProviders: enabled.filter((p) => keyed.has(p.provider)).length,
      platformKeyEnv: Boolean(process.env.PLATFORM_AI_API_KEY),
      last24h: ai24,
      last7d: ai7,
    },
    email: {
      sendConfigured: emailSender !== null,
      failed24h: emailFailed24,
      failed7d: emailFailed7,
    },
    whatsapp: {
      webhookConfigured: Boolean(whatsappSecret && whatsappToken),
      connections: connectionCounts,
      errors24h: wa24,
      errors7d: wa7,
    },
    storage: buckets.error
      ? { ok: false, missing: [], error: buckets.error.message }
      : { ok: true, missing: EXPECTED_BUCKETS.filter((b) => !bucketNames.has(b)), error: null },
    queues,
    integrations: ((integrations.data ?? []) as { integration_key: string; display_name: string; status: string }[]).map((i) => ({
      key: i.integration_key,
      name: i.display_name,
      status: i.status,
    })),
    webhooks: {
      last24h: wh24,
      last7d: wh7,
      providerFailure24h: ((billingProviders.data ?? []) as { provider: string; enabled: boolean; last_webhook_failure_at: string | null }[])
        .filter((p) => p.enabled && p.last_webhook_failure_at && Date.parse(p.last_webhook_failure_at) >= dayAgo)
        .map((p) => p.provider),
    },
    api: { rateLimited24h: api24, rateLimited7d: api7 },
    invoiceNow: { last24h: inv24, last7d: inv7 },
  };
}

function emptySnapshot(database: HealthSnapshot["database"]): HealthSnapshot {
  const none: WindowCount = { failed: 0, total: 0 };
  return {
    checkedAt: new Date().toISOString(),
    database,
    ai: { enabledProviders: 0, configuredProviders: 0, platformKeyEnv: false, last24h: none, last7d: none },
    email: { sendConfigured: false, failed24h: 0, failed7d: 0 },
    whatsapp: { webhookConfigured: false, connections: {}, errors24h: 0, errors7d: 0 },
    storage: { ok: false, missing: [], error: "Not checked: the database is unreachable." },
    queues: [],
    integrations: [],
    webhooks: { last24h: none, last7d: none, providerFailure24h: [] },
    api: { rateLimited24h: 0, rateLimited7d: 0 },
    invoiceNow: { last24h: none, last7d: none },
  };
}

// ---------------------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------------------

export type ComponentStatus = "ok" | "degraded" | "down" | "needs_setup" | "not_in_use" | "unavailable";

export type HealthComponent = { key: string; label: string; status: ComponentStatus; detail: string };

function aiFailing(w: WindowCount): boolean {
  return (w.total ?? 0) >= ALERT_THRESHOLDS.aiFailureMinRuns && (w.failed / (w.total ?? 1)) * 100 >= ALERT_THRESHOLDS.aiFailureRatePercent;
}

function overdueHours(at: string | null, now: number): number {
  return at ? (now - Date.parse(at)) / HOUR : 0;
}

/** PLATFORM-P1-07.1: one status per component, each with the evidence behind it. */
export function deriveComponents(s: HealthSnapshot): HealthComponent[] {
  if (!s.database.ok) {
    return [{ key: "database", label: "Database", status: "down", detail: s.database.error ?? "Unreachable" }];
  }
  const now = Date.parse(s.checkedAt);
  const components: HealthComponent[] = [];

  components.push({ key: "database", label: "Database", status: "ok", detail: `Responded in ${s.database.latencyMs} ms` });

  const aiReady = s.ai.configuredProviders > 0 || s.ai.platformKeyEnv;
  components.push({
    key: "ai",
    label: "AI providers",
    status: !aiReady ? "needs_setup" : aiFailing(s.ai.last24h) ? "degraded" : "ok",
    detail: !aiReady
      ? "No enabled provider has a key"
      : `${s.ai.last24h.failed} of ${s.ai.last24h.total} runs failed in 24h`,
  });

  components.push({
    key: "email",
    label: "Email",
    status: !s.email.sendConfigured ? "needs_setup" : "ok",
    detail: !s.email.sendConfigured
      ? "SMTP mailbox not set on Keys"
      : `${s.email.failed24h} outreach emails bounced or failed in 24h`,
  });

  const waTotal = Object.values(s.whatsapp.connections).reduce((a, b) => a + b, 0);
  const waBad = waTotal - (s.whatsapp.connections.connected ?? 0) - (s.whatsapp.connections.disconnected ?? 0);
  components.push({
    key: "whatsapp",
    label: "WhatsApp",
    status: !s.whatsapp.webhookConfigured ? "needs_setup" : waTotal === 0 ? "not_in_use" : waBad > 0 ? "degraded" : "ok",
    detail: !s.whatsapp.webhookConfigured
      ? "Webhook secret / verify token not set"
      : waTotal === 0
        ? "No business has connected WhatsApp"
        : `${s.whatsapp.connections.connected ?? 0} connected, ${waBad} need attention`,
  });

  components.push({
    key: "storage",
    label: "Storage",
    status: s.storage.error ? "unavailable" : s.storage.missing.length > 0 ? "degraded" : "ok",
    detail: s.storage.error ?? (s.storage.missing.length > 0 ? `Missing bucket: ${s.storage.missing.join(", ")}` : "All buckets present"),
  });

  const dead = s.queues.reduce((sum, q) => sum + q.deadLetter, 0);
  const events = s.queues.find((q) => q.key === "domain_events");
  const stalled = overdueHours(events?.oldestWaitingAt ?? null, now) > ALERT_THRESHOLDS.domainEventOverdueHours;
  components.push({
    key: "queues",
    label: "Queues",
    status: stalled ? "down" : dead > 0 ? "degraded" : "ok",
    detail: stalled ? "Domain events aren't being drained" : dead > 0 ? `${dead} items failed for good` : "Draining normally",
  });

  const brokenIntegrations = s.integrations.filter((i) => i.status === "error" || i.status === "needs_reauthorization");
  const webhookFailing = s.webhooks.providerFailure24h.length > 0;
  components.push({
    key: "integrations",
    label: "External integrations",
    status: brokenIntegrations.length > 0 || webhookFailing ? "degraded" : "ok",
    detail:
      brokenIntegrations.length > 0
        ? `${brokenIntegrations.map((i) => i.name).join(", ")} need attention`
        : webhookFailing
          ? `${s.webhooks.providerFailure24h.join(", ")} webhook rejected in 24h`
          : `${s.integrations.filter((i) => i.status === "connected").length} connected`,
  });

  return components;
}

export type OpsAlert = { key: string; severity: "warning" | "critical"; message: string; details: Record<string, unknown> };

/** PLATFORM-P1-07.4: the alerts firing for this snapshot. Recorded and emailed by
 * platform-ops-alerts.ts; a key that stops firing is resolved there. */
export function evaluateAlerts(s: HealthSnapshot): OpsAlert[] {
  if (!s.database.ok) {
    return [{ key: "database.unreachable", severity: "critical", message: "The database is unreachable.", details: { error: s.database.error } }];
  }
  const now = Date.parse(s.checkedAt);
  const alerts: OpsAlert[] = [];
  const queue = (key: QueueRow["key"]) => s.queues.find((q) => q.key === key);

  const events = queue("domain_events");
  const overdue = overdueHours(events?.oldestWaitingAt ?? null, now);
  if (overdue > ALERT_THRESHOLDS.domainEventOverdueHours) {
    alerts.push({
      key: "queue.domain_events.stalled",
      severity: "critical",
      message: `Domain events have waited ${Math.floor(overdue)}h: the drain isn't running.`,
      details: { oldestWaitingAt: events?.oldestWaitingAt },
    });
  }
  if (events && events.deadLetter > 0) {
    alerts.push({
      key: "queue.domain_events.dead_letter",
      severity: "warning",
      message: `${events.deadLetter} domain event(s) failed for good.`,
      details: { failed: events.deadLetter },
    });
  }
  const billing = queue("billing_events");
  if (billing && billing.deadLetter > 0) {
    alerts.push({
      key: "queue.billing_events.dead_letter",
      severity: "critical",
      message: `${billing.deadLetter} billing webhook(s) failed after every retry.`,
      details: { failed: billing.deadLetter },
    });
  }
  const exportsQueue = queue("export_jobs");
  if (exportsQueue?.oldestWaitingAt) {
    alerts.push({
      key: "queue.export_jobs.stuck",
      severity: "warning",
      message: `An export has been waiting since ${exportsQueue.oldestWaitingAt}.`,
      details: { oldestWaitingAt: exportsQueue.oldestWaitingAt },
    });
  }
  if (aiFailing(s.ai.last24h)) {
    alerts.push({
      key: "ai.failure_rate",
      severity: "warning",
      message: `${s.ai.last24h.failed} of ${s.ai.last24h.total} AI runs failed in the last 24h.`,
      details: { ...s.ai.last24h },
    });
  }
  if (!s.storage.error && s.storage.missing.length > 0) {
    alerts.push({
      key: "storage.missing_buckets",
      severity: "critical",
      message: `Storage bucket(s) missing: ${s.storage.missing.join(", ")}.`,
      details: { missing: s.storage.missing },
    });
  }
  const waBad = Object.entries(s.whatsapp.connections)
    .filter(([status]) => status !== "connected" && status !== "disconnected")
    .reduce((sum, [, n]) => sum + n, 0);
  if (waBad > 0) {
    alerts.push({
      key: "whatsapp.connections",
      severity: "warning",
      message: `${waBad} WhatsApp connection(s) need attention.`,
      details: { connections: s.whatsapp.connections },
    });
  }
  if (s.webhooks.providerFailure24h.length > 0) {
    alerts.push({
      key: "billing.webhook_rejected",
      severity: "critical",
      message: `${s.webhooks.providerFailure24h.join(", ")} webhooks were rejected in the last 24h.`,
      details: { providers: s.webhooks.providerFailure24h },
    });
  }
  const broken = s.integrations.filter((i) => i.status === "error" || i.status === "needs_reauthorization");
  if (broken.length > 0) {
    alerts.push({
      key: "integrations.broken",
      severity: "warning",
      message: `${broken.map((i) => i.name).join(", ")} marked as needing attention.`,
      details: { integrations: broken.map((i) => i.key) },
    });
  }
  return alerts;
}

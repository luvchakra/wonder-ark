import { createAdminClient } from "../db/admin";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P0-02: data for the `/platform` control-plane dashboard
 * (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §6). Every query here reads across every
 * tenant by design -- the service-role client is correct here (same reasoning
 * `admin/queries.ts`'s own docstring gives), so every function here checks
 * `requireSuperadmin()` itself before it reads (PLATFORM-P0-01.2). The layout's check is
 * not enough on its own: a layout and its page render side by side, so a layout that
 * redirects does not stop the page from fetching.
 */

export type PlatformOverview = {
  businessCount: number;
  activeUserCount: number;
  activeLicenseCount: number;
  licensedModuleCounts: Record<string, number>;
  aiUsage30d: { runCount: number; estimatedCostUsd: number };
  apiUsage: { activeKeyCount: number; requests24h: number };
  openPlatformIssues: number;
};

/** Businesses, active users, active licenses (a proxy for "active subscriptions" -- there
 * is no separate subscription-plan/billing entity yet, see PLATFORM-P0-04), per-module
 * license counts, 30-day AI usage, 24h API usage, and open platform issues (domain events
 * that exhausted their retries). MRR/ARR is deliberately not computed here: nothing in
 * `core` prices a license or a plan yet (`core.business_settings.plan` is a free-text
 * label, not a billing entity) -- fabricating a number would be worse than omitting it. */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  await requireSuperadmin();
  const supabase = createAdminClient({ schema: "core" });

  const [businesses, accountMembers, licenses, aiRuns, apiKeys, rateLimitCounters, failedEvents] =
    await Promise.all([
      supabase.from("businesses").select("id", { count: "exact", head: true }),
      supabase.from("account_members").select("user_id"),
      supabase.from("licenses").select("module_key, status").eq("status", "active"),
      supabase
        .from("ai_runs")
        .select("estimated_cost")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null),
      supabase
        .from("api_rate_limit_counters")
        .select("request_count")
        .gte("window_start", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("domain_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);

  if (businesses.error) throw businesses.error;
  if (accountMembers.error) throw accountMembers.error;
  if (licenses.error) throw licenses.error;
  if (aiRuns.error) throw aiRuns.error;
  if (apiKeys.error) throw apiKeys.error;
  if (rateLimitCounters.error) throw rateLimitCounters.error;
  if (failedEvents.error) throw failedEvents.error;

  const licensedModuleCounts: Record<string, number> = {};
  for (const license of licenses.data) {
    licensedModuleCounts[license.module_key] = (licensedModuleCounts[license.module_key] ?? 0) + 1;
  }

  return {
    businessCount: businesses.count ?? 0,
    activeUserCount: new Set(accountMembers.data.map((m) => m.user_id)).size,
    activeLicenseCount: licenses.data.length,
    licensedModuleCounts,
    aiUsage30d: {
      runCount: aiRuns.data.length,
      estimatedCostUsd: aiRuns.data.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0),
    },
    apiUsage: {
      activeKeyCount: apiKeys.count ?? 0,
      requests24h: rateLimitCounters.data.reduce((sum, r) => sum + r.request_count, 0),
    },
    openPlatformIssues: failedEvents.count ?? 0,
  };
}

export type ConfigHealthItem = {
  key: string;
  label: string;
  configured: boolean;
  detail: string;
};

/** PLATFORM-P0-02.2. None of these seven categories have a platform-wide config surface
 * yet -- each belongs to its own later story (named in `detail` below) -- so every item
 * honestly reports `configured: false` today rather than a fabricated status. The one
 * item with a real, if narrower, signal (per-business BYOK AI keys) says so explicitly
 * instead of being folded into "configured", since it isn't the platform-wide internal
 * provider registry PLATFORM-P0-09 will add. */
export async function getConfigurationHealth(): Promise<ConfigHealthItem[]> {
  await requireSuperadmin();
  const supabase = createAdminClient({ schema: "core" });
  const { count, error } = await supabase
    .from("ai_provider_credentials")
    .select("business_id", { count: "exact", head: true })
    .eq("status", "connected");
  if (error) throw error;
  const byokCount = count ?? 0;

  return [
    {
      key: "ai_providers",
      label: "AI providers configured",
      configured: false,
      detail:
        byokCount > 0
          ? `No platform-wide provider registry yet (PLATFORM-P0-09) -- ${byokCount} business(es) currently bring their own key`
          : "No platform-wide provider registry yet (PLATFORM-P0-09)",
    },
    { key: "payment_provider", label: "Payment provider configured", configured: false, detail: "Ships with PLATFORM-P0-12" },
    { key: "email", label: "Email configured", configured: false, detail: "Ships with PLATFORM-P0-11" },
    { key: "whatsapp", label: "WhatsApp providers configured", configured: false, detail: "Ships with PLATFORM-P0-12" },
    { key: "country_packs", label: "Country packs enabled", configured: false, detail: "Ships with PLATFORM-P0-13" },
    { key: "subscription_plans", label: "Subscription plans active", configured: false, detail: "Ships with PLATFORM-P0-04" },
    { key: "feature_flags", label: "Feature flags active", configured: false, detail: "Ships with PLATFORM-P0-08" },
  ];
}

export type GlobalChange = {
  id: string;
  businessName: string;
  moduleKey: string;
  eventType: string;
  createdAt: string;
};

/** PLATFORM-P0-02.3. `core.license_events` is the only genuinely platform-wide "something
 * changed" ledger that exists yet (module activated/deactivated/reactivated/expired,
 * across every tenant) -- future stories add their own sources (plan changes from
 * PLATFORM-P0-04, flag flips from PLATFORM-P0-08's own audit, announcements from
 * PLATFORM-P0-15) once those exist; this does not fabricate a generic events table ahead
 * of that need. */
export async function getRecentGlobalChanges(limit = 20): Promise<GlobalChange[]> {
  await requireSuperadmin();
  const supabase = createAdminClient({ schema: "core" });
  const { data: events, error } = await supabase
    .from("license_events")
    .select("id, business_id, module_key, event_type, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (events.length === 0) return [];

  const businessIds = [...new Set(events.map((e) => e.business_id))];
  const { data: businesses, error: businessesError } = await supabase
    .from("businesses")
    .select("id, name")
    .in("id", businessIds);
  if (businessesError) throw businessesError;
  const nameByBusinessId = new Map(businesses.map((b) => [b.id, b.name]));

  return events.map((e) => ({
    id: e.id,
    businessName: nameByBusinessId.get(e.business_id) ?? "Unknown business",
    moduleKey: e.module_key,
    eventType: e.event_type,
    createdAt: e.created_at,
  }));
}

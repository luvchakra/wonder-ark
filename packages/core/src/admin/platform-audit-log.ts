import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { listAllUsers } from "./queries";
import { listConfigVersions, type ConfigResourceType } from "./config-history";
import {
  classifySeverity,
  matchesFilters,
  resourceLabelFor,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditResourceType,
  type AuditSeverity,
} from "./platform-audit-log-types";

/**
 * PLATFORM-P0-16.1/16.2/16.3 ("Platform Audit", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §20). See `20260913480000_platform_audit_log.sql`'s own header comment for
 * the full entity-ownership check against PLATFORM-P0-17 ("Configuration Versioning") and
 * the reasoning behind every scope decision below; summarized here for the read side.
 * Types + severity classification live in `platform-audit-log-types.ts` (its own
 * docstring explains why -- the same "no server import for a Client Component" split
 * `config-history-diff.ts` already established).
 *
 * **One merged search surface over two sources**, not a single SQL table/view, matching
 * this codebase's own established preference (see `config-history.ts`'s own per-resource
 * queries) for simple, explicit per-source reads over a cross-schema SQL view:
 *   1. `platform.audit_log` -- the new unified, generic table this story adds, covering
 *      six resource types that had zero audit trail before this story (`compliance_*`,
 *      `plan_features`/`plan_limits`/`plan_modules` -- 16.2's own "compliance rule
 *      changes"/"entitlement changes").
 *   2. The eleven pre-existing `platform.*_events` tables PLATFORM-P0-17 already built,
 *      read via `listConfigVersions(type, null)` -- passing `null` for the instance id
 *      returns EVERY row in that resource type's own events table (no per-instance
 *      filter), which is exactly the raw feed Audit Search needs across every instance at
 *      once. `ConfigVersionEntry.version`/`.isCurrent` are meaningless in this cross-
 *      instance context (they assume one instance's own chronological sequence) and are
 *      simply ignored here -- Audit Search only reads action/reason/performedBy/
 *      performedAt/before/after from each entry, never version/isCurrent.
 * No new data is written to service the eleven legacy types; this file is read-only
 * against them, same authorization boundary (`requireSuperadmin()` inside
 * `listConfigVersions()` itself) as `/platform/config-history` already uses.
 */

export {
  AUDIT_RESOURCE_TYPE_OPTIONS,
  classifySeverity,
  matchesFilters,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditResourceType,
  type AuditSeverity,
} from "./platform-audit-log-types";

/** The resource types written straight into `platform.audit_log` (the six this story's own
 * migration added triggers for, plus later direct writers) -- the only
 * ones with rows in `platform.audit_log`. */
const NEW_RESOURCE_TYPES: AuditResourceType[] = [
  "compliance_country",
  "compliance_pack",
  "compliance_pack_feature",
  "plan_feature",
  "plan_limit",
  "plan_module",
  // PLATFORM-P0-10.4 -- AI feature kill switch changes.
  "ai_operation_switch",
  // PLATFORM-P1-02.3 -- business limit overrides created and revoked.
  "business_override",
  // PLATFORM-P1-09.1 -- Terms / Privacy Policy versions published.
  "legal_document",
  // PLATFORM-P1-10.x -- organizations and environments.
  "organization",
  "business_environment",
  "business_address",
  "business_status",
  "business_notes",
  "organization_plan",
  "organization_profile",
  // PLATFORM-P1-13.2 -- the WonderJobs career-site key saved or cleared.
  "careers_connection",
];

/** The eleven resource types PLATFORM-P0-17 already built history tables for. */
const LEGACY_RESOURCE_TYPES: ConfigResourceType[] = [
  "plan",
  "feature_flag",
  "announcement",
  "system_policies",
  "ai_provider",
  "ai_provider_routing",
  "ai_feature_policies",
  "email_provider",
  "email_template",
  "integration",
  "module_status",
];

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  severity: AuditSeverity;
  reason: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  performed_at: string;
};

async function fetchNewAuditLogRows(): Promise<AuditLogEntry[]> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .in("resource_type", NEW_RESOURCE_TYPES)
    .order("performed_at", { ascending: false });
  if (error) throw error;

  return (data as AuditLogRow[]).map((row) => ({
    id: `new:${row.id}`,
    resourceType: row.resource_type as AuditResourceType,
    resourceLabel: resourceLabelFor(row.resource_type as AuditResourceType),
    resourceId: row.resource_id,
    action: row.action,
    severity: row.severity,
    reason: row.reason,
    performedBy: row.actor_id,
    performedByLabel: "",
    performedAt: row.performed_at,
    before: row.previous_value,
    after: row.new_value,
  }));
}

async function fetchLegacyEntries(resourceType: ConfigResourceType): Promise<AuditLogEntry[]> {
  const versions = await listConfigVersions(resourceType, null);
  return versions.map((v) => ({
    id: `legacy:${resourceType}:${v.eventId}`,
    resourceType,
    resourceLabel: resourceLabelFor(resourceType),
    resourceId: v.instanceId,
    action: v.action,
    severity: classifySeverity(resourceType, v.before, v.after),
    reason: v.reason || null,
    performedBy: v.performedBy,
    performedByLabel: "",
    performedAt: v.performedAt,
    before: v.before,
    after: v.after,
  }));
}

const DEFAULT_LIMIT = 100;

/**
 * PLATFORM-P0-16.3 ("Audit Search"). Merges the new unified log with every legacy
 * resource type's own event history, filters, sorts newest-first, and caps to `limit`
 * (default 100) -- a fixed cap rather than real cursor pagination, matching this backlog's
 * own "simplest implementation that works" bar for an internal admin tool at today's data
 * volume (CLAUDE.md development principle #1); a genuine pagination need is a mechanical
 * follow-up, not a reason to hold this story.
 *
 * When `filters.resourceType` is set, only that one source is queried (cheaper, and lets
 * the UI narrow to one resource type without paying for the other sixteen).
 */
export async function searchPlatformAuditLog(
  filters: AuditLogFilters = {},
  limit: number = DEFAULT_LIMIT,
): Promise<AuditLogEntry[]> {
  await requireSuperadmin();

  const wantsNew = !filters.resourceType || NEW_RESOURCE_TYPES.includes(filters.resourceType);
  const wantsLegacy = !filters.resourceType || LEGACY_RESOURCE_TYPES.includes(filters.resourceType as ConfigResourceType);

  const legacyTypes = filters.resourceType
    ? LEGACY_RESOURCE_TYPES.filter((t) => t === filters.resourceType)
    : LEGACY_RESOURCE_TYPES;

  const [newEntries, legacyEntriesByType] = await Promise.all([
    wantsNew ? fetchNewAuditLogRows() : Promise.resolve([]),
    wantsLegacy ? Promise.all(legacyTypes.map(fetchLegacyEntries)) : Promise.resolve([]),
  ]);

  const merged = [...newEntries, ...legacyEntriesByType.flat()].filter((e) => matchesFilters(e, filters));
  merged.sort((a, b) => (a.performedAt < b.performedAt ? 1 : -1));
  const page = merged.slice(0, limit);

  const actorIds = [...new Set(page.map((e) => e.performedBy).filter((id): id is string => id !== null))];
  const labelByActorId = await resolveActorLabels(actorIds);
  return page.map((e) => ({ ...e, performedByLabel: e.performedBy ? (labelByActorId.get(e.performedBy) ?? e.performedBy) : "System" }));
}

async function resolveActorLabels(actorIds: string[]): Promise<Map<string, string>> {
  if (actorIds.length === 0) return new Map();
  const users = await listAllUsers();
  const byId = new Map(users.map((u) => [u.id, u.full_name || u.email || u.id]));
  return new Map(actorIds.map((id) => [id, byId.get(id) ?? id]));
}

/** For the Audit Search page's own "Actor" filter dropdown -- every user who has ever
 * appeared as an actor in the merged log, not the whole platform user list. */
export async function listAuditLogActors(): Promise<{ id: string; label: string }[]> {
  await requireSuperadmin();
  const recent = await searchPlatformAuditLog({}, 500);
  const seen = new Map<string, string>();
  for (const entry of recent) {
    if (entry.performedBy) seen.set(entry.performedBy, entry.performedByLabel);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}

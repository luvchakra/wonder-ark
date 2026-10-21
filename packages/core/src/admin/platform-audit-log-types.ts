// Type-only import -- erased entirely at compile time (no runtime `config-history.ts`
// import remains in the emitted JS), so this stays safe for a Client Component to import
// even though `config-history.ts` itself has server-only runtime imports.
import type { ConfigResourceType } from "./config-history";

/**
 * PLATFORM-P0-16.1/16.2/16.3 ("Platform Audit", §20). Types + the pure severity/label
 * logic, split out of `platform-audit-log.ts` into their own file with no server-only
 * imports -- the exact same reason `config-history-diff.ts` exists as its own file (see
 * that file's own docstring): `platform-audit-log.ts` imports `../db/server` (which pulls
 * in `next/headers`) at module scope for its data-loading functions, so importing ANY
 * export from that file -- even a pure type -- from a Client Component drags the whole
 * module graph into the client bundle and fails the build. `audit-search-explorer.tsx` (a
 * Client Component) imports this file directly instead; `platform-audit-log.ts`
 * re-exports everything here so server-side callers still see one logical module.
 */

export type AuditSeverity = "normal" | "high";

export type AuditResourceType =
  | ConfigResourceType
  | "compliance_country"
  | "compliance_pack"
  | "compliance_pack_feature"
  | "plan_feature"
  | "plan_limit"
  | "plan_module"
  | "plan_price"
  // PLATFORM-P0-10.4 -- written by platform.set_ai_operation_enabled().
  | "ai_operation_switch"
  // PLATFORM-P1-02.3 -- written by platform.business_limit_overrides' audit trigger.
  | "business_override"
  // PLATFORM-P1-09.1 -- written by platform.legal_document_versions' audit trigger.
  | "legal_document"
  // PLATFORM-P1-10.x -- organizations and environments, written by the platform.* console
  // functions (migrations 20261013100000/110000).
  | "organization"
  | "business_environment"
  | "business_address"
  | "business_status"
  | "business_notes"
  | "organization_plan"
  | "organization_profile"
  // PLATFORM-P1-13.2 -- the WonderJobs career-site key saved or cleared, written by
  // platform.set_careers_key()/clear_careers_key() (last four characters only).
  | "careers_connection";

export type AuditLogEntry = {
  id: string;
  resourceType: AuditResourceType;
  resourceLabel: string;
  resourceId: string | null;
  action: string;
  severity: AuditSeverity;
  reason: string | null;
  performedBy: string | null;
  performedByLabel: string;
  performedAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type AuditLogFilters = {
  dateFrom?: string;
  dateTo?: string;
  actorId?: string;
  resourceType?: AuditResourceType;
  action?: string;
  severity?: AuditSeverity;
};

/** Every resource type Audit Search covers, and the human label for its dropdown. */
export const AUDIT_RESOURCE_TYPE_OPTIONS: { key: AuditResourceType; label: string }[] = [
  { key: "compliance_country", label: "Compliance Country" },
  { key: "compliance_pack", label: "Compliance Pack" },
  { key: "compliance_pack_feature", label: "Compliance Pack Feature" },
  { key: "plan_feature", label: "Plan Feature Entitlement" },
  { key: "plan_limit", label: "Plan Limit" },
  { key: "plan_module", label: "Plan Module Entitlement" },
  { key: "plan", label: "Plan" },
  { key: "plan_price", label: "Plan Price Mapping" },
  { key: "ai_operation_switch", label: "AI Feature Kill Switch" },
  { key: "business_override", label: "Business Override" },
  { key: "legal_document", label: "Legal Document Version" },
  { key: "organization", label: "Organization" },
  { key: "business_environment", label: "Environment" },
  { key: "business_address", label: "Organization Address" },
  { key: "business_status", label: "Organization Status" },
  { key: "business_notes", label: "Environment Notes" },
  { key: "organization_plan", label: "Organization Plan" },
  { key: "organization_profile", label: "Organization Details" },
  { key: "careers_connection", label: "Careers Connection" },
  { key: "billing_provider", label: "Billing Provider" },
  { key: "billing_settings", label: "Billing Settings" },
  { key: "feature_flag", label: "Feature Flag" },
  { key: "announcement", label: "Announcement" },
  { key: "system_policies", label: "Platform Policies" },
  { key: "ai_provider", label: "AI Provider" },
  { key: "ai_provider_routing", label: "AI Routing" },
  { key: "ai_feature_policies", label: "AI Feature Policies" },
  { key: "email_provider", label: "Email Provider" },
  { key: "email_template", label: "Email Template" },
  { key: "integration", label: "Integration" },
  { key: "module_status", label: "Module Status" },
];

const RESOURCE_LABEL = new Map(AUDIT_RESOURCE_TYPE_OPTIONS.map((o) => [o.key, o.label]));

export function resourceLabelFor(resourceType: AuditResourceType): string {
  return RESOURCE_LABEL.get(resourceType) ?? resourceType;
}

/** Fixed by resource type -- see this file's own top-of-file docstring. `announcement`
 * is handled separately (per-row, by its own `type` field) in `classifySeverity()`. */
const RESOURCE_SEVERITY: Record<Exclude<AuditResourceType, "announcement">, AuditSeverity> = {
  compliance_country: "high",
  compliance_pack: "high",
  compliance_pack_feature: "high",
  plan_feature: "high",
  plan_limit: "high",
  plan_module: "high",
  plan: "high",
  plan_price: "high",
  ai_operation_switch: "high",
  business_override: "high",
  legal_document: "high",
  organization: "high",
  business_environment: "high",
  business_address: "high",
  business_status: "high",
  business_notes: "normal",
  organization_plan: "high",
  organization_profile: "normal",
  careers_connection: "high",
  billing_provider: "high",
  billing_settings: "high",
  feature_flag: "high",
  system_policies: "high",
  ai_provider: "high",
  integration: "high",
  module_status: "high",
  ai_provider_routing: "normal",
  ai_feature_policies: "normal",
  email_provider: "normal",
  email_template: "normal",
};

const HIGH_SEVERITY_ANNOUNCEMENT_TYPES = new Set(["maintenance", "critical"]);

/** Pure, unit-testable (CLAUDE.md development principle #9) -- the one place severity is
 * decided for any resource type, including `announcement`'s own per-row special case. */
export function classifySeverity(
  resourceType: AuditResourceType,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditSeverity {
  if (resourceType === "announcement") {
    const type = (after?.type ?? before?.type) as string | undefined;
    return type && HIGH_SEVERITY_ANNOUNCEMENT_TYPES.has(type) ? "high" : "normal";
  }
  return RESOURCE_SEVERITY[resourceType];
}

/** Exported for unit testing (CLAUDE.md development principle #9) -- pure predicate, no
 * DB access. */
export function matchesFilters(entry: AuditLogEntry, filters: AuditLogFilters): boolean {
  if (filters.resourceType && entry.resourceType !== filters.resourceType) return false;
  if (filters.severity && entry.severity !== filters.severity) return false;
  if (filters.actorId && entry.performedBy !== filters.actorId) return false;
  if (filters.action && entry.action !== filters.action) return false;
  if (filters.dateFrom && entry.performedAt < filters.dateFrom) return false;
  if (filters.dateTo && entry.performedAt > filters.dateTo) return false;
  return true;
}

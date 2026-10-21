import { describe, expect, it } from "vitest";
import {
  AUDIT_RESOURCE_TYPE_OPTIONS,
  classifySeverity,
  matchesFilters,
  type AuditLogEntry,
} from "./platform-audit-log-types";

/**
 * PLATFORM-P0-16.1/16.2/16.3 ("Platform Audit", §20). Unit tests for the pure, DB-free
 * logic only (CLAUDE.md development principle #9) -- `searchPlatformAuditLog()` itself
 * (DB reads + `requireSuperadmin()`) is exercised by
 * `scripts/test-platform-audit-log-rls.mjs` against real local Postgres instead, the same
 * split this backlog's own prior stories already use (see `config-history.test.ts`, which
 * only tests `diffSnapshotFields`/`CONFIG_RESOURCE_TYPES`, never `listConfigVersions`).
 */

describe("AUDIT_RESOURCE_TYPE_OPTIONS", () => {
  it("lists all six newly-audited resource types, all eleven pre-existing ones, the billing ones, business overrides, legal versions and the careers key", () => {
    expect(AUDIT_RESOURCE_TYPE_OPTIONS).toHaveLength(31);
    const keys = new Set(AUDIT_RESOURCE_TYPE_OPTIONS.map((o) => o.key));
    for (const k of [
      "compliance_country",
      "compliance_pack",
      "compliance_pack_feature",
      "plan_feature",
      "plan_limit",
      "plan_module",
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
      "plan_price",
      "billing_provider",
      "billing_settings",
      "ai_operation_switch",
      "business_override",
      "legal_document",
      "organization",
      "business_environment",
      "business_address",
      "business_status",
      "business_notes",
      "organization_plan",
      "organization_profile",
      "careers_connection",
    ]) {
      expect(keys.has(k as never)).toBe(true);
    }
  });

  it("every option has a non-empty label", () => {
    for (const o of AUDIT_RESOURCE_TYPE_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
    }
  });
});

describe("classifySeverity (PLATFORM-P0-16.2 'mandatory audit for...' list)", () => {
  it("marks every resource type 16.2 names verbatim as high severity", () => {
    // plan changes, entitlement changes, global disable, AI key changes, security policy
    // changes / data retention, integrations, compliance rule changes.
    for (const type of [
      "plan",
      "plan_feature",
      "plan_limit",
      "plan_module",
      "feature_flag",
      "module_status",
      "ai_provider",
      "system_policies",
      "integration",
      "compliance_country",
      "compliance_pack",
      "compliance_pack_feature",
    ] as const) {
      expect(classifySeverity(type, null, {})).toBe("high");
    }
  });

  it("marks resource types 16.2 does not name as normal severity", () => {
    for (const type of ["ai_provider_routing", "ai_feature_policies", "email_provider", "email_template"] as const) {
      expect(classifySeverity(type, null, {})).toBe("normal");
    }
  });

  it("classifies an announcement by its own type -- maintenance/critical are high, information/warning are normal", () => {
    expect(classifySeverity("announcement", null, { type: "maintenance" })).toBe("high");
    expect(classifySeverity("announcement", null, { type: "critical" })).toBe("high");
    expect(classifySeverity("announcement", null, { type: "information" })).toBe("normal");
    expect(classifySeverity("announcement", null, { type: "warning" })).toBe("normal");
  });

  it("falls back to the before snapshot's type for a deleted announcement (no after)", () => {
    expect(classifySeverity("announcement", { type: "maintenance" }, null)).toBe("high");
  });
});

describe("matchesFilters", () => {
  const base: AuditLogEntry = {
    id: "1",
    resourceType: "plan",
    resourceLabel: "Plan",
    resourceId: "plan-1",
    action: "updated",
    severity: "high",
    reason: "test",
    performedBy: "user-a",
    performedByLabel: "user-a@example.com",
    performedAt: "2026-09-10T12:00:00.000Z",
    before: null,
    after: null,
  };

  it("matches everything when no filters are set", () => {
    expect(matchesFilters(base, {})).toBe(true);
  });

  it("filters by resource type", () => {
    expect(matchesFilters(base, { resourceType: "plan" })).toBe(true);
    expect(matchesFilters(base, { resourceType: "feature_flag" })).toBe(false);
  });

  it("filters by severity", () => {
    expect(matchesFilters(base, { severity: "high" })).toBe(true);
    expect(matchesFilters(base, { severity: "normal" })).toBe(false);
  });

  it("filters by actor", () => {
    expect(matchesFilters(base, { actorId: "user-a" })).toBe(true);
    expect(matchesFilters(base, { actorId: "user-b" })).toBe(false);
  });

  it("filters by action", () => {
    expect(matchesFilters(base, { action: "updated" })).toBe(true);
    expect(matchesFilters(base, { action: "deleted" })).toBe(false);
  });

  it("filters by date range (inclusive)", () => {
    expect(matchesFilters(base, { dateFrom: "2026-09-01T00:00:00.000Z" })).toBe(true);
    expect(matchesFilters(base, { dateFrom: "2026-09-11T00:00:00.000Z" })).toBe(false);
    expect(matchesFilters(base, { dateTo: "2026-09-30T00:00:00.000Z" })).toBe(true);
    expect(matchesFilters(base, { dateTo: "2026-09-01T00:00:00.000Z" })).toBe(false);
  });
});

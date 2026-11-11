import type { ModuleManifest } from "@cofounderai/module-registry";

/**
 * module-fsm's own self-description (F-1; repo-structure convention in the root
 * CLAUDE.md: "packages/module-<key>/src/manifest.ts"). Mirrors the "fsm" entry
 * `packages/module-registry/src/index.ts` declares by hand -- that entry's own
 * `name: "Service"` is what puts every FSM screen under one "Service" module menu in
 * the platform nav (per this story's own explicit requirement), not a top-level "FSM"
 * label. `moduleRegistry` can't import this file back (lint:boundaries: core/
 * module-registry may not depend on any module), so the two stay hand-kept in sync
 * rather than one importing the other.
 */
export const fsmManifest: ModuleManifest = {
  key: "fsm",
  name: "Service",
  icon: "Wrench",
  routePrefix: "/service",
  nav: [
    // PLATFORM-NAV-P0-01.1 (owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive"):
    // the pages used every day come first with no heading, so they are one click away; the rest fold under a few
    // named groups. Every page keeps its path; only where its link sits changed.
    {
      items: [
        { label: "Dashboard", slug: "", icon: "LayoutDashboard" },
        { label: "Jobs", slug: "jobs", icon: "Briefcase" },
        { label: "Schedule", slug: "schedule", icon: "CalendarDays" },
        { label: "My Day", slug: "my-day", icon: "Smartphone" },
        { label: "Customers", slug: "customers", icon: "Users" },
        { label: "Invoices", slug: "invoices", icon: "FileText" },
      ],
    },
    {
      heading: "More",
      items: [
        { label: "Opportunities", slug: "opportunities", icon: "Target" },
        { label: "Reports", slug: "reports", icon: "BarChart3" },
        { label: "Settings", slug: "settings", icon: "Settings" },
      ],
    },
  ],
  features: [
    "Opportunity-to-job pipeline",
    "Crew scheduling and dispatch calendar",
    "Mobile-friendly field work (time, notes, signatures)",
    "Job invoicing and reporting",
  ],
  permissions: ["fsm.access"],
  optionalPeers: ["discovery", "inventory", "gst", "crm"],
};

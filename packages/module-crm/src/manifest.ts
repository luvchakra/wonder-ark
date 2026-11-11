import type { ModuleManifest } from "@cofounderai/module-registry";

/**
 * module-crm's own self-description (S-1; repo-structure convention in the root
 * CLAUDE.md: "packages/module-<key>/src/manifest.ts"). Mirrors the "crm" entry
 * `packages/module-registry/src/index.ts` declares by hand -- `moduleRegistry` can't
 * import this file back (lint:boundaries: core/module-registry may not depend on any
 * module), so the two stay hand-kept in sync rather than one importing the other, same
 * as module-fsm's/module-inventory's own manifest.ts.
 */
export const crmManifest: ModuleManifest = {
  key: "crm",
  name: "CRM",
  icon: "Inbox",
  routePrefix: "/crm",
  nav: [
    // PLATFORM-NAV-P0-01.3 (owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive"):
    // the pages used every day come first with no heading, so they are one click away; the rest fold under a few
    // named groups. Every page keeps its path; only where its link sits changed.
    {
      items: [
        { label: "Inbox", slug: "", icon: "Inbox" },
        { label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" },
        { label: "Leads", slug: "leads", icon: "Users" },
        { label: "Sales Opportunities", slug: "opportunities", icon: "Target" },
        { label: "Follow-ups", slug: "follow-ups", icon: "ListTodo" },
      ],
    },
    {
      heading: "Insights",
      items: [
        { label: "Analytics", slug: "analytics", icon: "BarChart3" },
        {
          label: "Conversations",
          slug: "conversations",
          icon: "MessageCircle",
        },
        { label: "Reviews", slug: "reviews", icon: "Star" },
        {
          label: "Potential Lost Business",
          slug: "lost-business",
          icon: "AlertTriangle",
        },
        { label: "Reactivation", slug: "reactivation", icon: "RefreshCw" },
        { label: "Exceptions", slug: "exceptions", icon: "ClipboardList" },
      ],
    },
    {
      heading: "Setup",
      items: [
        { label: "Channels", slug: "channels", icon: "Radio" },
        { label: "WhatsApp", slug: "whatsapp", icon: "MessageCircle" },
        { label: "Routing Rules", slug: "routing-rules", icon: "Route" },
      ],
    },
  ],
  features: [
    "Unified inbox across channels",
    "Channel connections",
    "Automated routing rules",
    "Lead lifecycle tracking",
    "Opportunity pipeline",
    "Follow-up queue",
    "Conversation-based unified inbox",
    "WhatsApp Business integration",
    "Potential Lost Business queue",
    "Potential Lost Business dashboard",
    "Google Business Profile review inbox",
  ],
  permissions: ["crm.access"],
  optionalPeers: ["discovery", "fsm", "inventory", "gst"],
};

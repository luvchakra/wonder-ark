/**
 * Static manifest of the platform's licensable modules (story `P-3`,
 * docs/plan/04-CLAUDE-CODE-BACKLOG.md). `apps/web` builds navigation, routes and
 * dashboards from this registry — never from a hardcoded list (00-MASTER-PLAN.md §6).
 *
 * Each module's own package will eventually own its manifest entry (once
 * `packages/module-<key>` exists, per stories P-5/SP-7/F-1/S-1/S-2); until then the
 * five entries are declared here directly.
 */

export type ModuleKey = "discovery" | "inventory" | "fsm" | "crm" | "gst";

export interface ModuleNavItem {
  label: string;
  /** Route segment under the module's own `routePrefix`; "" means the module's root
   * route itself (e.g. fsm's own dashboard at `/fsm`, no extra segment). */
  slug: string;
  /** lucide-react icon name; resolved to a component where it's rendered, not here. */
  icon: string;
}

export interface ModuleNavGroup {
  /** Section heading shown above `items`, folded until opened; omitted for a module's
   * everyday pages, which show bare at the top with nothing to open (PLATFORM-NAV-P0-01.1/01.2/01.3/01.4). */
  heading?: string;
  items: ModuleNavItem[];
}

export interface ModuleManifest {
  key: ModuleKey;
  name: string;
  /** lucide-react icon name; resolved to a component where it's rendered, not here. */
  icon: string;
  /** Route segment under apps/web/app/(dashboard)/[businessSlug]/, e.g. "/discovery". */
  routePrefix: string;
  nav: ModuleNavGroup[];
  /** Short, plain-language bullets of what a license for this module actually includes --
   * shown on the licenses settings page so a founder can see what they're buying/keeping
   * without having to click into the module itself. Not exhaustive, not derived from
   * `nav` (nav is a route tree for the sidebar; this is marketing-level, few enough
   * items to read at a glance). */
  features: string[];
  /** Permission keys this module defines, seeded into core.permissions by story C-7. */
  permissions: string[];
  /** Other module keys this module integrates with when both are licensed (soft, per ADR-10). */
  optionalPeers: ModuleKey[];
}

export const moduleRegistry: ModuleManifest[] = [
  {
    key: "discovery",
    name: "Discovery",
    icon: "Target",
    routePrefix: "/discovery",
    // Discovery's real sidebar content is its own business's product list, rendered
    // directly from live data (packages/core/src/components/shell/app-sidebar.tsx),
    // not a static nav tree -- this entry exists only so every module has *a* nav
    // manifest for the shape's other consumers (usage/licenses pages).
    nav: [
      {
        heading: undefined,
        items: [{ label: "Overview", slug: "", icon: "Target" }],
      },
    ],
    features: [
      "AI-generated ideal customer profiles",
      "Prospect discovery and research",
      "CSV/Excel/PDF prospect and catalog import",
      "Outreach conversion tracking",
    ],
    permissions: ["discovery.access"],
    optionalPeers: ["fsm"],
  },
  {
    key: "inventory",
    name: "Inventory",
    icon: "Package",
    routePrefix: "/inventory",
    nav: [
      // PLATFORM-NAV-P0-01.1/01.2/01.3/01.4 (owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive"):
      // the pages used every day come first with no heading, so they are one click away; the rest fold under a few
      // named groups. Every page keeps its path; only where its link sits changed.
      {
        items: [
          { label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" },
          { label: "Products", slug: "products", icon: "Package" },
          { label: "Inventory", slug: "stock", icon: "RefreshCw" },
          { label: "Sales Orders", slug: "sales-orders", icon: "ShoppingCart" },
          {
            label: "Purchase Orders",
            slug: "purchase-orders",
            icon: "ClipboardList",
          },
        ],
      },
      {
        heading: "Sales and purchasing",
        items: [
          { label: "Customers", slug: "customers", icon: "Users" },
          { label: "Sales Invoices", slug: "sales-invoices", icon: "FileText" },
          { label: "Sales Returns", slug: "sales-returns", icon: "RotateCcw" },
          { label: "Suppliers", slug: "suppliers", icon: "Truck" },
        ],
      },
      {
        heading: "More",
        items: [
          { label: "Stock Transfers", slug: "transfers", icon: "Truck" },
          { label: "Warehouses", slug: "warehouses", icon: "Warehouse" },
          { label: "Alerts", slug: "alerts", icon: "Bell" },
          { label: "Audit Log", slug: "audit-log", icon: "History" },
        ],
      },
    ],
    features: [
      "Product catalog and multi-warehouse stock",
      "Purchase orders and supplier management",
      "Sales orders, invoices, and returns",
      "Low-stock alerts and audit log",
    ],
    permissions: ["inventory.access"],
    optionalPeers: ["fsm", "gst"],
  },
  {
    key: "fsm",
    name: "Service",
    icon: "Wrench",
    routePrefix: "/service",
    nav: [
      // PLATFORM-NAV-P0-01.1/01.2/01.3/01.4 (owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive"):
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
  },
  {
    key: "crm",
    name: "CRM",
    icon: "Inbox",
    routePrefix: "/crm",
    nav: [
      // PLATFORM-NAV-P0-01.1/01.2/01.3/01.4 (owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive"):
      // the pages used every day come first with no heading, so they are one click away; the rest fold under a few
      // named groups. Every page keeps its path; only where its link sits changed.
      {
        items: [
          { label: "Inbox", slug: "", icon: "Inbox" },
          { label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" },
          { label: "Leads", slug: "leads", icon: "Users" },
          {
            label: "Sales Opportunities",
            slug: "opportunities",
            icon: "Target",
          },
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
  },
  {
    // Key/schema/routePrefix stay "gst" (CLAUDE.md non-negotiable #1: every
    // module-owned table lives in its own Postgres schema, "gst" among them --
    // renaming the key would mean renaming the schema, every license row's
    // module_key, and the route prefix, none of which this rename asked for).
    // Only the display `name` changes, to "Finance" -- same precedent as fsm's
    // key staying "fsm" while its name is "Service".
    // The module key, database schema and permission namespace all stay "gst" -- only
    // the display name and URL segment become "Finance"/"/finance", since existing
    // licenses, migrations, RLS policies and contracts are all keyed on "gst". The two
    // historical URL spellings (/gst, /compliance) redirect in proxy.ts.
    key: "gst",
    name: "Finance",
    icon: "Landmark",
    routePrefix: "/finance",
    // Finance's full navigation (accounting, reports, reconciliation) lands with the
    // pages themselves, phase by phase -- an entry here renders a real link in the rail,
    // so listing a page before it exists ships a 404 (and fails tests/menu-routes.test.ts,
    // which asserts every nav item resolves to a real page).
    nav: [
      // PLATFORM-NAV-P0-01.1/01.2/01.3/01.4 (owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive"):
      // the pages used every day come first with no heading, so they are one click away; the rest fold under a few
      // named groups. Every page keeps its path; only where its link sits changed.
      {
        items: [
          { label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" },
          { label: "Invoices", slug: "invoices", icon: "FileText" },
          { label: "Bills", slug: "bills", icon: "Receipt" },
          { label: "Expenses", slug: "expenses", icon: "ShoppingCart" },
          { label: "Banking", slug: "banking", icon: "Landmark" },
          { label: "GST Filing", slug: "filing", icon: "ClipboardList" },
        ],
      },
      {
        heading: "Accounting",
        items: [
          { label: "Chart of Accounts", slug: "accounts", icon: "BookOpen" },
          { label: "Journal", slug: "journal", icon: "BookText" },
          { label: "Receivables", slug: "receivables", icon: "HandCoins" },
          { label: "Payables", slug: "payables", icon: "Wallet" },
          { label: "Recurring Entries", slug: "recurring", icon: "Repeat" },
          {
            label: "Accounting Periods",
            slug: "periods",
            icon: "CalendarRange",
          },
          { label: "Budget", slug: "budget", icon: "Target" },
          { label: "Dimensions", slug: "dimensions", icon: "LayoutGrid" },
        ],
      },
      {
        heading: "Tax & GST",
        items: [
          {
            label: "Filing Readiness",
            slug: "filing-readiness",
            icon: "ListChecks",
          },
          { label: "GST Ledger", slug: "gst-ledger", icon: "Receipt" },
          {
            label: "GSTR-2B Reconciliation",
            slug: "reconciliation",
            icon: "ListChecks",
          },
          { label: "e-Invoicing", slug: "einvoicing", icon: "FileText" },
          { label: "e-Way Bill", slug: "eway-bill", icon: "Truck" },
          { label: "GST Profile", slug: "profile", icon: "Receipt" },
          {
            label: "GST Registrations",
            slug: "registrations",
            icon: "Building2",
          },
        ],
      },
      {
        heading: "Reports and records",
        items: [
          { label: "Financial Reports", slug: "reports", icon: "BarChart3" },
          {
            label: "Operational Reports",
            slug: "operational-reports",
            icon: "ClipboardList",
          },
          { label: "Exceptions", slug: "exceptions", icon: "ListChecks" },
          { label: "Evidence", slug: "evidence", icon: "FolderOpen" },
          { label: "Audit Log", slug: "audit-log", icon: "History" },
          { label: "Backfill", slug: "backfill", icon: "History" },
        ],
      },
    ],
    features: [
      "Accounting, ledger and financial reports",
      "GST profile and GSTIN management",
      "e-Way bill generation",
      "e-Invoicing",
      "GST return filing and reconciliation",
    ],
    permissions: ["gst.access"],
    optionalPeers: ["inventory", "fsm"],
  },
];

export function getModule(key: ModuleKey): ModuleManifest | undefined {
  return moduleRegistry.find((module) => module.key === key);
}

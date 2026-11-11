import type { ModuleManifest } from "@cofounderai/module-registry";

/**
 * module-inventory's own self-description (SP-9; repo-structure convention in the root
 * CLAUDE.md: "packages/module-<key>/src/manifest.ts"). Mirrors the "inventory" entry
 * `packages/module-registry/src/index.ts` declares by hand -- `moduleRegistry` can't
 * import this file back (lint:boundaries: core/module-registry may not depend on any
 * module), so the two stay hand-kept in sync rather than one importing the other.
 */
export const inventoryManifest: ModuleManifest = {
  key: "inventory",
  name: "Inventory",
  icon: "Package",
  routePrefix: "/inventory",
  nav: [
    // PLATFORM-NAV-P0-01.2 (owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive"):
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
};

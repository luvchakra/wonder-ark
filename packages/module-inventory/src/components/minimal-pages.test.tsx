/**
 * PLATFORM-NAV-P0-02.2 -- the Inventory pages simplified under CLAUDE.md's "Minimal UI".
 * Pins what is on screen before anything is opened: one primary action per page, one
 * action per row, and where the actions that left the list went.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { DashboardView } = await import("./dashboard/dashboard-view");
const { ProductsList } = await import("./products/products-list");
const { ProductModal } = await import("./products/product-modal");
const { PurchaseOrdersList } = await import("./purchase-orders/purchase-orders-list");
const { PoDetail } = await import("./purchase-orders/po-detail");
const { SalesOrdersList } = await import("./sales-orders/sales-orders-list");

type Props<T> = T extends (props: infer P) => unknown ? P : never;

const buttons = (html: string) =>
  [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const noop = async () => {};

describe("Inventory dashboard", () => {
  const data = {
    productCount: 2,
    stockValue: 1000,
    units: 10,
    reserved: 1,
    incoming: 2,
    available: 9,
    healthy: 1,
    low: 1,
    stockout: 0,
    lowStock: [{ id: "p1", name: "Copper pipe", sku: "CP-1", reorder_point: 5 }],
    pendingPurchases: 0,
    overduePOs: [],
    inTransitTransfers: [],
    alerts: [],
    movementTrend: [],
    gstRiskCount: 0,
    cgstThisMonth: 0,
    sgstThisMonth: 0,
    igstThisMonth: 0,
    gstPayableThisMonth: 0,
    cgstCollectedThisMonth: 0,
    sgstCollectedThisMonth: 0,
    igstCollectedThisMonth: 0,
    gstCollectedThisMonth: 0,
    salesTodayTotal: 0,
    hasGstin: true,
    byWarehouse: [],
  } as Props<typeof DashboardView>["data"];
  const warehouses = [
    { id: "w1", name: "Main" },
    { id: "w2", name: "Depot" },
  ] as NonNullable<Props<typeof DashboardView>["warehouses"]>;
  const html = renderToStaticMarkup(
    <DashboardView businessId="b1" businessName="Acme" data={data} warehouses={warehouses} />,
  );

  it("filters by warehouse with the select alone -- no Apply or Clear button", () => {
    expect(count(html, /<select\b/g)).toBe(1);
    expect(html).toContain("All warehouses");
    expect(buttons(html)).toEqual([]);
  });

  it("drops the Quick links card and opens alerts from the Reorder watchlist", () => {
    expect(html).not.toContain("Quick links");
    expect(html).not.toContain("/inventory/audit-log");
    expect(count(html, /\/inventory\/alerts"/g)).toBe(1);
    expect(html).toContain("All alerts");
  });
});

describe("Products", () => {
  const product = {
    id: "p1",
    sku: "CP-1",
    name: "Copper pipe",
    brand: null,
    category_id: null,
    supplier_id: null,
    cost_price: 10,
    selling_price: 15,
    status: "active",
  } as unknown as Props<typeof ProductsList>["products"][number];
  const props: Props<typeof ProductsList> = {
    products: [product],
    categoryNameById: new Map(),
    supplierNameById: new Map(),
    suppliers: [],
    canEdit: true,
    canViewCost: true,
    createAction: async () => null,
    updateAction: async () => null,
    toggleStatusAction: noop,
    generateBarcodesAction: noop,
    importHref: "/acme/inventory/products/import",
  };
  const html = renderToStaticMarkup(<ProductsList {...props} />);

  it("shows one primary action, with label printing and import under More", () => {
    const texts = buttons(html);
    expect(texts.filter((t) => t === "New product")).toHaveLength(1);
    expect(texts.filter((t) => t === "More")).toHaveLength(1);
    expect(html).not.toContain("Barcode / QR");
    expect(html).not.toContain("/inventory/products/import");
  });

  it("carries one action per row: Edit (card and table), not Activate / Deactivate", () => {
    expect(html).not.toContain("Deactivate");
    expect(count(html, /aria-label="Edit Copper pipe"/g)).toBe(1);
    expect(buttons(html).filter((t) => t === "Edit")).toHaveLength(1);
    // More, New product, the card's Edit and the table row's Edit.
    expect(buttons(html)).toHaveLength(4);
  });

  it("offers nothing to press to someone who cannot edit", () => {
    expect(buttons(renderToStaticMarkup(<ProductsList {...props} canEdit={false} />))).toEqual([]);
  });

  it("moves Activate / Deactivate into the dialog Edit opens, never onto a new product", () => {
    const modal = (extra: Partial<Props<typeof ProductModal>>) =>
      buttons(renderToStaticMarkup(<ProductModal action={async () => null} suppliers={[]} onClose={() => {}} {...extra} />));
    expect(modal({ product, onToggleStatus: noop })).toContain("Deactivate");
    expect(modal({ product: { ...product, status: "inactive" }, onToggleStatus: noop })).toContain("Activate");
    expect(modal({})).not.toContain("Deactivate");
    expect(modal({})).not.toContain("Activate");
  });
});

describe("Purchase orders", () => {
  const order = (status: string) =>
    ({
      id: `po-${status}`,
      po_number: `PO-${status}`,
      supplier_name: "Steelco",
      warehouse_name: "Main",
      order_date: "2026-11-01",
      total_amount: 500,
      subtotal: 500,
      status,
    }) as unknown as Props<typeof PurchaseOrdersList>["purchaseOrders"][number];
  const props: Props<typeof PurchaseOrdersList> = {
    purchaseOrders: [order("draft"), order("approved")],
    suppliers: [],
    warehouses: [],
    products: [],
    canEdit: true,
    canApprove: true,
    canReceive: true,
    createAction: async () => null,
    updateAction: async () => null,
    setStatusAction: noop,
    receiveItemAction: noop,
    fetchItems: async () => [],
  };
  const html = renderToStaticMarkup(<PurchaseOrdersList {...props} />);

  it("carries one action per row: View", () => {
    const texts = buttons(html);
    // Two orders, each once as a card and once as a table row.
    expect(texts.filter((t) => t === "View")).toHaveLength(4);
    expect(texts.filter((t) => t === "New purchase order")).toHaveLength(1);
    expect(texts).toHaveLength(5);
    for (const gone of ["Edit", "Approve", "Mark as sent"]) expect(texts).not.toContain(gone);
  });

  it("keeps Edit and the next step in the order View opens", () => {
    const detail = (extra: Partial<Props<typeof PoDetail>>) =>
      buttons(
        renderToStaticMarkup(
          <PoDetail
            purchaseOrder={order("draft")}
            items={[]}
            canReceive
            primaryLabel="Approve"
            onReceive={() => {}}
            onPrimaryAction={() => {}}
            onClose={() => {}}
            {...extra}
          />,
        ),
      );
    expect(detail({ onEdit: () => {} })).toEqual(expect.arrayContaining(["Edit", "Approve"]));
    expect(detail({})).not.toContain("Edit");
    expect(detail({ primaryLabel: null })).not.toContain("Approve");
  });
});

describe("Sales orders", () => {
  const order = {
    id: "so1",
    so_number: "SO-1",
    customer_name: "Acme Traders",
    warehouse_name: "Main",
    order_date: "2026-11-01",
    total_amount: 900,
    status: "draft",
  } as unknown as Props<typeof SalesOrdersList>["salesOrders"][number];
  const props: Props<typeof SalesOrdersList> = {
    businessId: "b1",
    salesOrders: [order],
    customers: [],
    warehouses: [],
    products: [],
    canEdit: true,
    canConfirm: true,
    canShip: true,
    canCancel: true,
    canCreateReturn: true,
    createAction: async () => null,
    updateAction: async () => null,
    setStatusAction: noop,
    confirmAction: noop,
    shipAction: noop,
    cancelAction: noop,
    fetchItems: async () => [],
  };

  it("carries one action per row: View, with the order's next step inside it", () => {
    const texts = buttons(renderToStaticMarkup(<SalesOrdersList {...props} />));
    expect(texts.filter((t) => t === "View")).toHaveLength(2);
    expect(texts.filter((t) => t === "New sales order")).toHaveLength(1);
    expect(texts).toHaveLength(3);
    expect(texts).not.toContain("Confirm order");
  });
});

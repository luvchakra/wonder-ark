# Inventory: Catalog, Purchasing & Stock

Inventory manages your product catalog, warehouses, purchasing, sales orders and stock
levels — one shared inventory per business, however many Discovery offerings sit on top of it.

Last updated: 2026-11-12

## Setup order

Set these up in this order — each later step uses the ones before it:

1. **Warehouses** — create at least one location. Stock levels, purchase orders, sales
   orders and transfers all reference a warehouse.
2. **Suppliers** and **Customers** — the master-data lists. Add suppliers before purchase
   orders and customers before sales orders.
3. **Products** — add them one by one with **New product**, or in bulk from **Products →
   Import**: paste CSV text (with a header row) into the **CSV** box and click **Import**.
   `sku` and `name` are required; optional columns are `brand`, `category`, `supplier`,
   `unit`, `hsn_code`, `tax_rate`, `cost_price`, `selling_price`, `reorder_point`,
   `reorder_quantity`, `barcode` and `description`. `supplier` is matched by name against
   suppliers you've already created. Rows whose SKU is already in your catalog are skipped,
   and the page tells you how many. Import (and the **Import** button) needs the
   permission to edit products.

Import brings in product *masters*, not opening stock. Bring in starting quantities with a
purchase-order receipt or a **Record movement** on the Inventory page.

There's no settings screen for units or numbering: purchase order numbers are generated for
you (`PO-…`), units default to "pcs", and a new product's GST rate defaults to 18% until you
change it. Your business's Finance profile only decides whether tax is split into CGST/SGST
or charged as IGST.

## Day-to-day workflows

- **Products** — the catalog, with Category and Supplier columns. Cost fields are visible
  only to roles that can see costs; editing needs the edit permission. **Edit** on a row
  opens the product, where you can also **Deactivate** or **Activate** it. **More** holds
  **Barcode / QR** label printing (Code 128, EAN-13 or QR code; **Generate & preview**) and
  **Import**.
- **Purchase Orders** — a PO goes Draft → **Approve** → **Mark as sent** → received →
  **Close order**. **View** on a row opens the order, which holds its next step and, for a
  draft, **Edit**. Once approved (or sent), click **Receive** on each line as goods arrive;
  partial receipts are fine. Each line's **GST %** is filled in from the product and can be
  changed; the tax amounts are calculated for you. **Receiving a line is the moment stock
  increases.**
- **Sales Orders** — **Confirm order** → **Start processing** → **Mark as packed** →
  **Ship order** → **Mark as delivered**, each from the order that **View** opens.
  Confirming reserves the stock (and fails if there
  isn't enough); shipping takes it out of stock and releases the reservation. You can cancel
  until the order ships. Confirming and shipping are separate permissions.
- **Sales Invoices** — **New invoice**, pick a confirmed or shipped order, then **Generate
  invoice**. Open an invoice to see its lines and totals, set its payment status (needs the
  invoice-edit permission), or **Record credit note**: full, or partial by **Taxable value**
  with tax credited in proportion and an optional reason. Credit notes need the
  invoice-cancel permission and net off what's payable.
- **Customers** and **Suppliers** — the lists the orders above draw on. Customers are the
  same list Service uses when both are licensed.
- **Inventory** — live stock per warehouse: On hand, Available, Reserved, Damaged, Expired,
  Incoming and In transit. **Record movement** corrects stock outside the PO/SO flow
  (Inbound, Outbound, Adjustment, Reserve, Unreserve, Damage, Expired or Return).
- **Stock Transfers** — move stock between warehouses with an in-transit record:
  **Submit for approval** → **Approve** → **Mark in transit** → **Receive** each line (with
  a Damaged count) → **Complete**. Stock leaves the first warehouse when it goes in transit
  and arrives when it's received. You can cancel until it's received.
- **Sales Returns** — **Create return** against a shipped or delivered order. Tick
  **Restock** for items going back on the shelf (untick it for a credit-only return) and
  **Damaged** for write-offs. **Approve return** is when stock moves and the credit note is
  issued, so the order needs its sales invoice first. Finish with **Mark completed**.
- **Alerts** — low-stock alerts, also in the topbar bell. **Acknowledge**, **Resolve** or
  **Dismiss** each one.
- **Audit Log** — a history of changes.
- **Dashboard** — once you have more than one warehouse, choose one in **Warehouse** to
  filter (it applies as soon as you choose; **All warehouses** clears it):
  - tiles for **Inventory value** (only if your role can see costs), **Available stock**,
    **Reserved stock**, **Incoming stock**, **Stockout risk**, **Pending purchases** and
    **Sales today**;
  - a **Daily brief** with a healthy / low-stock / out-of-stock bar and, when there's GST
    activity this month, **GST this month** (paid on purchases, collected on sales, net
    position) with **View filing**;
  - a **Reorder watchlist** (with **All alerts**) and an **Attention center** (overdue POs,
    transfers in transit, alerts, tax-setup and supplier-GSTIN problems);
  - charts of stock movement over 14 days and, with more than one warehouse, units on hand
    by warehouse.

Lists, the Dashboard and the Audit Log have an **Export** button (CSV or Excel (.xlsx)) that
respects your filters — see [Exporting](/help/getting-started#exporting-your-data).

## Team & permissions

Inventory has no Team page of its own. Access is set for the whole business under **Users &
access** (avatar menu → **Admin** → the business's **Users & access** chip). Three of the
eight built-in roles are for Inventory: **Inventory Manager**, **Procurement Manager** and
**Warehouse Operator**; the **Operations Manager** template also includes it. Open **Roles**
to see what each can do (for example who can approve a PO versus only receive against one),
or create a custom role. Someone whose role has no Inventory permissions doesn't see the
module, even when the business has it licensed.

## How this connects to other modules

- **Service**: field jobs reserve parts when scheduled, use them when the job is completed,
  and release them if it's cancelled. Optional — jobs work without Inventory, they just
  skip material tracking.
- **CRM**: an opportunity can become a sales order without leaving CRM, CRM can follow that
  order's status, and it suggests in-stock substitutes from the same category when
  something is unavailable (matched by Inventory's own data, not guessed by AI). A
  customer's order history appears on their CRM profile.
- The platform's AI assistant gets a summary of your Inventory dashboard but never cost
  data, whatever the asking user's own permissions.

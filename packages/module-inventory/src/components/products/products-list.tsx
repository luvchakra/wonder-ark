"use client";

import { useState } from "react";
import Link from "next/link";
import { Barcode, Package, Pencil, Plus, Upload } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { MoreMenu, MoreMenuItem } from "@cofounderai/core/ui/more-menu";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { inr } from "@cofounderai/core/lib/format";
import { ProductModal, type ProductActionState } from "./product-modal";
import { BarcodeLabelDialog } from "./barcode-label-dialog";
import type { LookupOption, Product } from "../../lib/products/types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/products.tsx `Products`
 * component -- list + create/edit dialog + activate/deactivate + barcode/QR label
 * generation + CSV import, rebuilt as Server Actions (see WarehousesList's docstring for
 * why). Unlike WarehousesList, this one keeps its own compact-card mobile layout below
 * `md` (CLAUDE.md rule #12) -- nine columns is unreadable on a phone. */
export function ProductsList({
  products,
  categoryNameById,
  supplierNameById,
  suppliers,
  canEdit,
  canViewCost,
  createAction,
  updateAction,
  toggleStatusAction,
  generateBarcodesAction,
  importHref,
}: {
  products: Product[];
  categoryNameById: Map<string, string>;
  supplierNameById: Map<string, string>;
  suppliers: LookupOption[];
  canEdit: boolean;
  canViewCost: boolean;
  createAction: (prevState: ProductActionState, formData: FormData) => Promise<ProductActionState>;
  updateAction: (
    productId: string,
    prevState: ProductActionState,
    formData: FormData,
  ) => Promise<ProductActionState>;
  toggleStatusAction: (productId: string, status: "active" | "inactive") => Promise<void>;
  generateBarcodesAction: (productIds: string[]) => Promise<void>;
  importHref: string;
}) {
  const [modalTarget, setModalTarget] = useState<"create" | Product | null>(null);
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* PLATFORM-NAV-P0-02.2: one primary action. Label printing and the CSV import are
          occasional jobs, so they sit under More. */}
      {canEdit ? (
        <div className="flex items-center justify-end gap-2">
          <MoreMenu>
            <MoreMenuItem onSelect={() => setBarcodeDialogOpen(true)}>
              <Barcode className="size-4 text-muted-foreground" aria-hidden="true" />
              Barcode / QR
            </MoreMenuItem>
            <MoreMenuItem asChild>
              <Link href={importHref}>
                <Upload className="size-4 text-muted-foreground" aria-hidden="true" />
                Import
              </Link>
            </MoreMenuItem>
          </MoreMenu>
          <Button size="sm" onClick={() => setModalTarget("create")}>
            <Plus className="size-4" aria-hidden="true" />
            New product
          </Button>
        </div>
      ) : null}

      {products.length === 0 ? (
        <EmptyState icon={Package} message="No products yet. Add your first SKU." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen; nine columns
              (SKU/Name/Brand/Category/Supplier/Cost/Price/Status/Actions) don't fit a
              phone width. */}
          <ul className="divide-y md:hidden">
            {products.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{p.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <Badge variant={p.status === "active" ? "default" : "secondary"} className="shrink-0">
                    {p.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Brand {p.brand ?? "—"}</span>
                  <span>Category {categoryNameById.get(p.category_id ?? "") ?? "—"}</span>
                  <span>Supplier {supplierNameById.get(p.supplier_id ?? "") ?? "—"}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-baseline gap-3">
                    {canViewCost ? (
                      <span className="text-xs text-muted-foreground">
                        Cost {p.cost_price == null ? "—" : inr.format(Number(p.cost_price))}
                      </span>
                    ) : null}
                    <span className="text-base font-semibold">{inr.format(Number(p.selling_price))}</span>
                  </div>
                  {canEdit ? (
                    <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setModalTarget(p)}>
                      <Pencil className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
                {canViewCost ? <TableHead className="text-right">Cost</TableHead> : null}
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.brand ?? "—"}</TableCell>
                  <TableCell>{categoryNameById.get(p.category_id ?? "") ?? "—"}</TableCell>
                  <TableCell>{supplierNameById.get(p.supplier_id ?? "") ?? "—"}</TableCell>
                  {canViewCost ? (
                    <TableCell className="text-right">
                      {p.cost_price == null ? "—" : inr.format(Number(p.cost_price))}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">{inr.format(Number(p.selling_price))}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      {/* One action per row; Activate / Deactivate is in the dialog Edit opens. */}
                      <Button variant="ghost" size="sm" onClick={() => setModalTarget(p)}>
                        <Pencil className="size-4" aria-hidden="true" />
                        Edit
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {modalTarget ? (
        <ProductModal
          action={modalTarget === "create" ? createAction : updateAction.bind(null, modalTarget.id)}
          product={modalTarget === "create" ? undefined : modalTarget}
          categoryName={
            modalTarget === "create" ? undefined : categoryNameById.get(modalTarget.category_id ?? "")
          }
          suppliers={suppliers}
          onToggleStatus={
            modalTarget === "create"
              ? undefined
              : () => toggleStatusAction(modalTarget.id, modalTarget.status === "active" ? "inactive" : "active")
          }
          onClose={() => setModalTarget(null)}
        />
      ) : null}

      <BarcodeLabelDialog
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
        products={products}
        generateAction={generateBarcodesAction}
      />
    </div>
  );
}

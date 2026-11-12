"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { Input } from "@cofounderai/core/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { STAGES, type PurchaseOrder, type PurchaseOrderItem } from "../../lib/purchase-orders/types";
import { inr } from "@cofounderai/core/lib/format";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  pending_approval: "warning",
  approved: "default",
  sent: "default",
  partially_received: "warning",
  received: "success",
  closed: "secondary",
  cancelled: "destructive",
};

function stageIndex(status: string) {
  if (status === "partially_received") return 3;
  if (status === "pending_approval") return 0;
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

/** Ported from stockpilot-ai-ops's purchase-orders.tsx StageStepper + detail-dialog
 * receive table + totals breakdown. */
export function PoDetail({
  purchaseOrder,
  items,
  canReceive,
  primaryLabel,
  onReceive,
  onPrimaryAction,
  onEdit,
  onClose,
}: {
  purchaseOrder: PurchaseOrder;
  items: PurchaseOrderItem[];
  canReceive: boolean;
  primaryLabel: string | null;
  onReceive: (itemId: string, quantity: number) => void;
  onPrimaryAction: () => void;
  /** PLATFORM-NAV-P0-02.2: present only for a draft the user may edit -- the Edit that
   * used to sit on the list row. */
  onEdit?: () => void;
  onClose: () => void;
}) {
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  if (purchaseOrder.status === "cancelled") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <div className="relative w-full max-w-3xl rounded-2xl border bg-popover p-6 shadow-2xl">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="size-5" aria-hidden="true" />
          </button>
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
            This purchase order was cancelled.
          </p>
        </div>
      </div>
    );
  }

  const current = stageIndex(purchaseOrder.status);
  const inProgress = purchaseOrder.status === "partially_received";
  const lastIndex = STAGES.length - 1;
  const canReceiveNow = canReceive && ["sent", "approved", "partially_received"].includes(purchaseOrder.status);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{purchaseOrder.po_number}</h2>
          <Badge variant={STATUS_VARIANT[purchaseOrder.status]}>{purchaseOrder.status.replace("_", " ")}</Badge>
        </div>

        <div className="mt-5 flex items-start">
          {STAGES.map((stage, i) => {
            const complete = i < current || (i === current && i === lastIndex && !inProgress);
            const active = i === current && !complete;
            return (
              <div key={stage.key} className="flex flex-1 items-start last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                      complete ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {complete ? <Check className="size-4" /> : i + 1}
                  </div>
                  <span className={`whitespace-nowrap text-[11px] font-medium ${complete || active ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.label}
                    {active && inProgress ? " (in progress)" : ""}
                  </span>
                </div>
                {i < lastIndex ? <div className={`mt-3.5 h-0.5 flex-1 ${i < current ? "bg-primary" : "bg-border"}`} /> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Supplier</p>
            <p className="font-medium">{purchaseOrder.supplier_name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Warehouse</p>
            <p className="font-medium">{purchaseOrder.warehouse_name}</p>
          </div>
          {purchaseOrder.notes ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="font-medium">{purchaseOrder.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">GST</TableHead>
                {canReceiveNow ? <TableHead className="text-right">Receive</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const remaining = item.quantity - item.received_quantity;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.item_name} <span className="text-muted-foreground">({item.item_sku ?? "no SKU"})</span>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{item.received_quantity}</TableCell>
                    <TableCell className="text-right">{inr.format(item.unit_cost)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{item.tax_rate}%</TableCell>
                    {canReceiveNow ? (
                      <TableCell className="text-right">
                        {remaining <= 0 ? (
                          <span className="text-xs text-muted-foreground">Complete</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={remaining}
                              step="0.01"
                              className="h-8 w-20"
                              placeholder={String(remaining)}
                              value={receiveQty[item.id] ?? ""}
                              onChange={(e) => setReceiveQty((q) => ({ ...q, [item.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                const qty = Number(receiveQty[item.id] || remaining);
                                if (qty > 0) {
                                  onReceive(item.id, qty);
                                  setReceiveQty((q) => ({ ...q, [item.id]: "" }));
                                }
                              }}
                            >
                              Receive
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 space-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{inr.format(purchaseOrder.subtotal)}</span>
          </div>
          {purchaseOrder.igst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>IGST</span>
              <span>{inr.format(purchaseOrder.igst_amount)}</span>
            </div>
          ) : null}
          {purchaseOrder.cgst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>CGST</span>
              <span>{inr.format(purchaseOrder.cgst_amount)}</span>
            </div>
          ) : null}
          {purchaseOrder.sgst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>SGST</span>
              <span>{inr.format(purchaseOrder.sgst_amount)}</span>
            </div>
          ) : null}
          {purchaseOrder.shipping_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{inr.format(purchaseOrder.shipping_amount)}</span>
            </div>
          ) : null}
          {purchaseOrder.discount_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{inr.format(purchaseOrder.discount_amount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span>{inr.format(purchaseOrder.total_amount)}</span>
          </div>
        </div>

        {primaryLabel || onEdit ? (
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            {onEdit ? (
              <Button size="lg" variant="outline" onClick={onEdit}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Button>
            ) : null}
            {primaryLabel ? (
              <Button size="lg" onClick={onPrimaryAction}>
                {primaryLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

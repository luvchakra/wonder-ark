"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { PoForm, type PoActionState } from "./po-form";
import { PoDetail } from "./po-detail";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import {
  primaryAction,
  type LookupOption,
  type ProductOption,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type SupplierOption,
} from "../../lib/purchase-orders/types";

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

/** Ported from stockpilot-ai-ops's routes/_authenticated/purchase-orders.tsx
 * `PurchaseOrders` component. draft->approved and approved->sent are the approval step
 * (purchase_orders.approve); received->closed is the receiving side's own wrap-up, so
 * either permission covers it -- matches the original's own canPrimaryAction split. */
export function PurchaseOrdersList({
  purchaseOrders,
  suppliers,
  warehouses,
  products,
  canEdit,
  canApprove,
  canReceive,
  createAction,
  updateAction,
  setStatusAction,
  receiveItemAction,
  fetchItems,
}: {
  purchaseOrders: PurchaseOrder[];
  suppliers: SupplierOption[];
  warehouses: LookupOption[];
  products: ProductOption[];
  canEdit: boolean;
  canApprove: boolean;
  canReceive: boolean;
  createAction: (prevState: PoActionState, formData: FormData) => Promise<PoActionState>;
  updateAction: (poId: string, prevState: PoActionState, formData: FormData) => Promise<PoActionState>;
  setStatusAction: (poId: string, status: string) => Promise<void>;
  receiveItemAction: (itemId: string, quantity: number) => Promise<void>;
  fetchItems: (poId: string) => Promise<PurchaseOrderItem[]>;
}) {
  const [formTarget, setFormTarget] = useState<"create" | PurchaseOrder | null>(null);
  const [detailTarget, setDetailTarget] = useState<PurchaseOrder | null>(null);
  const [detailItems, setDetailItems] = useState<PurchaseOrderItem[]>([]);
  const [formItems, setFormItems] = useState<PurchaseOrderItem[]>([]);
  const [, startTransition] = useTransition();

  const canPrimaryAction = (status: string) => {
    if (status === "draft" || status === "approved") return canApprove;
    if (status === "received") return canApprove || canReceive;
    return false;
  };

  const openDetail = async (po: PurchaseOrder) => {
    setDetailTarget(po);
    setDetailItems(await fetchItems(po.id));
  };

  const openEdit = async (po: PurchaseOrder) => {
    setFormItems(await fetchItems(po.id));
    setFormTarget(po);
  };

  const runPrimaryAction = (po: PurchaseOrder) => {
    const action = primaryAction(po.status);
    if (!action) return;
    startTransition(async () => {
      try {
        await setStatusAction(po.id, action.next);
        if (detailTarget?.id === po.id) await openDetail(po);
        toast.success(`${po.po_number}: ${action.label.toLowerCase()} succeeded.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Could not ${action.label.toLowerCase()} ${po.po_number}.`,
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setFormItems([]); setFormTarget("create"); }}>
            <Plus className="size-4" aria-hidden="true" />
            New purchase order
          </Button>
        </div>
      ) : null}

      {purchaseOrders.length === 0 ? (
        <EmptyState icon={ClipboardList} message="No purchase orders yet. Create your first one to start receiving stock." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen. */}
          <ul className="divide-y md:hidden">
            {purchaseOrders.map((po) => (
              <li key={po.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{po.po_number}</p>
                    <p className="font-medium break-words">{po.supplier_name}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[po.status]} className="shrink-0">
                    {po.status.replace("_", " ")}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Warehouse {po.warehouse_name}</span>
                  <span>Ordered {formatDate(po.order_date)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">{inr.format(po.total_amount)}</span>
                  <Button variant="outline" size="sm" onClick={() => openDetail(po)}>
                    View
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>PO number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Order date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono text-xs">{po.po_number}</TableCell>
                  <TableCell className="font-medium">{po.supplier_name}</TableCell>
                  <TableCell>{po.warehouse_name}</TableCell>
                  <TableCell>{formatDate(po.order_date)}</TableCell>
                  <TableCell className="text-right">{inr.format(po.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[po.status]}>{po.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {/* PLATFORM-NAV-P0-02.2: one action per row. Edit (drafts) and the
                        order's next step are in the order View opens. */}
                    <Button variant="outline" size="sm" onClick={() => openDetail(po)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {formTarget ? (
        <PoForm
          action={formTarget === "create" ? createAction : updateAction.bind(null, formTarget.id)}
          suppliers={suppliers}
          warehouses={warehouses}
          products={products}
          purchaseOrder={formTarget === "create" ? undefined : formTarget}
          items={formTarget === "create" ? undefined : formItems}
          onClose={() => setFormTarget(null)}
        />
      ) : null}

      {detailTarget
        ? (() => {
            const current = purchaseOrders.find((p) => p.id === detailTarget.id) ?? detailTarget;
            const action = primaryAction(current.status);
            return (
              <PoDetail
                purchaseOrder={current}
                items={detailItems}
                canReceive={canReceive}
                primaryLabel={action && canPrimaryAction(current.status) ? action.label : null}
                onReceive={(itemId, quantity) =>
                  startTransition(async () => {
                    try {
                      await receiveItemAction(itemId, quantity);
                      await openDetail(current);
                      toast.success("Item received.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not receive item.");
                    }
                  })
                }
                onPrimaryAction={() => runPrimaryAction(current)}
                onEdit={
                  current.status === "draft" && canEdit
                    ? () => {
                        setDetailTarget(null);
                        void openEdit(current);
                      }
                    : undefined
                }
                onClose={() => setDetailTarget(null)}
              />
            );
          })()
        : null}
    </div>
  );
}

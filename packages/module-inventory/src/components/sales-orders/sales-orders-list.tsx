"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
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
import { SoForm, type SoActionState } from "./so-form";
import { SoDetail } from "./so-detail";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import {
  CANCELLABLE_STATUSES,
  primaryAction,
  type CustomerOption,
  type LookupOption,
  type ProductOption,
  type SalesOrder,
  type SalesOrderItem,
} from "../../lib/sales-orders/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary",
  confirmed: "default",
  processing: "default",
  packed: "default",
  shipped: "default",
  delivered: "success",
  cancelled: "destructive",
  returned: "destructive",
};

/** Ported from stockpilot-ai-ops's routes/_authenticated/sales-orders.tsx
 * `SalesOrders` component. draft->confirmed needs sales_orders.confirm; the fulfillment
 * steps in between (processing/packed) and the final ship are all gated by
 * sales_orders.ship, matching the Warehouse Operator persona (ships orders, doesn't
 * confirm them) -- same split as the original's own canRunPrimaryAction. */
export function SalesOrdersList({
  businessId,
  salesOrders,
  customers,
  warehouses,
  products,
  canEdit,
  canConfirm,
  canShip,
  canCancel,
  canCreateReturn,
  createAction,
  updateAction,
  setStatusAction,
  confirmAction,
  shipAction,
  cancelAction,
  fetchItems,
}: {
  businessId: string;
  salesOrders: SalesOrder[];
  customers: CustomerOption[];
  warehouses: LookupOption[];
  products: ProductOption[];
  canEdit: boolean;
  canConfirm: boolean;
  canShip: boolean;
  canCancel: boolean;
  canCreateReturn: boolean;
  createAction: (prevState: SoActionState, formData: FormData) => Promise<SoActionState>;
  updateAction: (soId: string, prevState: SoActionState, formData: FormData) => Promise<SoActionState>;
  setStatusAction: (soId: string, status: string) => Promise<void>;
  confirmAction: (soId: string) => Promise<void>;
  shipAction: (soId: string) => Promise<void>;
  cancelAction: (soId: string) => Promise<void>;
  fetchItems: (soId: string) => Promise<SalesOrderItem[]>;
}) {
  const router = useRouter();
  const [formTarget, setFormTarget] = useState<"create" | SalesOrder | null>(null);
  const [detailTarget, setDetailTarget] = useState<SalesOrder | null>(null);
  const [detailItems, setDetailItems] = useState<SalesOrderItem[]>([]);
  const [formItems, setFormItems] = useState<SalesOrderItem[]>([]);
  const [, startTransition] = useTransition();

  const canRunPrimaryAction = (status: string) => {
    const action = primaryAction(status as SalesOrder["status"]);
    if (!action) return false;
    if (action.kind === "confirm") return canConfirm;
    return canShip;
  };

  const openDetail = async (so: SalesOrder) => {
    setDetailTarget(so);
    setDetailItems(await fetchItems(so.id));
  };

  const openEdit = async (so: SalesOrder) => {
    setFormItems(await fetchItems(so.id));
    setFormTarget(so);
  };

  const runPrimaryAction = (so: SalesOrder) => {
    const action = primaryAction(so.status);
    if (!action) return;
    startTransition(async () => {
      try {
        if (action.kind === "confirm") await confirmAction(so.id);
        else if (action.kind === "ship") await shipAction(so.id);
        else await setStatusAction(so.id, action.next);
        if (detailTarget?.id === so.id) await openDetail(so);
        toast.success(`${so.so_number}: ${action.label.toLowerCase()} succeeded.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Could not ${action.label.toLowerCase()} ${so.so_number}.`,
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setFormItems([]); setFormTarget("create"); }}>
            New sales order
          </Button>
        </div>
      ) : null}

      {salesOrders.length === 0 ? (
        <EmptyState icon={Receipt} message="No sales orders yet. Create your first one to record a sale." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen. */}
          <ul className="divide-y md:hidden">
            {salesOrders.map((so) => (
              <li key={so.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{so.so_number}</p>
                    <p className="font-medium break-words">{so.customer_name}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[so.status]} className="shrink-0">
                    {so.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Warehouse {so.warehouse_name}</span>
                  <span>Ordered {formatDate(so.order_date)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">{inr.format(so.total_amount)}</span>
                  <Button variant="outline" size="sm" onClick={() => openDetail(so)}>
                    View
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>SO number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Order date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesOrders.map((so) => (
                <TableRow key={so.id}>
                  <TableCell className="font-mono text-xs">{so.so_number}</TableCell>
                  <TableCell className="font-medium">{so.customer_name}</TableCell>
                  <TableCell>{so.warehouse_name}</TableCell>
                  <TableCell>{formatDate(so.order_date)}</TableCell>
                  <TableCell className="text-right">{inr.format(so.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[so.status]}>{so.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {/* PLATFORM-NAV-P0-02.2: one action per row. Confirm, ship, edit, cancel
                        and return are in the order View opens. */}
                    <Button variant="outline" size="sm" onClick={() => openDetail(so)}>
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
        <SoForm
          action={formTarget === "create" ? createAction : updateAction.bind(null, formTarget.id)}
          customers={customers}
          warehouses={warehouses}
          products={products}
          salesOrder={formTarget === "create" ? undefined : formTarget}
          items={formTarget === "create" ? undefined : formItems}
          onClose={() => setFormTarget(null)}
        />
      ) : null}

      {detailTarget
        ? (() => {
            const current = salesOrders.find((s) => s.id === detailTarget.id) ?? detailTarget;
            const action = primaryAction(current.status);
            return (
              <SoDetail
                salesOrder={current}
                items={detailItems}
                canCancel={canCancel && CANCELLABLE_STATUSES.has(current.status)}
                canCreateReturn={canCreateReturn}
                primaryLabel={action && canRunPrimaryAction(current.status) ? action.label : null}
                onCancel={() =>
                  startTransition(async () => {
                    try {
                      await cancelAction(current.id);
                      setDetailTarget(null);
                      toast.success(`${current.so_number} cancelled.`);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : `Could not cancel ${current.so_number}.`);
                    }
                  })
                }
                onCreateReturn={() =>
                  router.push(`/dashboard/businesses/${businessId}/inventory/sales-returns?so=${current.id}`)
                }
                onPrimaryAction={() => runPrimaryAction(current)}
                onClose={() => setDetailTarget(null)}
              />
            );
          })()
        : null}
    </div>
  );
}

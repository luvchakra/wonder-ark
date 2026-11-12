"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileWarning,
  IndianRupee,
  Package,
  PackageCheck,
  Receipt,
  Repeat,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Badge } from "@cofounderai/core/ui/badge";
import { Label } from "@cofounderai/core/ui/label";
import { AutoSubmitSelect } from "@cofounderai/core/ui/auto-submit-select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@cofounderai/core/ui/chart";
import { formatDate, inr, num } from "@cofounderai/core/lib/format";
import { cn } from "@cofounderai/core/lib/utils";
import type { DashboardSummary } from "../../lib/dashboard/types";
import type { Warehouse } from "../../lib/warehouses/types";

const movementsChartConfig = {
  increase: { label: "Stock in", color: "var(--primary)" },
  decrease: { label: "Stock out", color: "var(--chart-3)" },
} satisfies ChartConfig;

const warehouseChartConfig = {
  units: { label: "Units on hand", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Ported from stockpilot-ai-ops's routes/_authenticated/dashboard.tsx `Dashboard`
 * component -- data is fetched server-side (lib/dashboard/queries.ts's
 * getDashboardSummary) and passed in as `data` instead of a client-side react-query
 * fetch, since this codebase's pages are Server Components. Links point at this
 * platform's own business-scoped routes (GST module's own pages, not stockpilot's
 * `/account`/`/gst-filing`).
 */
export function DashboardView({
  businessId,
  businessName,
  data,
  warehouses = [],
  selectedWarehouseId,
}: {
  businessId: string;
  businessName: string;
  data: DashboardSummary;
  /** All warehouses on this business -- powers the filter dropdown below. Optional so
   * existing callers/tests that don't care about the warehouse slice keep working. */
  warehouses?: Warehouse[];
  selectedWarehouseId?: string;
}) {
  const gstPath = `/dashboard/businesses/${businessId}/finance`;
  const inventoryPath = `/dashboard/businesses/${businessId}/inventory`;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* PLATFORM-NAV-P0-02.2: the warehouse filter is the only control above the
          figures. Choosing a warehouse applies it; "All warehouses" clears it, so the
          Apply and Clear buttons are gone. The "Quick links" card went too: Products and
          Audit log are in the menu, and low-stock alerts open from the Reorder watchlist
          card, where the items that need reordering are listed. */}
      {warehouses.length > 1 ? (
        <form method="get" className="flex w-fit flex-col gap-1.5">
          <Label htmlFor="warehouse">Warehouse</Label>
          <AutoSubmitSelect id="warehouse" name="warehouse" defaultValue={selectedWarehouseId ?? ""}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </form>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        {data.stockValue !== null ? (
          <Kpi label="Inventory value" value={inr.format(data.stockValue)} icon={<IndianRupee className="size-4 text-primary" />} />
        ) : null}
        <Kpi label="Available stock" value={num.format(data.available)} icon={<Package className="size-4 text-primary" />} />
        <Kpi label="Reserved stock" value={num.format(data.reserved)} icon={<PackageCheck className="size-4 text-primary" />} />
        <Kpi label="Incoming stock" value={num.format(data.incoming)} icon={<Truck className="size-4 text-primary" />} />
        <Kpi
          label="Stockout risk"
          value={num.format(data.stockout + data.low)}
          icon={<TrendingDown className="size-4 text-warning" />}
        />
        <Kpi label="Pending purchases" value={num.format(data.pendingPurchases)} icon={<ShoppingCart className="size-4 text-warning" />} />
        {/* 6 KPIs above are always evenly divisible by every column count this grid uses
            (2/3/6), so they never leave a row half-filled. This 7th one only renders when
            stockValue is known, making the total odd -- `col-span-full` (rather than a
            fixed span) fills whichever row it lands in at any of those breakpoints, instead
            of sitting orphaned at one column's width like the full-width cards below it. */}
        <Kpi
          label="Sales today"
          value={inr.format(data.salesTodayTotal)}
          icon={<TrendingUp className="size-4 text-primary" />}
          className={data.stockValue !== null ? "col-span-full" : undefined}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily brief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">{buildBrief(businessName, data)}</p>

          <ProportionalBar
            segments={[
              { key: "healthy", label: "Healthy", value: data.healthy, colorClass: "bg-primary" },
              { key: "low", label: "Low stock", value: data.low, colorClass: "bg-warning" },
              { key: "stockout", label: "Out of stock", value: data.stockout, colorClass: "bg-destructive" },
            ]}
          />

          {data.gstPayableThisMonth > 0 || data.gstCollectedThisMonth > 0 ? (
            <div className="border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">GST this month</p>
                <Link href={`${gstPath}/filing`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View filing <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              </div>
              {/* Paid (ITC on purchases) and collected (output tax on sales) are kept as separate
                  bars rather than netted into one figure -- they're different accounting concepts
                  (a reclaimable credit vs. a liability), and merging them would make an
                  ITC-heavy month look artificially "cheap". The net line below is just a quick
                  cash-flow read, not a substitute for filing each side properly. */}
              {/* Explicit `grid-cols-1` at the base breakpoint, not just `grid` alone --
                  without it, Tailwind emits no `grid-template-columns` below `sm`, so the
                  browser falls back to an implicit single column sized `auto` (not
                  `minmax(0,1fr)`), which lets a wide child (long labels, nowrap segments)
                  blow the column past the viewport instead of being clipped to it. That
                  overflow was invisible as a scrollbar (the shell's own overflow-x-hidden
                  backstop swallows it) but still cut off content at the viewport edge. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {data.gstPayableThisMonth > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Paid on purchases (ITC)</p>
                    <ProportionalBar
                      segments={[
                        { key: "cgst", label: "CGST", value: data.cgstThisMonth, colorClass: "bg-primary", displayValue: inr.format(data.cgstThisMonth) },
                        { key: "sgst", label: "SGST", value: data.sgstThisMonth, colorClass: "bg-chart-3", displayValue: inr.format(data.sgstThisMonth) },
                        { key: "igst", label: "IGST", value: data.igstThisMonth, colorClass: "bg-warning", displayValue: inr.format(data.igstThisMonth) },
                      ]}
                    />
                  </div>
                ) : null}
                {data.gstCollectedThisMonth > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Collected on sales (output tax)</p>
                    <ProportionalBar
                      segments={[
                        { key: "cgst", label: "CGST", value: data.cgstCollectedThisMonth, colorClass: "bg-primary", displayValue: inr.format(data.cgstCollectedThisMonth) },
                        { key: "sgst", label: "SGST", value: data.sgstCollectedThisMonth, colorClass: "bg-chart-3", displayValue: inr.format(data.sgstCollectedThisMonth) },
                        { key: "igst", label: "IGST", value: data.igstCollectedThisMonth, colorClass: "bg-warning", displayValue: inr.format(data.igstCollectedThisMonth) },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
              {data.gstPayableThisMonth > 0 && data.gstCollectedThisMonth > 0 ? (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Net position (collected - paid)</span>
                  <span className="font-medium text-foreground">
                    {inr.format(data.gstCollectedThisMonth - data.gstPayableThisMonth)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <CardTitle className="text-base">Reorder watchlist</CardTitle>
            <Link href={`${inventoryPath}/alerts`} className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
              All alerts <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing below its reorder point. Add products and stock movements to populate this.
              </p>
            ) : (
              data.lowStock.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <Badge variant="outline" className="border-warning/40 text-warning">
                    Reorder {num.format(Number(p.reorder_point))}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Attention center</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.overduePOs.length === 0 &&
            data.inTransitTransfers.length === 0 &&
            data.alerts.length === 0 &&
            data.gstRiskCount === 0 &&
            data.hasGstin ? (
              <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>
            ) : (
              <>
                {!data.hasGstin ? (
                  <Link href={`${gstPath}/profile`} className="flex items-center justify-between gap-3 text-sm hover:underline">
                    <p className="min-w-0 truncate font-medium">Set up your business's GST profile</p>
                    <Badge variant="outline" className="shrink-0 border-warning/40 text-warning">
                      <Receipt className="size-3" aria-hidden="true" />
                      Setup
                    </Badge>
                  </Link>
                ) : null}
                {data.gstRiskCount > 0 ? (
                  <Link href={`${gstPath}/filing`} className="flex items-start justify-between gap-3 text-sm hover:underline">
                    <p className="min-w-0 font-medium">
                      {data.gstRiskCount} purchase{data.gstRiskCount === 1 ? "" : "s"} this month{" "}
                      {data.gstRiskCount === 1 ? "has" : "have"} a missing/invalid supplier GSTIN
                    </p>
                    <Badge variant="destructive" className="mt-0.5 shrink-0">
                      <FileWarning className="size-3" aria-hidden="true" />
                      ITC risk
                    </Badge>
                  </Link>
                ) : null}
                {data.overduePOs.slice(0, 3).map((po) => (
                  <div key={po.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{po.po_number}</p>
                      <p className="text-xs text-muted-foreground">{po.supplier_name}</p>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      <Clock className="size-3" aria-hidden="true" />
                      Overdue
                    </Badge>
                  </div>
                ))}
                {data.inTransitTransfers.slice(0, 3).map((t) => (
                  <Link key={t.id} href={`${inventoryPath}/transfers`} className="flex items-center justify-between gap-3 text-sm hover:underline">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.transfer_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.source_warehouse_name} &rarr; {t.destination_warehouse_name}
                      </p>
                    </div>
                    <Badge className="shrink-0">
                      <Repeat className="size-3" aria-hidden="true" />
                      In transit
                    </Badge>
                  </Link>
                ))}
                {data.alerts.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <p className="min-w-0 truncate font-medium">{a.title}</p>
                    <Badge variant={a.severity === "critical" ? "destructive" : "outline"} className="shrink-0">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {a.severity}
                    </Badge>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stock movement (14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.movementTrend.every((d) => d.increase === 0 && d.decrease === 0) ? (
              <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
            ) : (
              <ChartContainer config={movementsChartConfig} className="aspect-auto h-[160px] w-full">
                <BarChart data={data.movementTrend} barGap={2} margin={{ left: -20 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval={2} tickMargin={6} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => (payload?.[0]?.payload ? formatDate(payload[0].payload.day) : "")}
                      />
                    }
                  />
                  <Bar dataKey="increase" fill="var(--color-increase)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="decrease" fill="var(--color-decrease)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" /> Stock in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-3" /> Stock out
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.byWarehouse.length > 1 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Units on hand by warehouse</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={warehouseChartConfig} className="aspect-auto h-[160px] w-full">
              <BarChart data={data.byWarehouse} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={110} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="units" fill="var(--color-units)" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ProportionalBar({
  segments,
}: {
  segments: { key: string; label: string; value: number; colorClass: string; displayValue?: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {total === 0
          ? null
          : visible.map((s) => (
              <div key={s.key} className={cn("h-full rounded-[2px]", s.colorClass)} style={{ flexGrow: s.value, flexBasis: 0 }} />
            ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("size-2 shrink-0 rounded-full", s.colorClass)} />
            {s.label}: <span className="font-medium text-foreground">{s.displayValue ?? s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function buildBrief(
  businessName: string,
  data: {
    stockValue: number | null;
    productCount: number;
    stockout: number;
    low: number;
    pendingPurchases: number;
    overduePOs: unknown[];
    alerts: unknown[];
    gstPayableThisMonth: number;
    gstCollectedThisMonth: number;
  },
): string {
  const parts: string[] = [
    data.stockValue !== null
      ? `${businessName}'s inventory is worth ${inr.format(data.stockValue)} across ${num.format(data.productCount)} products.`
      : `${businessName} has ${num.format(data.productCount)} products in its catalogue.`,
  ];
  if (data.stockout > 0 || data.low > 0) {
    parts.push(
      `${num.format(data.stockout)} ${data.stockout === 1 ? "is" : "are"} out of stock and ${num.format(data.low)} ${data.low === 1 ? "is" : "are"} below reorder point.`,
    );
  } else {
    parts.push("Stock levels are healthy across the board.");
  }
  if (data.pendingPurchases > 0) {
    parts.push(
      `${num.format(data.pendingPurchases)} purchase order${data.pendingPurchases === 1 ? " is" : "s are"} awaiting delivery${
        data.overduePOs.length > 0 ? `, including ${num.format(data.overduePOs.length)} overdue` : ""
      }.`,
    );
  }
  if (data.alerts.length > 0) {
    parts.push(`${num.format(data.alerts.length)} open alert${data.alerts.length === 1 ? "" : "s"} need attention.`);
  }
  if (data.gstPayableThisMonth > 0) {
    parts.push(`GST paid on purchases this month so far: ${inr.format(data.gstPayableThisMonth)}.`);
  }
  if (data.gstCollectedThisMonth > 0) {
    parts.push(`GST collected on sales this month so far: ${inr.format(data.gstCollectedThisMonth)}.`);
  }
  return parts.join(" ");
}

function Kpi({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-3.5 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
          {icon}
        </div>
        <p className="mt-2 text-lg font-bold tracking-tight sm:text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}

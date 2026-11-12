import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { Badge } from "@cofounderai/core/ui/badge";
import { BreakdownBars } from "@cofounderai/core/ui/breakdown-bars";
import { formatDate, formatDateTime, inr } from "@cofounderai/core/lib/format";
import {
  buildJobStatusBreakdown,
  buildRevenueTrend,
  computeOpportunityWinRate,
  computeOutstanding,
  computeRevenueThisMonth,
} from "../../lib/dashboard/aggregate";
import { RevenueTrendChart } from "./revenue-trend-chart";
import type { DispatcherDashboard } from "../../lib/dashboard/types";

/**
 * `/fsm`'s own dispatcher dashboard (PRD §5) -- the five action-queue widget cards
 * below, unchanged, each linking through to the fuller page that actually manages that
 * data (Schedule, Jobs, Invoices, Opportunities), PLUS a metrics/visual layer on top
 * (KPIs, revenue trend, job-status mix) and a schedule-range filter. The queue cards
 * stay the dispatcher's morning action list; the layer added here is a separate,
 * additional read of the same underlying data, matching what discovery's and
 * inventory's own dashboards already do.
 */
export function DispatcherDashboardView({
  businessId,
  data,
  range = "today",
}: {
  businessId: string;
  data: DispatcherDashboard;
  range?: "today" | "week";
}) {
  const base = `/dashboard/businesses/${businessId}/fsm`;
  const openJobs = data.jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled").length;
  const revenueThisMonth = computeRevenueThisMonth(data.invoices);
  const outstanding = computeOutstanding(data.invoices);
  const winRate = computeOpportunityWinRate(data.opportunities);
  const jobStatusBreakdown = buildJobStatusBreakdown(data.jobs);
  const revenueTrend = buildRevenueTrend(data.invoices);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {/* PLATFORM-NAV-P0-02.1: the range switch is the only control up here. The three
          buttons that sat beside it ("New opportunity", "New job", "Schedule") only opened
          the list pages the menu and each card's "View all" already open. */}
      <div className="flex w-fit gap-1 rounded-md border p-1 text-sm">
        <Link
          href={`${base}?range=today`}
          aria-current={range === "today" ? "true" : undefined}
          className={range === "today" ? "rounded-sm bg-accent px-3 py-1 font-medium" : "rounded-sm px-3 py-1 text-muted-foreground hover:bg-accent/60"}
        >
          Today
        </Link>
        <Link
          href={`${base}?range=week`}
          aria-current={range === "week" ? "true" : undefined}
          className={range === "week" ? "rounded-sm bg-accent px-3 py-1 font-medium" : "rounded-sm px-3 py-1 text-muted-foreground hover:bg-accent/60"}
        >
          This week
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open jobs" value={openJobs} detail={`${data.jobsInProgress.length} in progress`} />
        <StatCard label="Revenue (month)" value={inr.format(revenueThisMonth)} />
        <StatCard label="Outstanding" value={inr.format(outstanding)} detail={`${data.overdueInvoices.length} overdue`} />
        <StatCard label="Win rate" value={winRate === null ? "--" : `${winRate}%`} detail="won / (won + lost)" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invoiced (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={revenueTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs by status</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={jobStatusBreakdown} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            {range === "week" ? "This week's schedule" : "Today's schedule"}
            <Badge variant="secondary">{data.todaysEvents.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.todaysEvents.length === 0 ? (
            <EmptyState label="Nothing scheduled for today." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.todaysEvents.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {e.subject_label} -- {e.party_name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatDateTime(e.starts_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/schedule`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Unassigned queue
            <Badge variant="secondary">{data.unassignedJobs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.unassignedJobs.length === 0 ? (
            <EmptyState label="No unscheduled jobs." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.unassignedJobs.slice(0, 6).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {j.number ?? "Job"} -- {j.party_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/jobs`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Jobs in progress
            <Badge variant="secondary">{data.jobsInProgress.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.jobsInProgress.length === 0 ? (
            <EmptyState label="No jobs in progress right now." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.jobsInProgress.slice(0, 6).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {j.number ?? "Job"} -- {j.party_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/jobs`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Overdue invoices
            <Badge variant={data.overdueInvoices.length > 0 ? "destructive" : "secondary"}>{data.overdueInvoices.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.overdueInvoices.length === 0 ? (
            <EmptyState label="Nothing overdue." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.overdueInvoices.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {i.number ?? "Invoice"} -- {i.party_name}
                  </span>
                  <span className="shrink-0 font-medium text-destructive">{inr.format(i.balance_amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/invoices`} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Estimates awaiting response
            <Badge variant="secondary">{data.estimatesAwaitingResponse.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.estimatesAwaitingResponse.length === 0 ? (
            <EmptyState label="No estimates waiting on a customer." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.estimatesAwaitingResponse.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {o.number ?? "Opportunity"} -- {o.party_name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">sent {formatDate(o.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/opportunities`} />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

function ViewAllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
      View all →
    </Link>
  );
}

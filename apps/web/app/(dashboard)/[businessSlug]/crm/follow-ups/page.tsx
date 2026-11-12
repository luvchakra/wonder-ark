import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listFollowUpQueue } from "@cofounderai/module-crm/lib/follow-ups/queries";
import { listEmployeeOptions } from "@cofounderai/module-crm/lib/tickets/queries";
import { applyFollowUpQueueFilters } from "@cofounderai/module-crm/lib/follow-ups/queue";
import type { FollowUpQueueView } from "@cofounderai/module-crm/lib/follow-ups/queue";
import { formatDate } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Label } from "@cofounderai/core/ui/label";
import { AutoSubmitSelect } from "@cofounderai/core/ui/auto-submit-select";
import { Fold } from "@cofounderai/core/ui/fold";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { CheckCircle2, ListTodo } from "lucide-react";
import { completeFollowUpAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

const VIEWS: { key: FollowUpQueueView; label: string }[] = [
  { key: "all", label: "All" },
  { key: "due_today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "unassigned", label: "Unassigned" },
  { key: "high_priority", label: "High priority" },
];

/**
 * CRM-05.3's Follow-up Queue -- one screen across every lead/opportunity/conversation's
 * follow-ups (not per-entity, unlike the Opportunity detail page's own Follow-ups
 * section), with the backlog's exact five views as tabs (`?view=`) and owner/source/
 * channel/priority filters (a GET form, same pattern the platform dashboard's own
 * business/product/industry filter already uses) layered on top. "Actionable from one
 * screen" is the inline Complete button per row -- no navigating away to act on an item.
 */
export default async function CrmFollowUpsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ view?: string; ownerId?: string; source?: string; channel?: string; priority?: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const search = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [queue, employees] = await Promise.all([listFollowUpQueue(businessId), listEmployeeOptions(businessId)]);
  const view = (VIEWS.find((v) => v.key === search.view)?.key ?? "all") as FollowUpQueueView;
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const sources = [...new Set(queue.map((r) => r.source).filter((s): s is string => Boolean(s)))].sort();
  const channels = [...new Set(queue.map((r) => r.channel).filter((c): c is string => Boolean(c)))].sort();

  const rows = applyFollowUpQueueFilters(
    queue,
    {
      view,
      ownerId: search.ownerId || undefined,
      source: search.source || undefined,
      channel: search.channel || undefined,
      priority: (search.priority as "low" | "normal" | "high" | undefined) || undefined,
    },
    new Date(),
  );

  const basePath = `/${businessSlug}/crm/follow-ups`;
  const activeFilterCount = [search.ownerId, search.source, search.channel, search.priority].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const isOverdue = (dueAt: string) => new Date(dueAt).getTime() < todayStart;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Follow-up Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s open follow-ups, one screen for every view.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="crm.follow-ups" businessSlug={businessSlug} params={search} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-1">
        {VIEWS.map((v) => (
          <Button key={v.key} asChild variant={view === v.key ? "secondary" : "ghost"} size="sm">
            <Link href={v.key === "all" ? basePath : `${basePath}?view=${v.key}`}>{v.label}</Link>
          </Button>
        ))}
      </div>

      {/* PLATFORM-NAV-P0-02.3: the six views stay on screen; the four filters sit behind
          one Filters button, which shows how many are in effect and opens on them.
          Choosing a value applies it, so there is no Apply button. */}
      <Fold label="Filters" count={activeFilterCount} defaultOpen={hasActiveFilters}>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="view" value={view} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ownerId">Owner</Label>
            <AutoSubmitSelect id="ownerId" name="ownerId" defaultValue={search.ownerId ?? ""}>
              <option value="">All owners</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name ?? e.email ?? "Unnamed"}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source">Source</Label>
            <AutoSubmitSelect id="source" name="source" defaultValue={search.source ?? ""}>
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel">Channel</Label>
            <AutoSubmitSelect id="channel" name="channel" defaultValue={search.channel ?? ""}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </AutoSubmitSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="priority">Priority</Label>
            <AutoSubmitSelect id="priority" name="priority" defaultValue={search.priority ?? ""}>
              <option value="">All priorities</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </AutoSubmitSelect>
          </div>
          {hasActiveFilters ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={view === "all" ? basePath : `${basePath}?view=${view}`}>Clear filters</Link>
            </Button>
          ) : null}
        </form>
      </Fold>

      {rows.length === 0 ? (
        <EmptyState icon={ListTodo} message="No follow-ups match this view." />
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y divide-border md:hidden">
            {rows.map((row) => {
              const overdue = isOverdue(row.due_at);
              // partyName is the row's identity when there is a real contact; when there
              // isn't (a review- or waitlist-triggered follow-up), reviewSummary/
              // productInterestSummary carry the only explanation of what this row is
              // about -- shown as context under the name whenever both exist, instead of
              // silently dropping whichever one isn't picked as the title.
              const context = row.partyName ? (row.reviewSummary ?? row.productInterestSummary) : null;
              return (
                <li key={row.id} className="flex flex-col gap-2 p-4 text-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{row.partyName ?? row.reviewSummary ?? row.productInterestSummary ?? "Unknown contact"}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                      <Badge variant={row.priority === "high" ? "destructive" : "outline"} className="capitalize">
                        {row.priority}
                      </Badge>
                    </div>
                  </div>
                  {context ? <p className="truncate text-xs text-muted-foreground">{context}</p> : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.source ? (
                      <Badge variant="outline" className="capitalize">
                        {row.source}
                      </Badge>
                    ) : null}
                    {row.channel ? (
                      <Badge variant="outline" className="capitalize">
                        {row.channel}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className={overdue ? "font-medium text-destructive" : undefined}>Due {formatDate(row.due_at)}</span>
                    <Badge variant={row.owner_id ? "secondary" : "outline"}>{employeeById.get(row.owner_id ?? "")?.full_name ?? "Unassigned"}</Badge>
                  </div>
                  <form action={completeFollowUpAction.bind(null, businessId, row.id)} className="border-t border-border pt-2">
                    <SubmitButton variant="outline" size="sm" pendingText="Completing...">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Complete
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const overdue = isOverdue(row.due_at);
                const context = row.partyName ? (row.reviewSummary ?? row.productInterestSummary) : null;
                return (
                <TableRow key={row.id}>
                  <TableCell className="max-w-xs font-medium">
                    <p className="truncate">{row.partyName ?? row.reviewSummary ?? row.productInterestSummary ?? "Unknown contact"}</p>
                    {context ? <p className="truncate text-xs font-normal text-muted-foreground">{context}</p> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{row.source ?? "--"}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{row.channel ?? "--"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                      <Badge variant={row.priority === "high" ? "destructive" : "outline"} className="capitalize">
                        {row.priority}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className={overdue ? "font-medium text-destructive" : "text-muted-foreground"}>{formatDate(row.due_at)}</TableCell>
                  <TableCell>
                    <Badge variant={row.owner_id ? "secondary" : "outline"}>{employeeById.get(row.owner_id ?? "")?.full_name ?? "Unassigned"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={completeFollowUpAction.bind(null, businessId, row.id)}>
                      <SubmitButton variant="outline" size="sm">
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        Complete
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

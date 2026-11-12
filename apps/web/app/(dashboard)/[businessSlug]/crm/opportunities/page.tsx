import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { ensureDefaultStages } from "@cofounderai/module-crm/lib/opportunities/mutations";
import { listOpportunities } from "@cofounderai/module-crm/lib/opportunities/queries";
import { calculatePipelineValue } from "@cofounderai/module-crm/lib/opportunities/types";
import { listEmployeeOptions } from "@cofounderai/module-crm/lib/tickets/queries";
import { listPartiesForBusiness } from "@cofounderai/core/parties/queries";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { Target } from "lucide-react";
import { updateOpportunityStageAction } from "./actions";
import { OpportunitiesKanban } from "./opportunities-kanban";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/**
 * CRM-04.2's Opportunity Pipeline -- Kanban (default) and List views of the same data,
 * toggled via `?view=`, same href-toggle pattern module-fsm's own schedule page already
 * uses for its day/week views. Stage configuration (`ensureDefaultStages`) is
 * business-level and lazily provisioned on first visit. List view follows
 * docs/design/claude-ui-design-rules.md the same way the Leads page does: a real table
 * on desktop, cards below `md`.
 *
 * CRM-05.4 adds the Owner column to List view (Kanban stays focused on stage drag/drop).
 *
 * PLATFORM-NAV-P0-02.3: a List row carries one action, View. Assigning an owner
 * (CRM-05.4) and editing the value (CRM-04.3) are on the opportunity's own page, which
 * View opens and which already had both; the row shows the owner and the value as text.
 */
export default async function CrmOpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const { view } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [stages, opportunities, parties, employees] = await Promise.all([
    ensureDefaultStages(businessId),
    listOpportunities(businessId),
    listPartiesForBusiness(businessId),
    listEmployeeOptions(businessId),
  ]);
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));
  const stageNameById = new Map(stages.map((s) => [s.id, s.name]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const isListView = view === "list";
  const basePath = `/${businessSlug}/crm/opportunities`;
  const { openValue, wonValue } = calculatePipelineValue(opportunities);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sales Opportunities</h1>
          <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s pipeline of open deals.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="crm.opportunities" businessSlug={businessSlug} params={{ view }} />
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <Button asChild variant={!isListView ? "secondary" : "ghost"} size="sm">
              <Link href={basePath}>Kanban</Link>
            </Button>
            <Button asChild variant={isListView ? "secondary" : "ghost"} size="sm">
              <Link href={`${basePath}?view=list`}>List</Link>
            </Button>
          </div>
        </div>
      </div>

      {opportunities.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground uppercase">Pipeline value</p>
              <p className="mt-1 text-xl font-semibold">{inr.format(openValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground uppercase">Won value</p>
              <p className="mt-1 text-xl font-semibold">{inr.format(wonValue)}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {opportunities.length === 0 ? (
        <EmptyState icon={Target} message="No opportunities yet. Convert a lead to create one." />
      ) : isListView ? (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {opportunities.map((opportunity) => (
              <li key={opportunity.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <Link href={`/${businessSlug}/crm/customers/${opportunity.party_id}`} className="min-w-0 font-medium break-words hover:underline">
                    {partyNameById.get(opportunity.party_id) ?? "Unknown contact"}
                  </Link>
                  <Badge variant={opportunity.status === "won" ? "secondary" : opportunity.status === "lost" ? "destructive" : "outline"} className="shrink-0">
                    {opportunity.stage_id ? stageNameById.get(opportunity.stage_id) : opportunity.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {opportunity.estimated_value ? inr.format(opportunity.estimated_value) : "No estimate"}
                    {opportunity.expected_close_date ? ` -- close ${formatDate(opportunity.expected_close_date)}` : ""}
                  </span>
                  <span>Created {formatDate(opportunity.created_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={opportunity.owner_id ? "secondary" : "outline"} className="w-fit">
                    {employeeById.get(opportunity.owner_id ?? "")?.full_name ?? "Unassigned"}
                  </Badge>
                  <Link
                    href={`/${businessSlug}/crm/opportunities/${opportunity.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Close date</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((opportunity) => (
                <TableRow key={opportunity.id}>
                  <TableCell className="font-medium">
                    <Link href={`/${businessSlug}/crm/customers/${opportunity.party_id}`} className="hover:underline">
                      {partyNameById.get(opportunity.party_id) ?? "Unknown contact"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={opportunity.status === "won" ? "secondary" : opportunity.status === "lost" ? "destructive" : "outline"}>
                      {opportunity.stage_id ? stageNameById.get(opportunity.stage_id) : opportunity.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{opportunity.estimated_value ? inr.format(opportunity.estimated_value) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{opportunity.expected_close_date ? formatDate(opportunity.expected_close_date) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={opportunity.owner_id ? "secondary" : "outline"}>
                      {employeeById.get(opportunity.owner_id ?? "")?.full_name ?? "Unassigned"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDate(opportunity.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/${businessSlug}/crm/opportunities/${opportunity.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <OpportunitiesKanban
          businessSlug={businessSlug}
          stages={stages}
          opportunities={opportunities}
          partyNameById={partyNameById}
          stageChangeAction={updateOpportunityStageAction.bind(null, businessId)}
        />
      )}
    </div>
  );
}

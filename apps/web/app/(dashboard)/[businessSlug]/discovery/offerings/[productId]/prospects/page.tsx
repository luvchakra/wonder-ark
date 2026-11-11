import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  countProspectSuggestions,
  listProspects,
  listProspectIndustries,
} from "@cofounderai/module-discovery/lib/prospects/queries";
import { buildTodayList } from "@cofounderai/module-discovery/lib/prospects/today";
import { TodayList } from "@cofounderai/module-discovery/components/prospects/today-list";
import type { ProspectStatus } from "@cofounderai/module-discovery/lib/prospects/types";
import type { ProspectStage } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { ProspectToolbarActions } from "@cofounderai/module-discovery/components/prospects/prospect-toolbar-actions";
import { ProspectsBoard } from "@cofounderai/module-discovery/components/prospects/prospects-board";
import { AutoPopulateStepBanner } from "@cofounderai/module-discovery/components/tenancy/auto-populate-step-banner";
import { AutoPopulateCompleteDialog } from "@cofounderai/module-discovery/components/tenancy/auto-populate-complete-dialog";
import {
  createProspectAction,
  bulkResearchAction,
  bulkScoreAction,
  autoDiscoverOneProspectAction,
} from "./actions";

export default async function ProspectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; productId: string }>;
  searchParams: Promise<{
    status?: string;
    industry?: string;
    search?: string;
    stage?: string;
    sort?: string;
    due?: string;
    imported?: string;
    skipped?: string;
    duplicates?: string;
    bulkAction?: string;
    bulkCompleted?: string;
    bulkSkipped?: string;
    bulkLimit?: string;
    autopopulated?: string;
    aiRestructured?: string;
  }>;
}) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const query = await searchParams;
  const {
    status,
    industry,
    search,
    stage,
    sort,
    due,
    imported,
    skipped,
    duplicates,
    bulkAction,
    bulkCompleted,
    bulkSkipped,
    bulkLimit,
    autopopulated,
    aiRestructured,
  } = query;

  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const sortMode = sort === "stage" || sort === "priority" ? sort : "recent";

  // `search` filters client-side (ProspectsBoard) against this already-fetched list, not
  // the DB query -- the Advanced fields (status/stage/industry/sort) still need a fresh
  // server-side fetch, since sort order and stage are computed server-side.
  // DISC-NAV-P0-01.2: `due=1` is the Today list's "follow-ups due" link.
  const followUpDue = due === "1";
  const hasListFilters = Boolean(status || industry || stage || followUpDue);
  const [prospects, industries, suggestionCount] = await Promise.all([
    listProspects(
      workspace.id,
      {
        status: (status as ProspectStatus) || undefined,
        industry: industry || undefined,
        stage: (stage as ProspectStage) || undefined,
        followUpDue,
      },
      sortMode,
    ),
    listProspectIndustries(workspace.id),
    countProspectSuggestions(workspace.id),
  ]);

  const basePath = `/${businessSlug}/discovery/offerings/${productId}/prospects`;
  const hasActiveFilters = Boolean(status || industry || search || stage || sort || followUpDue);
  const hasAdvancedFilters = Boolean(status || stage || industry || sort || followUpDue);

  // The Today list counts across every prospect of the offering, whatever the list below
  // is filtered to. Unfiltered, the list just loaded is that set; filtered, it is read
  // once more without the filters.
  const today = buildTodayList({
    prospects: hasListFilters ? await listProspects(workspace.id) : prospects,
    suggestionCount,
    prospectsPath: basePath,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Prospects</h1>
        {/* DISC-NAV-P0-01.1: Import and Discover moved to the Find tab; Add is this page's
            one primary action. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportMenu exportId="discovery.prospects" businessSlug={businessSlug} params={{ ...query, productId }} />
          <ProspectToolbarActions createAction={createProspectAction.bind(null, businessId, productId, workspace.id)} />
        </div>
      </div>

      <TodayList rows={today} />

      {followUpDue ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          Showing prospects with a follow-up due. Clear the filters to see every prospect.
        </p>
      ) : null}

      <AutoPopulateStepBanner
        step="prospects"
        action={autoDiscoverOneProspectAction.bind(null, businessId, productId, workspace.id)}
        nextPath={basePath}
        resultQueryParam="autopopulated"
        runningLabel="Searching the web for one matching prospect..."
        replace
      />

      <AutoPopulateCompleteDialog
        resultCount={autopopulated}
        basePath={basePath}
        icpHref={`/${businessSlug}/discovery/offerings/${productId}/icp`}
      />

      {imported ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          Imported {imported} prospect{imported === "1" ? "" : "s"}.
          {aiRestructured === "1" ? " AI restructured the file to fit the required columns." : ""}
          {skipped && skipped !== "0" ? ` Skipped ${skipped} row(s) missing a name.` : ""}
          {duplicates && duplicates !== "0"
            ? ` Skipped ${duplicates} row(s) already in your pipeline.`
            : ""}
        </p>
      ) : null}
      {bulkAction ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          {bulkAction === "research" ? "Researched" : "Scored"} {bulkCompleted ?? 0} prospect
          {bulkCompleted === "1" ? "" : "s"}.
          {bulkSkipped && bulkSkipped !== "0"
            ? ` Skipped ${bulkSkipped} (not eligible for this step, or failed).`
            : ""}
          {bulkLimit === "1"
            ? " Stopped early -- this workspace hit its free-tier monthly AI usage limit."
            : ""}
        </p>
      ) : null}

      <ProspectsBoard
        prospects={prospects}
        basePath={basePath}
        initialSearch={search ?? ""}
        status={status ?? ""}
        stage={stage ?? ""}
        industry={industry ?? ""}
        sort={sort ?? "recent"}
        industries={industries}
        defaultAdvancedOpen={hasAdvancedFilters}
        hasActiveFilters={hasActiveFilters}
        bulkResearchAction={bulkResearchAction.bind(null, businessId, productId, workspace.id)}
        bulkScoreAction={bulkScoreAction.bind(null, businessId, productId, workspace.id)}
      />
    </div>
  );
}

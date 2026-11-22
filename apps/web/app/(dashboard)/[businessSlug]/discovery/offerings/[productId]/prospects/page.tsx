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
import { listCampaignTasks } from "@cofounderai/module-discovery/lib/campaigns/tasks";
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
  saveSignupPageAction,
  bulkResearchAction,
  bulkScoreAction,
  autoDiscoverOneProspectAction,
  unshortlistProspectsAction,
} from "./actions";
import { markTaskDoneAction } from "../campaigns/actions";
import Link from "next/link";
import { audienceTypeOf } from "@cofounderai/module-discovery/lib/icp/audience";
import { countNewSignups, listLeads } from "@cofounderai/module-discovery/lib/audience/leads";
import { getSignupPage } from "@cofounderai/module-discovery/lib/audience/pages";
import { defaultConsentText } from "@cofounderai/module-discovery/lib/audience/rules";
import { PeopleList } from "@cofounderai/module-discovery/components/audience/people-list";
import { bulkResultMessage } from "@cofounderai/module-discovery/lib/prospects/bulk-actions";
import { SignupPageSettings } from "@cofounderai/module-discovery/components/audience/signup-page-settings";
import { SITE_URL } from "@cofounderai/core/site";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import { listCampaignsWithCounts } from "@cofounderai/module-discovery/lib/campaigns/campaigns";
import CampaignsPage from "../campaigns/page";
import OpportunitiesPage from "../opportunities/page";
import WatchlistPage from "../watchlist/page";

/** DISC-CONS-P0-05.1/05.2: the lists the Prospects tab offers, by who buys the offering. */
const LIST_LABEL = { companies: "Companies", channels: "Channels", people: "People" } as const;
type ProspectList = keyof typeof LIST_LABEL;

/** The campaigns in one line, for their section's summary. */
function campaignsHint(campaigns: { status: string }[]): string {
  if (campaigns.length === 0) return "No campaigns yet";
  const running = campaigns.filter((campaign) => campaign.status === "active").length;
  return `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}${running ? ` · ${running} running` : ""}`;
}

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
    bulkDone?: string;
    bulkNotReady?: string;
    bulkFailed?: string;
    bulkLimit?: string;
    autopopulated?: string;
    aiRestructured?: string;
    list?: string;
    peopleImported?: string;
    shortlisted?: string;
    unshortlisted?: string;
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
    bulkLimit,
    autopopulated,
    aiRestructured,
  } = query;

  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const sortMode = sort === "stage" || sort === "priority" ? sort : "recent";

  // DISC-CONS-P0-05.1: a consumer offering's prospects are channels; one sold to both
  // has companies and channels, one list at a time. A business offering is unchanged.
  const audienceType = audienceTypeOf(product);
  // DISC-NAV-P0-01.10: Reach holds only picked prospects (approved on Find, picked there
  // from an import, or added here by hand). Companies, Channels and People are chips when
  // the offering has more than one; picking happens on Find.
  const lists: ProspectList[] =
    audienceType === "consumer" ? ["channels", "people"] : audienceType === "both" ? ["companies", "channels", "people"] : ["companies"];
  const waiting = await listProspects(workspace.id, { shortlisted: false });
  const currentList: ProspectList = lists.find((entry) => entry === query.list) ?? lists[0]!;
  const kind =
    currentList === "channels" ? ("channel" as const) : currentList === "companies" && audienceType !== "business" ? ("company" as const) : undefined;
  // DISC-CONS-P0-05.2: People are the offering's own list of those who opted in.
  const showPeople = currentList === "people";
  const [leads, signupPage, business] = showPeople
    ? await Promise.all([listLeads(workspace.id), getSignupPage(workspace.id), getBusiness(businessId)])
    : [[], null, null];

  // `search` filters client-side (ProspectsBoard) against this already-fetched list, not
  // the DB query -- the Advanced fields (status/stage/industry/sort) still need a fresh
  // server-side fetch, since sort order and stage are computed server-side.
  // DISC-NAV-P0-01.2: `due=1` is the Today list's "follow-ups due" link.
  const followUpDue = due === "1";
  const hasListFilters = Boolean(status || industry || stage || followUpDue);
  const [prospects, industries, suggestionCount, campaignTasks, campaigns] = await Promise.all([
    listProspects(
      workspace.id,
      {
        status: (status as ProspectStatus) || undefined,
        industry: industry || undefined,
        stage: (stage as ProspectStage) || undefined,
        followUpDue,
        kind,
        shortlisted: true,
      },
      sortMode,
    ),
    listProspectIndustries(workspace.id),
    countProspectSuggestions(workspace.id),
    // DISC-CAMP-P0-06.1: the running campaigns' call, WhatsApp and LinkedIn steps that are due.
    listCampaignTasks(workspace.id),
    listCampaignsWithCounts(workspace.id),
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
    newSignups: lists.includes("people") ? await countNewSignups(workspace.id) : undefined,
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

      {lists.length > 1 ? (
        <nav aria-label="Lists" className="flex flex-wrap gap-1.5">
          {lists.map((entry) => (
            <Link
              key={entry}
              href={`${basePath}?list=${entry}`}
              aria-current={entry === currentList ? "page" : undefined}
              className={
                entry === currentList
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {LIST_LABEL[entry]}
            </Link>
          ))}
        </nav>
      ) : null}
      {waiting.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {waiting.length} imported {waiting.length === 1 ? "prospect is" : "prospects are"} waiting to be picked on{" "}
          <Link href={`${basePath}/discover#to-pick`} className="font-medium text-foreground underline-offset-4 hover:underline">
            Find
          </Link>
          .
        </p>
      ) : null}

      <TodayList rows={today} tasks={campaignTasks} taskAction={(enrollmentId) => markTaskDoneAction.bind(null, businessId, productId, enrollmentId)} />


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

      {query.peopleImported ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          Imported {query.peopleImported} {query.peopleImported === "1" ? "person" : "people"}.
          {duplicates && duplicates !== "0" ? ` Skipped ${duplicates} already on your list.` : ""}
          {skipped && skipped !== "0" ? ` Skipped ${skipped} row(s) without a valid email.` : ""}
        </p>
      ) : null}
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
      {query.shortlisted ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          Picked {query.shortlisted}. Research, score or add them to a campaign here.
        </p>
      ) : null}
      {query.unshortlisted ? (
        <p className="rounded-md border bg-muted p-3 text-sm">Moved {query.unshortlisted} back to Find to pick again.</p>
      ) : null}
      {bulkAction === "research" || bulkAction === "score" ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          {bulkResultMessage({
            action: bulkAction,
            completed: Number(bulkCompleted ?? 0) || 0,
            alreadyDone: Number(query.bulkDone ?? 0) || 0,
            notReady: Number(query.bulkNotReady ?? 0) || 0,
            failed: Number(query.bulkFailed ?? 0) || 0,
            limitReached: bulkLimit === "1",
          })}
        </p>
      ) : null}

      {showPeople ? (
        <div className="flex flex-col gap-4">
          <SignupPageSettings
            page={signupPage}
            pageUrl={signupPage ? `${SITE_URL}/p/w/${signupPage.token}` : null}
            saveAction={saveSignupPageAction.bind(null, businessId, productId, workspace.id)}
            defaultConsent={defaultConsentText(business?.name ?? "this business")}
          />
          <PeopleList leads={leads} basePath={`${basePath}/people`} />
        </div>
      ) : (
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
        channels={currentList === "channels"}
        list={currentList}
        backToSelectAction={unshortlistProspectsAction.bind(null, businessId, productId, workspace.id)}
      />
      )}

      {/* DISC-NAV-P0-01.4/01.9: the Prospects tab's other pages, folded below the list, which is
          what this tab is for. */}
      <div className="flex flex-col gap-3">
        <SectionFold id="campaigns" title="Campaigns" hint={campaignsHint(campaigns)}>
          <CampaignsPage params={params} />
        </SectionFold>
        <SectionFold id="opportunities" title="Opportunities" hint="Prospects showing a reason to buy now">
          <OpportunitiesPage params={params} />
        </SectionFold>
        <SectionFold id="watchlist" title="Watchlist" hint="Accounts you are keeping an eye on">
          <WatchlistPage params={params} />
        </SectionFold>
      </div>
    </div>
  );
}

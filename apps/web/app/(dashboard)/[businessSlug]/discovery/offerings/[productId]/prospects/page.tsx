import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspects } from "@cofounderai/module-discovery/lib/prospects/queries";
import { ProspectToolbarActions } from "@cofounderai/module-discovery/components/prospects/prospect-toolbar-actions";
import { ReachList, type DirectMessage } from "@cofounderai/module-discovery/components/prospects/reach-list";
import { TodayList } from "@cofounderai/module-discovery/components/prospects/today-list";
import { needsYouCount, prospectGroups } from "@cofounderai/module-discovery/lib/journey/todo";
import { listCampaignTasks } from "@cofounderai/module-discovery/lib/campaigns/tasks";
import { listDirectDrafts } from "@cofounderai/module-discovery/lib/messages/queries";
import { DM_LABEL } from "@cofounderai/module-discovery/lib/channels/reach";
import { safeHttpUrl } from "@cofounderai/module-discovery/lib/data-sources/suggestions";
import { markTaskDoneAction } from "../campaigns/actions";
import { editDirectMessageAction, markDirectMessageSentAction, rewriteDirectMessageAction } from "./[prospectId]/actions";
import { MoreActions } from "@cofounderai/module-discovery/components/ui/more-actions";
import { AutoPopulateStepBanner } from "@cofounderai/module-discovery/components/tenancy/auto-populate-step-banner";
import { AutoPopulateCompleteDialog } from "@cofounderai/module-discovery/components/tenancy/auto-populate-complete-dialog";
import {
  createProspectAction,
  saveSignupPageAction,
  autoDiscoverOneProspectAction,
} from "./actions";
import Link from "next/link";
import { audienceTypeOf } from "@cofounderai/module-discovery/lib/icp/audience";
import { listLeads } from "@cofounderai/module-discovery/lib/audience/leads";
import { getSignupPage } from "@cofounderai/module-discovery/lib/audience/pages";
import { defaultConsentText } from "@cofounderai/module-discovery/lib/audience/rules";
import { PeopleList } from "@cofounderai/module-discovery/components/audience/people-list";
import { SignupPageSettings } from "@cofounderai/module-discovery/components/audience/signup-page-settings";
import { SITE_URL } from "@cofounderai/core/site";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import { listCampaignsWithCounts } from "@cofounderai/module-discovery/lib/campaigns/campaigns";
import CampaignsPage from "../campaigns/page";

/** DISC-CONS-P0-05.1/05.2: the lists the Prospects tab offers, by who buys the offering. */
const LIST_LABEL = { companies: "Companies", channels: "Channels", people: "People" } as const;
type ProspectList = keyof typeof LIST_LABEL;

/** The campaigns in one line, for their section's summary. */
function campaignsHint(campaigns: { status: string }[]): string {
  if (campaigns.length === 0) return "Or email many at once, on a schedule";
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
    imported,
    skipped,
    duplicates,
    autopopulated,
    aiRestructured,
  } = query;

  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  // DISC-CONS-P0-05.1: a consumer offering's prospects are channels; one sold to both
  // has companies and channels, one list at a time. A business offering is unchanged.
  const audienceType = audienceTypeOf(product);
  // DISC-NAV-P0-01.10: Reach holds only picked prospects (approved on Find, picked there
  // from an import, or added here by hand). Companies, Channels and People are chips when
  // the offering has more than one; picking happens on Find.
  const lists: ProspectList[] =
    audienceType === "consumer" ? ["channels", "people"] : audienceType === "both" ? ["companies", "channels", "people"] : ["companies"];
  const currentList: ProspectList = lists.find((entry) => entry === query.list) ?? lists[0]!;
  // DISC-CONS-P0-05.2: People are the offering's own list of those who opted in.
  const showPeople = currentList === "people";
  const [leads, signupPage, business] = showPeople
    ? await Promise.all([listLeads(workspace.id), getSignupPage(workspace.id), getBusiness(businessId)])
    : [[], null, null];

  // DISC-NAV-P0-02.5: everything done with an approved prospect is on this tab. One read of
  // every picked prospect: the list in view is filtered from it, and each chip counts what
  // needs the person on its list, so nothing waits unseen behind another chip.
  const [picked, campaigns, campaignTasks] = await Promise.all([
    listProspects(workspace.id, { shortlisted: true }),
    listCampaignsWithCounts(workspace.id),
    listCampaignTasks(workspace.id),
  ]);
  const ofList = (entry: ProspectList) =>
    entry === "people"
      ? []
      : entry === "channels"
        ? picked.filter((p) => p.kind === "channel")
        : audienceType === "business"
          ? picked
          : picked.filter((p) => p.kind !== "channel");
  const prospects = ofList(currentList);
  // DISC-REACH-P0-01.1: the text of each direct message, so its card can copy it.
  const dmProspects = prospectGroups(prospects).find((group) => group.id === "dm")?.prospects ?? [];
  const drafts = await listDirectDrafts(workspace.id, dmProspects.map((p) => p.id));
  const directMessages: Record<string, DirectMessage> = {};
  for (const p of dmProspects) {
    const draft = drafts.find((m) => m.prospect_id === p.id);
    if (!draft) continue;
    directMessages[p.id] = {
      text: draft.content,
      platform: DM_LABEL[draft.channel as keyof typeof DM_LABEL] ?? "their page",
      profileLink: safeHttpUrl(p.source_ref ?? null) ?? safeHttpUrl(p.website ?? null),
      markSentAction: markDirectMessageSentAction.bind(null, businessId, productId, p.id, draft.id),
      editAction: editDirectMessageAction.bind(null, businessId, productId, p.id, draft.id),
      rewriteAction: rewriteDirectMessageAction.bind(null, businessId, productId, p.id, draft.id),
    };
  }

  const basePath = `/${businessSlug}/discovery/offerings/${productId}/prospects`;
  // Campaigns email companies only, so they are offered on the Companies list alone.
  const showCampaigns = currentList === "companies";

  return (
    <div className="flex flex-col gap-4">
      {/* DISC-NAV-P0-02.3: the tab already says "Prospects", so the page has no heading of
          its own. One row: the lists as chips, and the rare actions (add by hand, export)
          behind a three-dot button at its end. Imported prospects waiting to be picked
          are on Search, which counts them, so they are not repeated here. */}
      <div className="flex items-center justify-between gap-3">
        {lists.length > 1 ? (
          <nav aria-label="Lists" className="flex min-w-0 flex-wrap gap-1.5">
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
                {needsYouCount(ofList(entry)) > 0 ? (
                  <span className="ml-1.5 tabular-nums">
                    {needsYouCount(ofList(entry))}
                    <span className="sr-only"> need you</span>
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        ) : (
          <h1 className="sr-only">Prospects</h1>
        )}
        <MoreActions compact className="ml-auto shrink-0">
          <ProspectToolbarActions createAction={createProspectAction.bind(null, businessId, productId, workspace.id)} />
          <ExportMenu exportId="discovery.prospects" businessSlug={businessSlug} params={{ productId, list: currentList }} />
        </MoreActions>
      </div>

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
          Picked {query.shortlisted}. Open Prepare prospects above to choose which to research, score and write to.
        </p>
      ) : null}
      {query.unshortlisted ? (
        <p className="rounded-md border bg-muted p-3 text-sm">Moved {query.unshortlisted} back to Search to pick again.</p>
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
        <>
          {/* DISC-CAMP-P0-06.1: a running campaign's call, WhatsApp and LinkedIn steps that are due. */}
          {showCampaigns ? (
            <TodayList rows={[]} tasks={campaignTasks} taskAction={(enrollmentId) => markTaskDoneAction.bind(null, businessId, productId, enrollmentId)} />
          ) : null}
          <ReachList prospects={prospects} basePath={basePath} channels={currentList === "channels"} directMessages={directMessages} />
        </>
      )}

      {/* DISC-NAV-P0-01.13: one other way to reach them, many at once: a campaign. Opportunities
          is no longer a section here; its page keeps its address. */}
      {showCampaigns ? (
        <SectionFold id="campaigns" title="Campaigns" done={campaigns.some((campaign) => campaign.status === "active")} hint={campaignsHint(campaigns)}>
          <CampaignsPage params={params} />
        </SectionFold>
      ) : null}
    </div>
  );
}

import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspectSuggestions } from "@cofounderai/module-discovery/lib/prospects/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { listDataSources } from "@cofounderai/module-discovery/lib/data-sources/index";
import { getSavedSearch, summariseSavedSearch } from "@cofounderai/module-discovery/lib/data-sources/saved-searches";
import {
  DATA_SOURCE_STATUS_LABEL,
  STORED_SOURCE_ID,
  STORED_SOURCE_LABEL,
  WEB_SEARCH_SOURCE_ID,
  gatewayFailureMessage,
  type DataSourceList,
} from "@cofounderai/module-discovery/lib/data-sources/types";
import { FindForm } from "@cofounderai/module-discovery/components/prospects/find-form";
import { audienceTypeOf, audienceWords, readIdealUser } from "@cofounderai/module-discovery/lib/icp/audience";
import { sourcesForTarget, type FindTarget } from "@cofounderai/module-discovery/lib/data-sources/types";
import { SuggestionReviewList } from "@cofounderai/module-discovery/components/prospects/suggestion-review-list";
import { WeeklySearchLine } from "@cofounderai/module-discovery/components/prospects/weekly-search";
import {
  approveSuggestionsAction,
  discardSuggestionsAction,
  findAction,
  saveWeeklySearchAction,
  setWeeklySearchEnabledAction,
} from "./actions";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import ImportProspectsPage from "../import/page";
import RunHistoryPage from "../../history/page";

/** The one line under the form: what is left of this business's lookups, or why the
 * gateway can't be searched. Only what the gateway reported; nothing is estimated. */
function gatewayNote(list: DataSourceList): string | null {
  if (list.gateway.state === "quota") return gatewayFailureMessage("quota", list.gateway.resetAt, list.quota);
  if (list.gateway.state !== "ok") {
    return `${STORED_SOURCE_LABEL}: ${DATA_SOURCE_STATUS_LABEL[list.gateway.state]}.`;
  }
  const { quota } = list;
  if (!quota) return null;
  return `WorksLake: ${quota.search.remaining} of ${quota.search.limit} searches and ${quota.paid.remaining} of ${quota.paid.limit} paid lookups left this ${quota.period}.`;
}

/**
 * DISC-DATA-P0-03.1/03.2: Find. One form (what, where, source, Find, with the rest
 * under "More filters") and the list of suggestions waiting for review.
 *
 * Layout, planned before markup (docs/design/claude-ui-design-rules.md): the person's
 * task is to find companies and decide which to keep, so the page is the search, then
 * what it found. Find is the primary action until suggestions are waiting; then
 * approving them is. The offering's tab bar already leads back to Prospects, so the page
 * carries no link of its own for that.
 *
 * Visible controls: 5 with nothing to review (was 6), and 7 plus two per suggestion
 * with a review list (was 8 plus three per suggestion). DISC-NAV-P0-01.1 leaves the page
 * itself alone and takes the offering's tab bar above it from nine links to eight (four
 * tabs and Find's four pages).
 *
 * DISC-DATA-P0-05.1 adds two controls, each shown only when it applies: "Run this
 * weekly" in the result of a search that just ran on a free source (hidden when that
 * same search is already the weekly one), and Pause or Resume on the one line that
 * describes the offering's weekly search once there is one. A page with neither state
 * has the same 5 controls as before.
 */
export default async function DiscoverProspectsPage({
  params,
}: {
  params: Promise<{ businessSlug: string; productId: string }>;
}) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const [suggestions, icp, list, savedSearch] = await Promise.all([
    listProspectSuggestions(workspace.id),
    getIcpProfile(workspace.id),
    listDataSources(workspace.id),
    getSavedSearch(workspace.id),
  ]);
  const weekly = summariseSavedSearch(savedSearch);

  // DISC-CONS-P0-02.1: what this offering looks for follows who buys it. Companies only:
  // companies, as before. Consumers: channels by default, or the places they gather.
  // Both: a toggle between companies and channels (and places).
  const audienceType = audienceTypeOf(product);
  const words = audienceWords(audienceType);
  const targets: FindTarget[] =
    audienceType === "consumer" ? ["channels", "places"] : audienceType === "both" ? ["companies", "channels", "places"] : [];
  const sources = list.sources.filter((source) => source.action !== "import");
  const companySources = sourcesForTarget(sources, "companies");
  const usable = companySources.filter((source) => source.status === "active");
  const defaultSource =
    usable.find((source) => source.id === STORED_SOURCE_ID) ??
    usable.find((source) => source.origin === "gateway" && source.action === "search" && !source.paid) ??
    usable.find((source) => source.id === WEB_SEARCH_SOURCE_ID) ??
    usable[0];

  // Prefilled from the approved ICP only: a draft ICP is not yet what the business
  // decided to target.
  const approvedIcp = icp?.status === "approved" ? icp : null;
  // The channel topics and places come from the approved Ideal user, the same way.
  const idealUser = approvedIcp ? readIdealUser(approvedIcp.audience) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-medium">{words.findHeading}</h1>
        <p className="text-sm text-muted-foreground">
          Nothing is added to your prospects until you approve it below.
        </p>
      </div>

      <FindForm
        action={findAction.bind(null, businessId, productId, workspace.id)}
        sources={sources}
        targets={targets}
        defaultSourceId={defaultSource?.id ?? ""}
        quota={list.quota}
        note={gatewayNote(list)}
        defaults={{
          what: approvedIcp?.industries.join(", ") ?? "",
          where: approvedIcp?.geographies.join("; ") ?? "",
          hiringKeywords: approvedIcp ? [...approvedIcp.buying_signals, ...approvedIcp.existing_tools].join(", ") : "",
          channelTopics: idealUser ? [...idealUser.interests, ...idealUser.online_places].join(", ") : "",
          places: idealUser ? idealUser.offline_places.join(", ") : "",
        }}
        primary={suggestions.length === 0}
        saveWeeklyAction={saveWeeklySearchAction.bind(null, businessId, productId, workspace.id)}
        weekly={weekly}
      />

      {weekly ? (
        <WeeklySearchLine
          search={weekly}
          sourceLabel={list.sources.find((source) => source.id === weekly.sourceId)?.label ?? null}
          toggleAction={setWeeklySearchEnabledAction.bind(null, businessId, productId, workspace.id, !weekly.enabled)}
        />
      ) : null}

      <SuggestionReviewList
        suggestions={suggestions}
        approveAction={approveSuggestionsAction.bind(null, businessId, productId, workspace.id)}
        discardAction={discardSuggestionsAction.bind(null, businessId, productId, workspace.id)}
      />

      {/* DISC-NAV-P0-01.4: the Find tab's other pages, folded below the search. */}
      <div className="flex flex-col gap-3">
        <SectionFold id="import" title="Import" hint="Add prospects from a file">
          <ImportProspectsPage params={params} />
        </SectionFold>
        <SectionFold id="history" title="History" hint="Every search and AI discovery run, with what each found">
          <RunHistoryPage params={params} />
        </SectionFold>
      </div>
    </div>
  );
}

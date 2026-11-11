import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { discoverProspects } from "../ai/discover-prospects";
import { getIcpProfile } from "../icp/queries";
import { passesIcpPreFilter, type IcpPreFilterCriteria } from "../pipeline/icp-pre-filter";
import { findDuplicateProspect } from "../prospects/duplicates";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { assertWithinUsageLimit } from "../usage/limits";
import { listDataSources } from "./index";
import { recordDataSourceRun, type DataSourceOperation } from "./runs";
import {
  cleanText,
  hiringMatchReason,
  preFilterCandidate,
  searchMatchReason,
  toSuggestionRow,
  type GatewaySuggestionRow,
} from "./suggestions";
import {
  WEB_SEARCH_SOURCE_ID,
  WEB_SEARCH_SOURCE_LABEL,
  gatewayFailureMessage,
  type DataSource,
  type FindOutcome,
} from "./types";
import {
  hiringSignals,
  searchProspects,
  type BusinessItem,
  type GatewayFailure,
  type GatewayLocationInput,
  type GatewayUsage,
  type ProspectItem,
  type SearchRequest,
  type SignalsRequest,
} from "./workslake-client";

/**
 * DISC-DATA-P0-03.1/03.2/03.3: one Find run, whichever source it uses.
 *
 * Everything here is deterministic. The source decides what it returns; this code
 * decides what is kept:
 *  - the tenant, the licence and the usage allowance are checked on the server before
 *    anything is asked of the gateway;
 *  - the source must be one the gateway itself lists as active for this business, not
 *    merely one a form named;
 *  - a result is staged in `discovery.prospect_suggestions` and nowhere else. It becomes
 *    a prospect only when a person approves it;
 *  - a result that does not fit the approved ICP, is already a prospect, or is already
 *    waiting for review is not staged, and the outcome says how many and why.
 */

/** Results asked for per run. The gateway's ceiling is 50. */
export const FIND_PAGE_SIZE = 25;
/** How far back a hiring signal looks, in days. */
export const HIRING_SIGNAL_WINDOW_DAYS = 30;

export type FindInput = {
  /** A `DataSource.id` from `listDataSources`. */
  sourceId: string;
  /** Keywords or categories. For a hiring signal, the keywords to match job titles on. */
  what: string;
  /** A place, or several separated by semicolons. Blank means no place filter. */
  where: string;
  /** "More filters": company size, as the person typed it. */
  companySize?: string;
  /** "More filters", AI web search only: extra things to look for. */
  alsoLookFor?: string;
  /** "More filters", gateway search only: keep results that have a website. */
  hasWebsite?: boolean;
};

function splitList(value: string | undefined, separator: RegExp): string[] {
  return (value ?? "")
    .split(separator)
    .map((part) => cleanText(part, 200))
    .filter((part): part is string => part !== null);
}

function locationsOf(where: string): GatewayLocationInput[] {
  return splitList(where, /[;\n]/).map((place) => ({
    text: place,
    country: null,
    lat: null,
    lon: null,
    radiusKm: null,
  }));
}

function failed(reason: Extract<FindOutcome, { status: "failed" }>["reason"], message: string): FindOutcome {
  return { status: "failed", reason, message };
}

function fromGatewayFailure(failure: GatewayFailure): FindOutcome {
  const reason = failure.failure === "forbidden" ? "needs_setup" : failure.failure;
  return failed(reason, gatewayFailureMessage(failure.failure, failure.resetAt));
}

/** Short, fixed wording for why the ICP pre-filter turned results away. */
function icpReasonLabel(reason: string | null): string {
  if (reason?.startsWith("Excluded")) return "on your ICP's exclusion list";
  if (reason?.startsWith("Industry")) return "outside your ICP's industries";
  if (reason?.startsWith("Location")) return "outside your ICP's geographies";
  return "outside your ICP";
}

function summariseReasons(counts: Map<string, number>): string[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${count} ${label}`);
}

async function approvedIcpCriteria(workspaceId: string): Promise<IcpPreFilterCriteria | null> {
  const icp = await getIcpProfile(workspaceId);
  if (!icp || icp.status !== "approved") return null;
  return {
    industries: icp.industries,
    geographies: icp.geographies,
    companySizes: icp.company_sizes,
    exclusions: icp.exclusions,
  };
}

/**
 * Stages the gateway's business records as suggestions, skipping what should not be
 * staged and counting each skip.
 */
export async function stageGatewayResults(
  workspaceId: string,
  items: BusinessItem[],
  matchReason: (item: BusinessItem) => string,
): Promise<{ added: number; skipped: Omit<Extract<FindOutcome, { status: "completed" }>["skipped"], "unreadable">; unstageable: number }> {
  const criteria = await approvedIcpCriteria(workspaceId);
  const icpReasons = new Map<string, number>();
  let icp = 0;
  let alreadyInReview = 0;
  let unstageable = 0;

  const seen = new Set<string>();
  const candidates: GatewaySuggestionRow[] = [];
  for (const item of items) {
    const row = toSuggestionRow(workspaceId, item, matchReason(item));
    if (!row) {
      unstageable += 1;
      continue;
    }
    if (criteria) {
      const verdict = passesIcpPreFilter(criteria, preFilterCandidate(item));
      if (!verdict.passes) {
        icp += 1;
        const label = icpReasonLabel(verdict.reason);
        icpReasons.set(label, (icpReasons.get(label) ?? 0) + 1);
        continue;
      }
    }
    const key = `${row.source}\u0000${row.external_id}`;
    if (seen.has(key)) {
      alreadyInReview += 1;
      continue;
    }
    seen.add(key);
    candidates.push(row);
  }

  // The same check a hand-added prospect, a CSV import and the AI web search go through:
  // domain first, then company name.
  const duplicates = await Promise.all(
    candidates.map((row) =>
      findDuplicateProspect(workspaceId, { companyName: row.company_name, website: row.website }),
    ),
  );
  const fresh = candidates.filter((_, index) => !duplicates[index]);
  const alreadyProspect = candidates.length - fresh.length;

  let added = 0;
  if (fresh.length > 0) {
    const supabase = await createClient();
    // The unique key on (workspace_id, source, external_id) makes a repeated search, a
    // double click or a retried request add nothing: a record already waiting for review
    // is left as it is, and only the rows actually inserted come back.
    const { data, error } = await supabase
      .from("prospect_suggestions")
      .upsert(fresh, { onConflict: "workspace_id,source,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    added = data?.length ?? 0;
    alreadyInReview += fresh.length - added;
  }

  return {
    added,
    skipped: { alreadyProspect, alreadyInReview, icp, icpReasons: summariseReasons(icpReasons) },
    unstageable,
  };
}

function isBusiness(item: ProspectItem): item is BusinessItem {
  return item.kind === "business";
}

type GatewayRun = {
  operation: DataSourceOperation;
  request: SearchRequest | SignalsRequest;
  results: BusinessItem[];
  unreadable: number;
  usage: GatewayUsage | null;
  providerIssues: Extract<FindOutcome, { status: "completed" }>["providerIssues"];
};

async function callGateway(
  businessId: string,
  source: DataSource & { provider: string },
  input: FindInput,
): Promise<{ run: GatewayRun; failure: null } | { run: Pick<GatewayRun, "operation" | "request">; failure: GatewayFailure }> {
  const caller = { tenantId: businessId };

  if (source.action === "signals") {
    const request: SignalsRequest = {
      signal: "hiring",
      keywords: splitList(input.what, /[,;\n]/),
      locations: locationsOf(input.where),
      sinceDays: HIRING_SIGNAL_WINDOW_DAYS,
      limit: FIND_PAGE_SIZE,
      cursor: null,
    };
    const result = await hiringSignals(caller, request);
    if (!result.ok) return { run: { operation: "gateway_signals", request }, failure: result };
    return {
      failure: null,
      run: {
        operation: "gateway_signals",
        request,
        results: result.data.results,
        unreadable: result.data.unreadable,
        usage: result.data.usage ?? null,
        providerIssues: issuesOf(result.data.metadata?.providers ?? []),
      },
    };
  }

  const request: SearchRequest = {
    kind: "business",
    query: cleanText(input.what, 300) ?? "",
    filters: {
      categories: [],
      industries: [],
      employeeRanges: splitList(input.companySize, /[,;\n]/),
      ...(input.hasWebsite ? { hasWebsite: true } : {}),
      channelTypes: [],
      minAudience: null,
      languages: [],
    },
    locations: locationsOf(input.where),
    providers: [source.provider],
    limit: FIND_PAGE_SIZE,
    cursor: null,
  };
  const result = await searchProspects(caller, request);
  if (!result.ok) return { run: { operation: "gateway_search", request }, failure: result };
  const business = result.data.results.filter(isBusiness);
  return {
    failure: null,
    run: {
      operation: "gateway_search",
      request,
      results: business,
      // A channel in answer to a search for businesses is not what was asked for.
      unreadable: result.data.unreadable + (result.data.results.length - business.length),
      usage: result.data.usage,
      providerIssues: issuesOf(result.data.metadata.providers),
    },
  };
}

function issuesOf(
  providers: { id: string; status: "ok" | "needs_setup" | "unavailable" | "quota" }[],
): Extract<FindOutcome, { status: "completed" }>["providerIssues"] {
  return providers.flatMap((provider) =>
    provider.status === "ok" ? [] : [{ id: provider.id, status: provider.status }],
  );
}

async function findWithWebSearch(workspaceId: string, input: FindInput, label: string): Promise<FindOutcome> {
  // The existing AI web search, unchanged: its approved-ICP check, per-workspace lock,
  // usage check, cost cap and duplicate check all run inside `discoverProspects`. A
  // blank field falls back to the ICP's own criteria, as it always has.
  const suggestions = await discoverProspects(workspaceId, {
    industry: cleanText(input.what, 300) ?? undefined,
    location: cleanText(input.where, 300) ?? undefined,
    companySize: cleanText(input.companySize, 200) ?? undefined,
    keywords: cleanText(input.alsoLookFor, 300) ?? undefined,
  });
  return {
    status: "completed",
    sourceLabel: label,
    found: suggestions.length,
    added: suggestions.length,
    skipped: { alreadyProspect: 0, alreadyInReview: 0, icp: 0, icpReasons: [], unreadable: 0 },
    unitsSpent: null,
    providerIssues: [],
  };
}

/**
 * Runs one Find and reports what happened. Expected refusals (source not set up, gateway
 * down, quota used) come back as a `failed` outcome with a message for the screen;
 * anything else (no licence, usage allowance used up, an AI provider error) is thrown
 * for the caller to report.
 */
export async function runFind(workspaceId: string, input: FindInput): Promise<FindOutcome> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");

  // The AI web search does not depend on the gateway, so it never waits on it.
  if (input.sourceId === WEB_SEARCH_SOURCE_ID) {
    return findWithWebSearch(workspaceId, input, WEB_SEARCH_SOURCE_LABEL);
  }

  const list = await listDataSources(workspaceId);
  const source = list.sources.find((entry) => entry.id === input.sourceId && entry.action !== "import");
  if (!source) return failed("invalid", "Choose a source to search.");

  if (source.origin !== "gateway" || !source.provider) return failed("invalid", "Choose a source to search.");
  if (source.status !== "active") {
    if (list.gateway.state === "quota") {
      return failed("quota", gatewayFailureMessage("quota", list.gateway.resetAt, list.quota));
    }
    return source.status === "needs_setup"
      ? failed("needs_setup", `Needs setup: ${source.label} isn't set up yet.`)
      : failed("unavailable", `Unavailable: ${source.label} can't be searched right now.`);
  }
  // What to look for comes from what the person typed (prefilled from their ICP). With
  // nothing typed there is nothing to search for, and no default stands in for it.
  if (!cleanText(input.what, 300)) {
    return failed(
      "invalid",
      source.action === "signals" ? "Enter the keywords to match job titles on." : "Enter what to look for.",
    );
  }

  await assertWithinUsageLimit(workspaceId);

  const startedAt = Date.now();
  const call = await callGateway(businessId, { ...source, provider: source.provider }, input);
  if (call.failure) {
    // Nothing is recorded for a request that never left this server.
    if (call.failure.called) {
      await recordDataSourceRun({
        workspaceId,
        operation: call.run.operation,
        source: source.provider,
        request: call.run.request,
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: call.failure.code,
      });
    }
    if (call.failure.failure === "quota") {
      return failed("quota", gatewayFailureMessage("quota", call.failure.resetAt, list.quota));
    }
    return fromGatewayFailure(call.failure);
  }

  const { run } = call;
  await recordDataSourceRun({
    workspaceId,
    operation: run.operation,
    source: source.provider,
    request: run.request,
    status: "succeeded",
    resultCount: run.results.length,
    unitsSpent: run.usage?.unitsSpent ?? null,
    durationMs: Date.now() - startedAt,
  });

  const staged = await stageGatewayResults(
    workspaceId,
    run.results,
    source.action === "signals" ? hiringMatchReason : () => searchMatchReason(input.what, input.where),
  );

  return {
    status: "completed",
    sourceLabel: source.label,
    found: run.results.length + run.unreadable,
    added: staged.added,
    skipped: { ...staged.skipped, unreadable: run.unreadable + staged.unstageable },
    unitsSpent: run.usage?.unitsSpent ?? null,
    providerIssues: run.providerIssues,
  };
}

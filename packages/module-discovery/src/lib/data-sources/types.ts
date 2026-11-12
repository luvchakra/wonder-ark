/**
 * DISC-DATA-P0-02.2 and DISC-DATA-P0-03.1: the shapes the Find screen and the source layer share.
 * No server code and no environment access here, so client components may import it.
 */

/** A source's state, in the gateway's own words (GET /v1/prospects/sources). */
export type DataSourceStatus = "active" | "needs_setup" | "paused" | "unavailable";

/** What choosing the source does: run a search, look for companies showing a buying
 * signal, or open the file import page. */
export type DataSourceAction = "search" | "signals" | "import";

export type DataSource = {
  /** Unique in the list; the value the source picker submits. */
  id: string;
  /** The id to name in a gateway request's `providers`. Null for a local source. */
  provider: string | null;
  origin: "gateway" | "local";
  action: DataSourceAction;
  label: string;
  /** What the source holds, in the gateway's words: "business", "channel", "signal". */
  kinds: string[];
  status: DataSourceStatus;
  /** Whether a run spends the business's paid lookups. */
  paid: boolean;
  /** The attribution text the gateway gives for the source. Null for a local source. */
  attribution: string | null;
  coverage: string[];
};

export type DataSourceQuota = {
  period: string;
  search: { limit: number; remaining: number };
  paid: { limit: number; remaining: number };
};

/** How the gateway answered when asked for its sources. */
export type GatewayState = "ok" | "needs_setup" | "unavailable" | "quota";

export type DataSourceList = {
  sources: DataSource[];
  /** Null unless the gateway answered. Never estimated. */
  quota: DataSourceQuota | null;
  gateway: { state: GatewayState; resetAt: string | null };
};

/** The AI web search that existed before the gateway: `discoverProspects`. */
export const WEB_SEARCH_SOURCE_ID = "web_search";
export const WEB_SEARCH_SOURCE_LABEL = "Web search (AI)";
/** The existing CSV, Excel and PDF import. */
export const FILE_IMPORT_SOURCE_ID = "file_import";
export const FILE_IMPORT_SOURCE_LABEL = "File import";
/** The gateway's id for "every stored dataset this key may read", and its default. */
export const STORED_SOURCE_ID = "stored";
export const STORED_SOURCE_LABEL = "WorksLake business data";
/** The `kinds` entry by which the gateway lists a buying signal as available. */
export const SIGNAL_SOURCE_KIND = "signal";

export const DATA_SOURCE_STATUS_LABEL: Record<DataSourceStatus, string> = {
  active: "Active",
  needs_setup: "Needs setup",
  paused: "Paused",
  unavailable: "Unavailable",
};

/** What a Find run reports back. Requested work that did not complete is never reported
 * as success: `failed` says which way it failed. */
export type FindOutcome =
  | {
      status: "completed";
      sourceLabel: string;
      /** How many results the source returned. */
      found: number;
      /** How many became new suggestions to review. */
      added: number;
      skipped: {
        /** Already a prospect of this offering. */
        alreadyProspect: number;
        /** Already waiting in the review list, or returned twice in this run. */
        alreadyInReview: number;
        /** Did not fit the approved ICP; `icpReasons` says why, most common first. */
        icp: number;
        icpReasons: string[];
        /** Records that did not match the agreed shape and were dropped. */
        unreadable: number;
      };
      /** Paid lookups this run spent, when the source reported it. */
      unitsSpent: number | null;
      /** Sources asked in this run that did not answer, in the gateway's words. */
      providerIssues: { id: string; status: "needs_setup" | "unavailable" | "quota" }[];
      /** DISC-DATA-P0-05.1: the search as it was run, when it may be saved to run
       * weekly (a free WorksLake source). Absent for a paid source or the AI web search. */
      weekly?: { sourceId: string; what: string; where: string; companySize?: string; hasWebsite?: boolean };
    }
  | {
      status: "failed";
      reason: "needs_setup" | "unavailable" | "quota" | "invalid" | "error";
      message: string;
    };

export type FindState = FindOutcome | null;

const RESET_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** "12 Dec 2026, 12:00 am UTC" -- when a quota resets, as the gateway reported it. */
export function formatResetTime(resetAt: string | null): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  return Number.isNaN(date.getTime()) ? null : RESET_FORMAT.format(date);
}

/** The one line shown when the gateway refused or failed. Fixed wording: nothing the
 * gateway sent is echoed into it. */
export function gatewayFailureMessage(
  failure: "needs_setup" | "unavailable" | "quota" | "forbidden",
  resetAt: string | null,
  quota?: DataSourceQuota | null,
): string {
  if (failure === "needs_setup" || failure === "forbidden") {
    return "Needs setup: the WorksLake connection isn't set up for this workspace yet.";
  }
  if (failure === "quota") {
    const limit = quota ? ` of ${quota.search.limit} searches and ${quota.paid.limit} paid lookups a ${quota.period}` : "";
    const reset = formatResetTime(resetAt);
    return `This business has reached its lookup limit${limit}. ${reset ? `It resets on ${reset}.` : "Try again later."}`;
  }
  return "Unavailable: WorksLake didn't answer. Nothing was added. Try again in a few minutes.";
}

/**
 * DISC-DATA-P0-04.1/04.2: what a lookup a person asked for on the prospect page reports
 * back ("Fill missing details", "Find contacts"). `failed` covers everything that did
 * not complete, with the reason in `message`; it is never shown as success.
 */
export type LookupState = { status: "completed" | "failed"; message: string } | null;

/** What the confirmation shows before a paid lookup: the paid lookups the business has
 * left, as the gateway reports them, or why they cannot be read. Never estimated. */
export type LookupQuotaState =
  | { state: "ok"; period: string; paid: { limit: number; remaining: number } }
  | { state: "needs_setup" | "unavailable" | "quota"; message: string };

/**
 * DISC-DATA-P0-05.1: a Find search an offering runs again every week
 * (`discovery.saved_searches`, one per offering).
 */
export const SAVED_SEARCH_INTERVAL_DAYS = 7;

export type SavedSearch = {
  id: string;
  workspace_id: string;
  kind: "company" | "channel";
  request: unknown;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_result: unknown;
  created_at: string;
};

/** What the last weekly run did. A failed run says why; it is never shown as a result. */
export type SavedSearchLastResult =
  | { status: "completed"; found: number; added: number }
  | { status: "failed"; message: string };

/** What the Find page shows about the saved search. */
export type SavedSearchSummary = {
  what: string;
  where: string;
  sourceId: string;
  enabled: boolean;
  lastRunAt: string | null;
  /** Null while paused. */
  nextRunAt: string | null;
  lastResult: SavedSearchLastResult | null;
};

export type SaveWeeklySearchOutcome =
  | { status: "saved" }
  /** One is already saved; nothing changed. The page asks before replacing it. */
  | { status: "exists" }
  | { status: "refused"; message: string };

export type SaveWeeklySearchState = SaveWeeklySearchOutcome | { status: "failed"; message: string } | null;

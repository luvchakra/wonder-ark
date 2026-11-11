import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { listSources, type GatewaySource } from "./workslake-client";
import {
  FILE_IMPORT_SOURCE_ID,
  FILE_IMPORT_SOURCE_LABEL,
  SIGNAL_SOURCE_KIND,
  STORED_SOURCE_ID,
  STORED_SOURCE_LABEL,
  WEB_SEARCH_SOURCE_ID,
  WEB_SEARCH_SOURCE_LABEL,
  type DataSource,
  type DataSourceList,
  type DataSourceStatus,
} from "./types";

/**
 * DISC-DATA-P0-02.2: the one list of prospect sources the UI builds from.
 *
 * It is the gateway's own answer to "what can this key use right now" (GET
 * /v1/prospects/sources), plus the two sources Discovery already had: the AI web search
 * (`discoverProspects`) and the file import. Nothing about a gateway source is decided
 * here: its label, status, cost and attribution are the gateway's.
 *
 * When the gateway is not set up, or does not answer, the list still carries one entry
 * for it, marked "Needs setup" or "Unavailable", so the screen says why it cannot be
 * chosen. The two local sources are unaffected and keep working.
 */

/** The existing AI web search. Its own checks (an approved ICP, a connected AI provider,
 * the per-workspace lock, the cost cap) run when it runs, as before. */
const WEB_SEARCH: DataSource = {
  id: WEB_SEARCH_SOURCE_ID,
  provider: null,
  origin: "local",
  action: "search",
  label: WEB_SEARCH_SOURCE_LABEL,
  kinds: ["business"],
  status: "active",
  paid: false,
  attribution: null,
  coverage: [],
};

const FILE_IMPORT: DataSource = {
  id: FILE_IMPORT_SOURCE_ID,
  provider: null,
  origin: "local",
  action: "import",
  label: FILE_IMPORT_SOURCE_LABEL,
  kinds: ["business"],
  status: "active",
  paid: false,
  attribution: null,
  coverage: [],
};

export const LOCAL_DATA_SOURCES: readonly DataSource[] = [WEB_SEARCH, FILE_IMPORT];

/** Stands in for the gateway's sources when it could not list them. It can never be run:
 * its status is never "active". */
function gatewayPlaceholder(status: Exclude<DataSourceStatus, "active">): DataSource {
  return {
    id: STORED_SOURCE_ID,
    provider: STORED_SOURCE_ID,
    origin: "gateway",
    action: "search",
    label: STORED_SOURCE_LABEL,
    kinds: ["business"],
    status,
    paid: false,
    attribution: null,
    coverage: [],
  };
}

/** One gateway source becomes a search entry, a signals entry, or both, by its `kinds`. */
export function fromGatewaySource(source: GatewaySource): DataSource[] {
  const base = {
    provider: source.id,
    origin: "gateway" as const,
    label: source.label,
    kinds: source.kinds,
    status: source.status,
    paid: source.paid,
    attribution: source.attribution || null,
    coverage: source.coverage,
  };
  const entries: DataSource[] = [];
  if (source.kinds.some((kind) => kind !== SIGNAL_SOURCE_KIND)) {
    entries.push({ ...base, id: source.id, action: "search" });
  }
  if (source.kinds.includes(SIGNAL_SOURCE_KIND)) {
    entries.push({ ...base, id: `signals:${source.id}`, action: "signals" });
  }
  return entries;
}

/**
 * The sources this workspace can use. The tenant sent to the gateway is the business the
 * workspace belongs to, read here through the caller's own access: a workspace the
 * caller cannot read resolves to no business and the call is refused.
 */
export async function listDataSources(workspaceId: string): Promise<DataSourceList> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");

  const result = await listSources({ tenantId: businessId });
  if (!result.ok) {
    // A key the gateway refuses (401/403) is a setup problem, not an outage.
    const state = result.failure === "forbidden" ? "needs_setup" : result.failure;
    return {
      sources: [gatewayPlaceholder(state === "needs_setup" ? "needs_setup" : "unavailable"), ...LOCAL_DATA_SOURCES],
      quota: null,
      gateway: { state, resetAt: result.resetAt },
    };
  }

  return {
    sources: [...result.data.sources.flatMap(fromGatewaySource), ...LOCAL_DATA_SOURCES],
    quota: result.data.quota,
    gateway: { state: "ok", resetAt: null },
  };
}

import { readIdealUser, type AudienceType } from "../icp/audience";
import type { IcpProfile } from "../icp/types";
import { runFind } from "./find";
import { listDataSources } from "./index";
import { saveWeeklySearch } from "./saved-searches";
import { STORED_SOURCE_ID, WEB_SEARCH_SOURCE_ID, sourcesForTarget, type DataSource, type FindTarget } from "./types";

/**
 * DISC-AUTO-P0-02.1: the search that starts by itself when the ideal customer is approved
 * (owner-approved redesign, 2026-11-22: "approving setup starts the first search; it
 * repeats weekly"). It searches what the person approved and nothing else: the ideal
 * customer's industries and places for companies, the Ideal user's interests and online
 * places for channels. If that gives nothing to search for, it doesn't search and says why.
 * What it finds waits on To do for the person to approve; nothing is added on its own.
 */
export type FirstSearchResult =
  | { status: "searched"; added: number; sourceLabel: string; weekly: boolean }
  | { status: "not_run"; message: string };

/** The Find page's default source: stored WorksLake data, then a free WorksLake search,
 * then the AI web search, then any active source. */
export function defaultSource(sources: DataSource[], target: FindTarget): DataSource | undefined {
  const usable = sourcesForTarget(sources.filter((s) => s.action !== "import"), target).filter((s) => s.status === "active");
  return (
    usable.find((s) => s.id === STORED_SOURCE_ID) ??
    usable.find((s) => s.origin === "gateway" && s.action === "search" && !s.paid) ??
    usable.find((s) => s.id === WEB_SEARCH_SOURCE_ID) ??
    usable[0]
  );
}

/** What to search for, from the approved ideal customer only. */
export function firstSearchQuery(icp: Pick<IcpProfile, "industries" | "geographies" | "audience">, audienceType: AudienceType): { target: FindTarget; what: string; where: string } {
  const where = icp.geographies.join("; ");
  if (audienceType === "consumer") {
    const idealUser = readIdealUser(icp.audience);
    return { target: "channels", what: idealUser ? [...idealUser.interests, ...idealUser.online_places].join(", ") : "", where };
  }
  return { target: "companies", what: icp.industries.join(", "), where };
}

export async function runFirstSearch(
  workspaceId: string,
  icp: Pick<IcpProfile, "status" | "industries" | "geographies" | "audience">,
  audienceType: AudienceType,
): Promise<FirstSearchResult> {
  if (icp.status !== "approved") return { status: "not_run", message: "The ideal customer isn't approved yet." };
  const query = firstSearchQuery(icp, audienceType);
  if (!query.what.trim()) {
    return { status: "not_run", message: "Your ideal customer names nothing to search for yet. Add industries (or interests) in Setup, or use Find more prospects." };
  }
  const list = await listDataSources(workspaceId);
  const source = defaultSource(list.sources, query.target);
  if (!source) return { status: "not_run", message: "Needs setup: no source to search is connected yet." };

  const outcome = await runFind(workspaceId, { sourceId: source.id, target: query.target, what: query.what, where: query.where });
  if (outcome.status === "failed") return { status: "not_run", message: outcome.message };

  // A free WorksLake search repeats weekly. An offering has one weekly search: an existing
  // one is kept.
  let weekly = false;
  if (outcome.weekly) {
    const saved = await saveWeeklySearch(workspaceId, { ...outcome.weekly }, { replace: false }).catch(() => null);
    weekly = saved?.status === "saved";
  }
  return { status: "searched", added: outcome.added, sourceLabel: outcome.sourceLabel, weekly };
}

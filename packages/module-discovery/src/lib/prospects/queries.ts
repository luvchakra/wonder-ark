import { createClient } from "../../db/server";
import type { Prospect, ProspectStatus, ProspectSuggestion } from "./types";
import {
  deriveProspectPipelineState,
  isFollowUpDue,
  latestTimestamp,
  PROSPECT_STAGES,
  type ProspectPipelineState,
  type ProspectStage,
} from "./pipeline";

export type ProspectWithPipeline = Prospect & ProspectPipelineState;

export type ProspectFilters = {
  status?: ProspectStatus;
  industry?: string;
  search?: string;
  stage?: ProspectStage;
  /** DISC-NAV-P0-01.2: only prospects whose follow-up is due (`isFollowUpDue`). */
  followUpDue?: boolean;
};

export type ProspectSort = "recent" | "stage" | "priority";

/** Row shape after embedding the child tables listProspects joins for pipeline state --
 * prospect_research is `unique` on prospect_id (schema-enforced one-to-one) so
 * PostgREST embeds it as a single object; prospect_scores is append-only (R8, no
 * longer unique) and outreach_strategies/messages/conversations never were, so all four
 * come back as arrays and the latest one is picked in deriveRow below. */
type ProspectPipelineRow = Prospect & {
  prospect_research: { researched_at: string } | null;
  prospect_scores: { created_at: string }[];
  outreach_strategies: { status: "draft" | "approved"; updated_at: string }[];
  messages: {
    status: "draft" | "approved" | "sent" | "failed";
    created_at: string;
    sent_at: string | null;
  }[];
  conversations: { status: "awaiting_reply" | "replied" | "closed"; last_message_at: string }[];
};

function latestBy<T>(rows: T[], key: keyof T): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) =>
    (row[key] as string) > (latest[key] as string) ? row : latest,
  );
}

function deriveRow(row: ProspectPipelineRow): ProspectWithPipeline {
  const latestScore = latestBy(row.prospect_scores, "created_at");
  const latestStrategy = latestBy(row.outreach_strategies, "updated_at");
  const latestMessage = latestBy(row.messages, "created_at");
  const latestConversation = latestBy(row.conversations, "last_message_at");

  const state = deriveProspectPipelineState({
    hasResearch: row.prospect_research !== null,
    hasScore: latestScore !== null,
    latestStrategyStatus: latestStrategy?.status ?? null,
    hasUnsentMessage: row.messages.some((m) => m.status !== "sent"),
    hasFailedMessage: row.messages.some((m) => m.status === "failed"),
    hasSentMessage: row.messages.some((m) => m.status === "sent"),
    latestConversationStatus: latestConversation?.status ?? null,
    lastActivityAt: latestTimestamp(
      row.updated_at,
      row.prospect_research?.researched_at,
      latestScore?.created_at,
      latestStrategy?.updated_at,
      latestMessage?.created_at,
      latestMessage?.sent_at,
      latestConversation?.last_message_at,
    ),
  });

  // Structurally satisfies ProspectWithPipeline (Prospect & ProspectPipelineState) even
  // though the embedded child-table fields ride along at runtime -- nothing downstream
  // reads them.
  return { ...row, ...state };
}

const PIPELINE_SELECT =
  "*, prospect_research(researched_at), prospect_scores(created_at), " +
  "outreach_strategies(status, updated_at), messages(status, created_at, sent_at), " +
  "conversations(status, last_message_at)";

/**
 * Pipeline stage/next-action are computed here, not stored -- no new AI call, just this
 * join/aggregate (docs/prospects-pipeline-redesign-requirements.md R3). `stage` isn't a
 * DB column, so filtering and stage-sorting happen in application code after fetching;
 * fine at this app's scale (a solo founder's own pipeline, no pagination exists here
 * today either).
 */
export async function listProspects(
  workspaceId: string,
  filters: ProspectFilters = {},
  sort: ProspectSort = "recent",
): Promise<ProspectWithPipeline[]> {
  const supabase = await createClient();
  let query = supabase.from("prospects").select(PIPELINE_SELECT).eq("workspace_id", workspaceId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.industry) query = query.eq("industry", filters.industry);
  if (filters.search) query = query.ilike("company_name", `%${filters.search}%`);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;

  let prospects = (data as unknown as ProspectPipelineRow[]).map(deriveRow);

  if (filters.stage) prospects = prospects.filter((p) => p.stage === filters.stage);
  if (filters.followUpDue) prospects = prospects.filter(isFollowUpDue);

  if (sort === "stage") {
    prospects = [...prospects].sort(
      (a, b) => PROSPECT_STAGES.indexOf(a.stage) - PROSPECT_STAGES.indexOf(b.stage),
    );
  }

  // R7: a work queue ordered by fit_score desc, with prospects that still need a next
  // action surfaced ahead of ones that don't (sent -- waiting on the prospect -- or
  // closed) regardless of score, since there's nothing to act on there anyway.
  if (sort === "priority") {
    prospects = [...prospects].sort((a, b) => {
      const aNeedsAction = a.nextAction !== null;
      const bNeedsAction = b.nextAction !== null;
      if (aNeedsAction !== bNeedsAction) return aNeedsAction ? -1 : 1;
      return (b.fit_score ?? -1) - (a.fit_score ?? -1);
    });
  }

  return prospects;
}

/**
 * Same shape as listProspects, batched across every workspace at once -- used by the
 * dashboard's account-wide conversion funnel, which otherwise queried once per workspace
 * only to concatenate the results anyway. No filters/sort: the dashboard only ever needs
 * the full unfiltered set to compute funnel counts from.
 */
export async function listProspectsForWorkspaces(
  workspaceIds: string[],
): Promise<ProspectWithPipeline[]> {
  if (workspaceIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select(PIPELINE_SELECT)
    .in("workspace_id", workspaceIds);
  if (error) throw error;

  return (data as unknown as ProspectPipelineRow[]).map(deriveRow);
}

export async function getProspect(prospectId: string): Promise<Prospect | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The single most recently created prospect in a workspace -- used right after
 * approveProspectSuggestions() inserts exactly one (the auto-populate flow's own
 * `discoverProspects(workspaceId, undefined, 1)` call), to carry that same row through
 * Research/Score/Strategy/Message without approveProspectSuggestions itself needing to
 * change its own `number`-count return shape for its other caller (the manual Discover
 * page's bulk-approve). */
export async function getMostRecentProspect(workspaceId: string): Promise<Prospect | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Distinct industry values currently in use, for the filter dropdown. */
export async function listProspectIndustries(workspaceId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("industry")
    .eq("workspace_id", workspaceId)
    .not("industry", "is", null);
  if (error) throw error;
  const values = new Set((data ?? []).map((row) => row.industry as string));
  return Array.from(values).sort();
}

export type ProspectCounts = {
  total: number;
  new: number;
  qualified: number;
  disqualified: number;
};

/** Cheap status counts for dashboard KPIs -- no pipeline join, just the status column. */
export async function getProspectCounts(workspaceId: string): Promise<ProspectCounts> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("status")
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  const counts: ProspectCounts = { total: data.length, new: 0, qualified: 0, disqualified: 0 };
  for (const row of data as { status: ProspectStatus }[]) counts[row.status] += 1;
  return counts;
}

/**
 * Same counts as getProspectCounts, batched across every workspace at once -- one round
 * trip instead of one per workspace. The dashboard (aggregating across every business/
 * product on the account) is the reason this exists; RLS still filters every row exactly
 * as it would per-workspace, so batching the query changes nothing about who can see
 * what, only how many round trips it costs.
 */
export async function getProspectCountsForWorkspaces(
  workspaceIds: string[],
): Promise<Record<string, ProspectCounts>> {
  const result: Record<string, ProspectCounts> = {};
  if (workspaceIds.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("workspace_id, status")
    .in("workspace_id", workspaceIds);
  if (error) throw error;

  for (const row of data as { workspace_id: string; status: ProspectStatus }[]) {
    const counts = (result[row.workspace_id] ??= {
      total: 0,
      new: 0,
      qualified: 0,
      disqualified: 0,
    });
    counts.total += 1;
    counts[row.status] += 1;
  }
  return result;
}

export async function listProspectSuggestions(
  workspaceId: string,
): Promise<ProspectSuggestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_suggestions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** DISC-NAV-P0-01.2: how many suggestions are waiting on the Find page's "To review"
 * list -- the same rows `listProspectSuggestions` returns, counted without loading them. */
export async function countProspectSuggestions(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("prospect_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return count ?? 0;
}

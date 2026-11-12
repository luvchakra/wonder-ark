// EXP-DISC-01/02/03/10/11/12 -- export-only reads for Discovery customer acquisition.
//
// Discovery's own queries are protected (docs/plan/13-DATA-EXPORT-BACKLOG.md §3): nothing
// here changes them. Each function below applies *the same predicates* as the page query
// it names, but pages through PostgREST's 1,000-row cap with `fetchAllRows` in a stable
// order ending in `id`, so "all matching records" is never quietly cut short (§37).
import { fetchAllRows } from "@cofounderai/core/exports/fetch-all";
import { createClient } from "../../db/server";
import type { PerformanceAnalysisRawData } from "../../lib/performance-analysis/analysis";
import type { PipelineRun } from "../../lib/pipeline/types";
import {
  deriveProspectPipelineState,
  latestTimestamp,
  PROSPECT_STAGES,
} from "../../lib/prospects/pipeline";
import type {
  ProspectCounts,
  ProspectFilters,
  ProspectSort,
  ProspectWithPipeline,
} from "../../lib/prospects/queries";
import type { Prospect, ProspectStatus } from "../../lib/prospects/types";

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Same embed as lib/prospects/queries.ts#listProspects (PIPELINE_SELECT). */
const PIPELINE_SELECT =
  "*, prospect_research(researched_at), prospect_scores(created_at), " +
  "outreach_strategies(status, updated_at), messages(status, created_at, sent_at), " +
  "conversations(status, last_message_at), outreach_enrollments(status)";

type ProspectPipelineRow = Prospect & {
  outreach_enrollments?: { status: string }[];
  prospect_research: { researched_at: string } | null;
  prospect_scores: { created_at: string }[];
  outreach_strategies: { status: "draft" | "approved"; updated_at: string }[];
  messages: { status: "draft" | "approved" | "sent" | "failed"; created_at: string; sent_at: string | null }[];
  conversations: { status: "awaiting_reply" | "replied" | "closed"; last_message_at: string }[];
};

/** A prospects-list row plus the research date the pipeline join already carries. */
export type ProspectExportRow = ProspectWithPipeline & { researchedAt: string | null };

function latestBy<T>(rows: T[], key: keyof T): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) => ((row[key] as string) > (latest[key] as string) ? row : latest));
}

/** Mirrors listProspects' own `deriveRow` exactly (kept in step by queries.test.ts, which
 * runs both against the same rows). */
function deriveRow(row: ProspectPipelineRow): ProspectExportRow {
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

  // DISC-CAMP-P0-04.1: as listProspects derives it.
  const inActiveCampaign = (row.outreach_enrollments ?? []).some((enrollment) => enrollment.status === "active");
  return { ...row, ...state, inActiveCampaign, researchedAt: row.prospect_research?.researched_at ?? null };
}

/**
 * EXP-DISC-03 -- lib/prospects/queries.ts#listProspects for export: the same filters
 * (status, industry, search on the DB; stage in application code, since it is derived),
 * the same three sort modes, with no row cap. Takes several workspaces so the dashboard
 * (EXP-DISC-02) can use it the way its page uses listProspectsForWorkspaces.
 */
export async function listProspectsForExport(
  workspaceIds: string[],
  filters: ProspectFilters = {},
  sort: ProspectSort = "recent",
): Promise<ProspectExportRow[]> {
  if (workspaceIds.length === 0) return [];
  const supabase = await createClient();
  const rows = await fetchAllRows<ProspectPipelineRow>((from, to) => {
    let query = supabase.from("prospects").select(PIPELINE_SELECT).in("workspace_id", workspaceIds);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.industry) query = query.eq("industry", filters.industry);
    if (filters.search) query = query.ilike("company_name", `%${filters.search}%`);
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to) as unknown as Page<ProspectPipelineRow>;
  });

  let prospects = rows.map(deriveRow);
  if (filters.stage) prospects = prospects.filter((p) => p.stage === filters.stage);

  if (sort === "stage") {
    prospects = [...prospects].sort((a, b) => PROSPECT_STAGES.indexOf(a.stage) - PROSPECT_STAGES.indexOf(b.stage));
  }
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

/** EXP-DISC-01 -- lib/prospects/queries.ts#getProspectCountsForWorkspaces without the cap:
 * status counts per workspace. */
export async function getProspectCountsForExport(workspaceIds: string[]): Promise<Record<string, ProspectCounts>> {
  const result: Record<string, ProspectCounts> = {};
  if (workspaceIds.length === 0) return result;
  const supabase = await createClient();
  const rows = await fetchAllRows<{ workspace_id: string; status: ProspectStatus }>(
    (from, to) =>
      supabase
        .from("prospects")
        .select("id, workspace_id, status")
        .in("workspace_id", workspaceIds)
        .order("id", { ascending: true })
        .range(from, to) as unknown as Page<{ workspace_id: string; status: ProspectStatus }>,
  );
  for (const row of rows) {
    const counts = (result[row.workspace_id] ??= { total: 0, new: 0, qualified: 0, disqualified: 0 });
    counts.total += 1;
    counts[row.status] += 1;
  }
  return result;
}

/** EXP-DISC-12 -- lib/pipeline/queries.ts#listPipelineRuns without its 50-row limit, for
 * "All matching records". */
export async function listPipelineRunsForExport(workspaceId: string): Promise<PipelineRun[]> {
  const supabase = await createClient();
  return fetchAllRows<PipelineRun>(
    (from, to) =>
      supabase
        .from("pipeline_runs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to) as unknown as Page<PipelineRun>,
  );
}

/** The evidence rows behind the performance analysis -- a superset of
 * PerformanceAnalysisRawData's columns, so the same pure analysis runs on it. */
export type PerformanceExportRawData = {
  prospects: (PerformanceAnalysisRawData["prospects"][number] & { company_name: string })[];
  signals: (PerformanceAnalysisRawData["signals"][number] & {
    id: string;
    signal_type: string;
    source: string | null;
    observed_at: string;
  })[];
  conversations: (PerformanceAnalysisRawData["conversations"][number] & { id: string; channel: string })[];
  contacts: PerformanceAnalysisRawData["contacts"];
  opportunities: PerformanceAnalysisRawData["opportunities"];
  definitions: PerformanceAnalysisRawData["definitions"];
};

/** EXP-DISC-11 -- lib/performance-analysis/queries.ts#getPerformanceAnalysisRawData
 * without the cap: the same four workspace-scoped tables, plus the columns a person needs
 * to read each evidence row (company name, signal type/source/date, channel). */
export async function getPerformanceAnalysisRawDataForExport(workspaceId: string): Promise<PerformanceExportRawData> {
  const supabase = await createClient();
  const all = <T>(table: string, columns: string) =>
    fetchAllRows<T>(
      (from, to) =>
        supabase
          .from(table)
          .select(columns)
          .eq("workspace_id", workspaceId)
          .order("id", { ascending: true })
          .range(from, to) as unknown as Page<T>,
    );
  const [prospects, signals, conversations, contacts] = await Promise.all([
    all<PerformanceExportRawData["prospects"][number]>("prospects", "id, company_name, industry, location, fit_score, outcome"),
    all<PerformanceExportRawData["signals"][number]>("signals", "id, prospect_id, signal_type, description, source, observed_at"),
    all<PerformanceExportRawData["conversations"][number]>("conversations", "id, prospect_id, contact_id, channel, status"),
    all<PerformanceExportRawData["contacts"][number]>("contacts", "id, job_title"),
  ]);
  const [opportunities, definitions] = await Promise.all([
    all<PerformanceExportRawData["opportunities"][number] & { id: string }>("opportunities", "id, discovery_definition_id, status"),
    all<PerformanceExportRawData["definitions"][number]>("discovery_definitions", "id, name"),
  ]);
  return { prospects, signals, conversations, contacts, opportunities, definitions };
}

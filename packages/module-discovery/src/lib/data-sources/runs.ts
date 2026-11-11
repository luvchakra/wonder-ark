import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { hashInput } from "../ai/hash";

/**
 * DISC-DATA-P0-02.3: every gateway call that searches or looks something up is recorded
 * in `discovery.ai_runs`, the ledger Usage and History already read, so a search of
 * stored business data sits beside an AI web search instead of in a second trace
 * (CLAUDE.md, AI rule 6). The row says which source was asked, how many results came
 * back and how many lookup units were spent.
 *
 * `model`, `provider` and `prompt_version` are required columns written for an AI call;
 * a gateway run fills them with fixed names for the gateway and its contract version.
 * `estimated_cost` stays null: the gateway is paid for in lookup units, not AI spend.
 *
 * The request is hashed, never stored, and the ledger keeps no result content.
 */
export const GATEWAY_RUN_MODEL = "workslake-gateway";
export const GATEWAY_RUN_PROVIDER = "workslake";
export const GATEWAY_CONTRACT_VERSION = "prospects-api-v1";

export type DataSourceOperation =
  | "gateway_search"
  | "gateway_signals"
  | "gateway_enrich"
  | "gateway_contacts";

function runHash(request: unknown): string {
  return hashInput({ request, version: GATEWAY_CONTRACT_VERSION });
}

/** Like `recordAiRun`, a failure to write the ledger is logged and never breaks the
 * search it describes. `client` is for a caller with no signed-in user (the domain-events
 * drain); everything else writes as the person, through RLS. */
export async function recordDataSourceRun(input: {
  workspaceId: string;
  operation: DataSourceOperation;
  /** The source id that was asked, e.g. "stored". */
  source: string;
  request: unknown;
  status: "succeeded" | "failed";
  resultCount?: number;
  unitsSpent?: number | null;
  durationMs?: number;
  errorCode?: string;
  client?: SupabaseClient;
}): Promise<void> {
  const supabase = input.client ?? (await createClient());
  const { error } = await supabase.from("ai_runs").insert({
    workspace_id: input.workspaceId,
    operation: input.operation,
    model: GATEWAY_RUN_MODEL,
    provider: GATEWAY_RUN_PROVIDER,
    prompt_version: GATEWAY_CONTRACT_VERSION,
    input_hash: runHash(input.request),
    status: input.status,
    source: input.source,
    result_count: input.resultCount ?? null,
    units_spent: input.unitsSpent ?? null,
    duration_ms: input.durationMs ?? null,
    error_code: input.errorCode ?? null,
  });
  if (error) console.error("Failed to record a data-source run:", error.message);
}

/**
 * DISC-DATA-P0-04.1/04.2: the latest recorded run of `operation` for exactly this
 * `request`, or null. A lookup records itself under a key that names what it is for (a
 * prospect, and for a paid lookup the one click that asked for it), so the ledger is also
 * what says "this was already done": a replayed job or a second click finds the first
 * run here and does not ask the gateway again. Uses `ai_runs_cache_lookup_idx`.
 */
export async function findDataSourceRun(
  workspaceId: string,
  operation: DataSourceOperation,
  request: unknown,
  client?: SupabaseClient,
): Promise<{ status: "succeeded" | "failed"; createdAt: string; resultCount: number | null; unitsSpent: number | null; errorCode: string | null } | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("ai_runs")
    .select("status, created_at, result_count, units_spent, error_code")
    .eq("workspace_id", workspaceId)
    .eq("operation", operation)
    .eq("input_hash", runHash(request))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    status: data.status,
    createdAt: data.created_at,
    resultCount: data.result_count,
    unitsSpent: data.units_spent,
    errorCode: data.error_code,
  };
}

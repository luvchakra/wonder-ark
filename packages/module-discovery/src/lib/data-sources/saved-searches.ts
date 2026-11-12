import { z } from "zod";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { publish } from "@cofounderai/core/events/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createAdminClient } from "../../db/admin";
import { createClient } from "../../db/server";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { UsageLimitExceededError } from "../usage/limits";
import { runFind, type FindInput } from "./find";
import { listDataSources } from "./index";
import { findDataSourceRun } from "./runs";
import { cleanText } from "./suggestions";
import {
  SAVED_SEARCH_INTERVAL_DAYS,
  type SavedSearch,
  type SavedSearchLastResult,
  type SavedSearchSummary,
  type SaveWeeklySearchOutcome,
} from "./types";

/**
 * DISC-DATA-P0-05.1: a Find search an offering runs again every week.
 *
 * What this code decides, whoever or whatever asks:
 *  - only a person saves, replaces, pauses or resumes one, on the Find page, and only
 *    for a free gateway source that is active at that moment. One per offering;
 *  - the cron route only queues: it publishes one `discovery.saved_search.run_requested`
 *    event per due search through `core.domain_events`, and moves the search's next run
 *    a week on in the same step, so two overlapping invocations queue it once;
 *  - the drain runs it with the service role, for the event's business only, through
 *    the same `runFind` a person's search uses: the monthly usage check, the source's
 *    own status, the ICP pre-filter, the duplicate check, and staging into
 *    `prospect_suggestions`, where a person still approves each one. Free sources only;
 *    a source that has become paid is refused, never spent;
 *  - a run is recorded in the ledger under the search and the date it fell due. A
 *    redelivered event finds that row and asks the gateway nothing, so usage is counted
 *    once, and the unique key on suggestions keeps a repeat from adding a row twice;
 *  - a run that fails is recorded as failed on the search and is not retried: the next
 *    weekly run is the retry. A paused search is not queued, and one paused after it
 *    was queued does not run.
 */

/** Published by the cron route, once per due search; drained by `events/handlers.ts`. */
export const SAVED_SEARCH_RUN_REQUESTED_EVENT = "discovery.saved_search.run_requested";

/** How many due searches one cron invocation queues. The rest wait for the next one. */
export const SAVED_SEARCH_ENQUEUE_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The search as it was asked on Find, kept so each run repeats what the person chose. */
const StoredRequestSchema = z.object({
  sourceId: z.string().min(1).max(200),
  what: z.string().min(1).max(300),
  where: z.string().max(300),
  companySize: z.string().max(200).optional(),
  hasWebsite: z.boolean().optional(),
});
export type StoredSearchRequest = z.infer<typeof StoredRequestSchema>;

function nextRunFrom(from: Date): string {
  return new Date(from.getTime() + SAVED_SEARCH_INTERVAL_DAYS * DAY_MS).toISOString();
}

function readLastResult(value: unknown): SavedSearchLastResult | null {
  const parsed = z
    .union([
      z.object({ status: z.literal("completed"), found: z.number(), added: z.number() }),
      z.object({ status: z.literal("failed"), message: z.string() }),
    ])
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What the Find page shows about the offering's saved search. Null when there is none,
 * or when the stored request cannot be read (it is then treated as absent, never run). */
export function summariseSavedSearch(row: SavedSearch | null): SavedSearchSummary | null {
  if (!row) return null;
  const request = StoredRequestSchema.safeParse(row.request);
  if (!request.success) return null;
  return {
    what: request.data.what,
    where: request.data.where,
    sourceId: request.data.sourceId,
    enabled: row.enabled,
    lastRunAt: row.last_run_at,
    nextRunAt: row.enabled ? row.next_run_at : null,
    lastResult: readLastResult(row.last_result),
  };
}

export async function getSavedSearch(workspaceId: string): Promise<SavedSearch | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_searches").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * "Run this weekly": stores the search that was just run. Refused unless the source is
 * a gateway source that is free and active right now, as the gateway itself lists it.
 * One per offering: with one already saved, nothing changes unless `replace` is set,
 * which the page sets only after the person confirmed.
 */
export async function saveWeeklySearch(
  workspaceId: string,
  input: FindInput,
  options: { replace: boolean },
): Promise<SaveWeeklySearchOutcome> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");

  const what = cleanText(input.what, 300);
  if (!what) return { status: "refused", message: "Enter what to look for, and run the search, before saving it." };

  const list = await listDataSources(workspaceId);
  const source = list.sources.find((entry) => entry.id === input.sourceId);
  if (!source || source.origin !== "gateway" || source.action === "import") {
    return { status: "refused", message: "Only a WorksLake search can run weekly." };
  }
  if (source.paid) {
    return { status: "refused", message: `${source.label} uses paid lookups, which a weekly search never spends.` };
  }
  if (source.status !== "active") {
    return { status: "refused", message: `${source.label} can't be searched right now, so it wasn't saved.` };
  }

  const existing = await getSavedSearch(workspaceId);
  if (existing && !options.replace) return { status: "exists" };

  const request: StoredSearchRequest = {
    sourceId: source.id,
    what,
    where: cleanText(input.where, 300) ?? "",
    ...(cleanText(input.companySize, 200) ? { companySize: cleanText(input.companySize, 200) as string } : {}),
    ...(input.hasWebsite ? { hasWebsite: true } : {}),
  };
  const supabase = await createClient();
  const { error } = await supabase.from("saved_searches").upsert(
    {
      workspace_id: workspaceId,
      kind: "company",
      request,
      enabled: true,
      // The search was run a moment ago, by hand; its first weekly run is a week on.
      last_run_at: null,
      last_result: null,
      next_run_at: nextRunFrom(new Date()),
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw error;
  return { status: "saved" };
}

/** Pause or resume. A resumed search whose next run has passed runs at the next daily
 * check; nothing runs at the moment it is resumed. */
export async function setSavedSearchEnabled(workspaceId: string, enabled: boolean): Promise<void> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");
  const supabase = await createClient();
  const { error } = await supabase.from("saved_searches").update({ enabled }).eq("workspace_id", workspaceId);
  if (error) throw error;
}

/**
 * The cron route's whole job. For each enabled search that is due: move its next run a
 * week on, but only if it still holds the due date that was read (so a second, overlapping
 * invocation claims nothing), then publish its event, gated on the Discovery licence. If
 * the event cannot be published the due date is put back, so the next invocation tries
 * again. Nothing is searched here.
 */
export async function enqueueDueSavedSearches(now: Date = new Date()): Promise<{ queued: number; failed: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("saved_searches")
    .select("id, workspace_id, next_run_at")
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at")
    .limit(SAVED_SEARCH_ENQUEUE_LIMIT);
  if (error) throw error;

  let queued = 0;
  let failed = 0;
  for (const row of (data ?? []) as Pick<SavedSearch, "id" | "workspace_id" | "next_run_at">[]) {
    const dueAt = row.next_run_at;
    if (!dueAt) continue;
    try {
      const businessId = await getBusinessIdForWorkspace(row.workspace_id, admin);
      if (!businessId) continue;
      const { data: claimed, error: claimError } = await admin
        .from("saved_searches")
        .update({ next_run_at: nextRunFrom(now) })
        .eq("id", row.id)
        .eq("enabled", true)
        .eq("next_run_at", dueAt)
        .select("id");
      if (claimError) throw claimError;
      if ((claimed ?? []).length === 0) continue;
      try {
        await publish(
          {
            businessId,
            type: SAVED_SEARCH_RUN_REQUESTED_EVENT,
            payload: { savedSearchId: row.id, dueAt },
            requiredModule: "discovery",
          },
          createCoreAdminClient({ schema: "core" }),
        );
      } catch (publishError) {
        await admin.from("saved_searches").update({ next_run_at: dueAt }).eq("id", row.id);
        throw publishError;
      }
      queued += 1;
    } catch (rowError) {
      failed += 1;
      console.error("Could not queue a saved search:", rowError instanceof Error ? rowError.message : rowError);
    }
  }
  return { queued, failed };
}

export type SavedSearchRunOutcome =
  | { status: "ran"; result: SavedSearchLastResult }
  | { status: "skipped"; reason: "gone" | "paused" | "already_ran" | "wrong_business" };

/**
 * Runs one queued saved search, for the drain. Returns rather than throws for every
 * outcome that retrying would not change, so a failed search is recorded once and the
 * drain does not pile up retries; only a database error on the way throws.
 */
export async function runSavedSearch(
  savedSearchId: string,
  dueAt: string,
  businessId: string,
  now: Date = new Date(),
): Promise<SavedSearchRunOutcome> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("saved_searches").select("*").eq("id", savedSearchId).maybeSingle();
  if (error) throw error;
  const row = data as SavedSearch | null;
  if (!row) return { status: "skipped", reason: "gone" };
  if (!row.enabled) return { status: "skipped", reason: "paused" };
  if ((await getBusinessIdForWorkspace(row.workspace_id, admin)) !== businessId) {
    return { status: "skipped", reason: "wrong_business" };
  }

  const ledgerKey = { lookup: "saved_search", savedSearchId, dueAt };
  for (const operation of ["gateway_search", "gateway_signals"] as const) {
    if (await findDataSourceRun(row.workspace_id, operation, ledgerKey, admin)) {
      return { status: "skipped", reason: "already_ran" };
    }
  }

  let result: SavedSearchLastResult;
  const request = StoredRequestSchema.safeParse(row.request);
  if (!request.success) {
    result = { status: "failed", message: "The saved search couldn't be read. Save it again from Find." };
  } else {
    try {
      const outcome = await runFind(row.workspace_id, request.data, { client: admin, businessId, ledgerKey });
      result =
        outcome.status === "completed"
          ? { status: "completed", found: outcome.found, added: outcome.added }
          : { status: "failed", message: outcome.message };
    } catch (runError) {
      if (!(runError instanceof UsageLimitExceededError)) throw runError;
      result = { status: "failed", message: "This offering's monthly run allowance is used up, so the search didn't run." };
    }
  }

  const { error: saveError } = await admin
    .from("saved_searches")
    .update({ last_run_at: now.toISOString(), last_result: result })
    .eq("id", row.id);
  if (saveError) throw saveError;
  return { status: "ran", result };
}

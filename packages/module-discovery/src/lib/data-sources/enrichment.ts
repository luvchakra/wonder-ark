import type { SupabaseClient } from "@supabase/supabase-js";
import { publish } from "@cofounderai/core/events/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { DiscoveryInProgressError, acquireDiscoveryLock, releaseDiscoveryLock } from "../ai/discovery-lock";
import { extractDomain } from "../prospects/mutations";
import type { Prospect, ProspectFieldSource } from "../prospects/types";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { UsageLimitExceededError, assertWithinUsageLimit } from "../usage/limits";
import { findDataSourceRun, recordDataSourceRun } from "./runs";
import { cleanText, safeHttpUrl } from "./suggestions";
import { gatewayFailureMessage } from "./types";
import {
  ENRICH_FIELDS,
  enrichOrganisation,
  providerIssuesOf,
  type EnrichResponse,
  type GatewayFailure,
  type ProviderIssue,
} from "./workslake-client";

/**
 * DISC-DATA-P0-04.1: filling a prospect's blank details from the WorksLake gateway.
 *
 * What this code decides, whatever the gateway returns:
 *  - only a column that is empty is asked for, and only a column that is still empty
 *    when the answer arrives is written (the write itself is conditional), so a value a
 *    person typed is never replaced, even if they typed it while the lookup ran;
 *  - every column it fills is recorded in `prospects.field_sources` with the source the
 *    gateway named, so the page can say where the value came from;
 *  - a failed lookup writes nothing: the prospect is left exactly as it was;
 *  - what the gateway sends is untrusted text. It is tidied, length-capped and stored as
 *    data; a link is kept only if it is plain http(s), a mailbox only if it is one.
 *
 * Two ways in. Approval queues the free lookup (`allowPaid: false`) through
 * `core.domain_events`; "Fill missing details" on the prospect page is a person's click
 * and may use paid sources (`allowPaid: true`). Nothing here runs on its own beyond the
 * free lookup after an approval (docs/plan/17, Part B guardrails: "Enrichment may run
 * after approval").
 */

/** Published once per approved company suggestion; drained by `events/handlers.ts`. */
export const ENRICHMENT_REQUESTED_EVENT = "discovery.prospect.enrichment_requested";

export type EnrichField = (typeof ENRICH_FIELDS)[number];

/** The prospect column each contract field fills. */
export const ENRICH_COLUMN = {
  industry: "industry",
  employeeRange: "company_size",
  description: "description",
  phone: "phone",
  email: "company_email",
  linkedinUrl: "linkedin_url",
  hq: "location",
} as const satisfies Record<EnrichField, keyof Prospect>;

export type EnrichColumn = (typeof ENRICH_COLUMN)[EnrichField];

/** The words the prospect page uses for each column. */
export const ENRICH_COLUMN_LABEL: Record<EnrichColumn, string> = {
  industry: "Industry",
  company_size: "Company size",
  description: "Description",
  phone: "Phone",
  company_email: "General company email",
  linkedin_url: "Company LinkedIn",
  location: "Location",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The contract fields whose prospect column is empty: the only ones worth asking for. */
export function missingEnrichFields(prospect: Partial<Record<EnrichColumn, string | null | undefined>>): EnrichField[] {
  return ENRICH_FIELDS.filter((field) => !prospect[ENRICH_COLUMN[field]]?.trim());
}

/**
 * One enriched value as it may be stored, or null when it is not usable. The contract
 * types `value` loosely, so each field is read for what its column holds: text for most,
 * a plain http(s) link for LinkedIn, a mailbox for email. A headquarters given as an
 * object is read by its `text`, else its city, region and country.
 */
export function readEnrichedValue(field: EnrichField, value: unknown): string | null {
  if (field === "hq" && isRecord(value)) {
    const text = typeof value.text === "string" ? cleanText(value.text, 200) : null;
    if (text) return text;
    const parts = [value.city, value.region, value.country]
      .map((part) => (typeof part === "string" ? cleanText(part, 100) : null))
      .filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(", ").slice(0, 200) : null;
  }
  if (typeof value !== "string") return null;
  if (field === "linkedinUrl") return safeHttpUrl(value);
  if (field === "email") {
    const email = cleanText(value, 254);
    return email && EMAIL.test(email) ? email : null;
  }
  if (field === "phone") return cleanText(value, 50);
  if (field === "description") return cleanText(value, 2000);
  if (field === "employeeRange") return cleanText(value, 100);
  return cleanText(value, 200);
}

/** What to write for an enrich response: the usable values for the fields that were
 * asked for, each with the source the gateway named. A field that was not asked for is
 * ignored even if the gateway sent it. Pure. */
export function planEnrichment(
  requested: readonly EnrichField[],
  fields: EnrichResponse["fields"],
): { column: EnrichColumn; value: string; source: ProspectFieldSource }[] {
  return requested.flatMap((field) => {
    const entry = fields[field];
    if (!entry) return [];
    const value = readEnrichedValue(field, entry.value);
    const provider = cleanText(entry.source.provider, 100);
    const name = cleanText(entry.source.name, 300);
    // A value that cannot say where it came from cannot be shown with its source, so it
    // is not stored at all.
    if (!value || !provider || !name) return [];
    return [
      {
        column: ENRICH_COLUMN[field],
        value,
        source: { provider, name, url: safeHttpUrl(entry.source.url), observedAt: cleanText(entry.observedAt, 40) },
      },
    ];
  });
}

export type EnrichmentOutcome =
  | {
      status: "completed";
      /** Labels of the columns that were filled, in the page's words. */
      filled: string[];
      unitsSpent: number | null;
      /** Paid lookups the business has left, as the gateway reported after the call. */
      paidRemaining: number | null;
      providerIssues: ProviderIssue[];
    }
  /** Every column a source can fill already has a value. Nothing was asked. */
  | { status: "nothing_to_fill" }
  /** This lookup already ran (a replayed job, or a second click). Nothing was asked. */
  | { status: "already_done" }
  | {
      status: "failed";
      reason: "needs_setup" | "unavailable" | "quota" | "busy" | "not_found" | "save_failed";
      message: string;
    };

function failed(reason: Extract<EnrichmentOutcome, { status: "failed" }>["reason"], message: string): EnrichmentOutcome {
  return { status: "failed", reason, message };
}

function fromGatewayFailure(failure: GatewayFailure): EnrichmentOutcome {
  if (failure.failure === "quota") return failed("quota", gatewayFailureMessage("quota", failure.resetAt));
  if (failure.failure === "needs_setup" || failure.failure === "forbidden") {
    return failed("needs_setup", gatewayFailureMessage("needs_setup", null));
  }
  return failed("unavailable", "Enrichment unavailable: WorksLake didn't answer. Nothing was changed.");
}

/** The ledger key of a prospect's free lookup. One per prospect: the job queued at
 * approval, its immediate attempt and a Retry all share it. */
export function freeEnrichmentKey(prospectId: string) {
  return { lookup: "enrich", prospectId, allowPaid: false };
}

/**
 * Looks up one prospect's missing details and fills the columns that are still empty.
 *
 * `allowPaid: false` is the free lookup: it is skipped when one has already succeeded
 * for the prospect (so the queued job does not repeat what its immediate attempt did)
 * and may be run again after a failure. `allowPaid: true` is a person's click and needs
 * `requestKey`, the key of that one click: a second request with the same key finds the
 * first in the ledger and asks nothing, and the workspace's lookup lock keeps two
 * requests from being in flight at once, so a double click spends units once.
 *
 * `client` is for the domain-events drain, which has no signed-in user; it must pass
 * the event's `businessId` too, which the prospect is checked against.
 */
export async function enrichProspect(
  prospectId: string,
  options: { allowPaid: boolean; requestKey?: string; client?: SupabaseClient; businessId?: string },
): Promise<EnrichmentOutcome> {
  const { allowPaid, client } = options;
  if (allowPaid && !options.requestKey) throw new Error("A paid lookup needs the key of the click that asked for it.");
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase.from("prospects").select("*").eq("id", prospectId).maybeSingle();
  if (error) throw error;
  const prospect = data as Prospect | null;
  if (!prospect) return failed("not_found", "This prospect no longer exists.");
  // A channel is a public outlet, not an organisation: there is nothing to enrich.
  if (prospect.kind === "channel") return { status: "nothing_to_fill" };

  const workspaceId = prospect.workspace_id;
  const businessId = await getBusinessIdForWorkspace(workspaceId, client);
  if (!businessId) return failed("not_found", "This prospect no longer exists.");
  if (client) {
    // No session: the event names the business, and the prospect must belong to it.
    if (options.businessId !== businessId) return failed("not_found", "This prospect no longer exists.");
  } else {
    await requireModule(businessId, "discovery");
  }

  const fields = missingEnrichFields(prospect);
  if (fields.length === 0) return { status: "nothing_to_fill" };

  const key = allowPaid ? { lookup: "enrich", prospectId, allowPaid: true, requestKey: options.requestKey } : freeEnrichmentKey(prospectId);
  const alreadyRan = async () => {
    const prior = await findDataSourceRun(workspaceId, "gateway_enrich", key, client);
    return prior !== null && (allowPaid || prior.status === "succeeded");
  };
  if (await alreadyRan()) return { status: "already_done" };

  await assertWithinUsageLimit(workspaceId, client);

  if (allowPaid) {
    try {
      await acquireDiscoveryLock(workspaceId);
    } catch (lockError) {
      if (lockError instanceof DiscoveryInProgressError) {
        return failed("busy", "Another search or lookup is running for this offering. Nothing was spent. Try again in a moment.");
      }
      throw lockError;
    }
  }
  try {
    // Checked again under the lock: the first of two clicks may have finished meanwhile.
    if (allowPaid && (await alreadyRan())) return { status: "already_done" };

    const domain = prospect.domain ?? (prospect.website ? extractDomain(prospect.website) : null);
    const startedAt = Date.now();
    const result = await enrichOrganisation(
      { tenantId: businessId },
      {
        ...(domain ? { domain } : {}),
        name: prospect.company_name,
        ...(prospect.location ? { location: prospect.location } : {}),
        fields,
        allowPaid,
      },
    );
    const record = (run: { status: "succeeded" | "failed"; resultCount?: number; unitsSpent?: number | null; errorCode?: string }) =>
      recordDataSourceRun({
        workspaceId,
        operation: "gateway_enrich",
        source: "enrich",
        request: key,
        durationMs: Date.now() - startedAt,
        client,
        ...run,
      });

    if (!result.ok) {
      // Nothing is recorded for a request that never left this server.
      if (result.called) await record({ status: "failed", errorCode: result.code });
      return fromGatewayFailure(result);
    }

    const unitsSpent = result.data.usage.unitsSpent;
    let filled: EnrichColumn[];
    try {
      filled = await applyEnrichment(supabase, prospect.id, planEnrichment(fields, result.data.fields));
    } catch (writeError) {
      console.error("Enrichment could not be saved:", writeError instanceof Error ? writeError.message : writeError);
      await record({ status: "failed", unitsSpent, errorCode: "SAVE_FAILED" });
      return failed(
        "save_failed",
        unitsSpent > 0
          ? `The lookup ran and used ${unitsSpent} paid lookup${unitsSpent === 1 ? "" : "s"}, but what it found couldn't be saved.`
          : "The lookup ran, but what it found couldn't be saved.",
      );
    }

    await record({ status: "succeeded", resultCount: filled.length, unitsSpent });
    return {
      status: "completed",
      filled: filled.map((column) => ENRICH_COLUMN_LABEL[column]),
      unitsSpent,
      paidRemaining: result.data.usage.tenantRemaining.paid,
      providerIssues: providerIssuesOf(result.data.metadata),
    };
  } finally {
    if (allowPaid) await releaseDiscoveryLock(workspaceId);
  }
}

/**
 * Writes each planned value into its column only if the column is still empty, then
 * notes the columns that were filled in `field_sources`. Returns those columns.
 */
async function applyEnrichment(
  supabase: SupabaseClient,
  prospectId: string,
  plan: ReturnType<typeof planEnrichment>,
): Promise<EnrichColumn[]> {
  const filled: Record<string, ProspectFieldSource> = {};
  for (const { column, value, source } of plan) {
    const { data, error } = await supabase
      .from("prospects")
      .update({ [column]: value })
      .eq("id", prospectId)
      // The guard that keeps a typed value: no row matches once the column holds one.
      .is(column, null)
      .select("id");
    if (error) throw error;
    if ((data ?? []).length > 0) filled[column] = source;
  }
  const columns = Object.keys(filled) as EnrichColumn[];
  if (columns.length === 0) return [];

  const { data: current, error: readError } = await supabase
    .from("prospects")
    .select("field_sources")
    .eq("id", prospectId)
    .single();
  if (readError) throw readError;
  const existing = isRecord(current?.field_sources) ? current.field_sources : {};
  const { error: sourcesError } = await supabase
    .from("prospects")
    .update({ field_sources: { ...existing, ...filled } })
    .eq("id", prospectId);
  if (sourcesError) throw sourcesError;
  return columns;
}

/**
 * DISC-DATA-P0-04.1: queues the free lookup for newly approved company prospects, one
 * event each, parked by the drain if the business has no Discovery licence.
 */
export async function queueProspectEnrichment(workspaceId: string, prospectIds: string[]): Promise<void> {
  if (prospectIds.length === 0) return;
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  for (const prospectId of prospectIds) {
    await publish({
      businessId,
      type: ENRICHMENT_REQUESTED_EVENT,
      payload: { prospectId },
      requiredModule: "discovery",
    });
  }
}

/** How many free lookups run side by side right after an approval. */
const IMMEDIATE_ENRICHMENT_CONCURRENCY = 5;

/**
 * Runs the free lookup for each prospect straight away, as the person who approved them.
 * The drain runs once a day, so without this a blank would wait until tomorrow; each
 * prospect's queued event still stands behind it and finds the work done (or retries it
 * if this attempt failed). Never throws: a failure is logged and left to the queue.
 */
export async function runQueuedEnrichmentNow(prospectIds: string[]): Promise<void> {
  for (let i = 0; i < prospectIds.length; i += IMMEDIATE_ENRICHMENT_CONCURRENCY) {
    await Promise.all(
      prospectIds.slice(i, i + IMMEDIATE_ENRICHMENT_CONCURRENCY).map(async (prospectId) => {
        try {
          await enrichProspect(prospectId, { allowPaid: false });
        } catch (error) {
          if (error instanceof UsageLimitExceededError) return;
          console.error("Enrichment after approval failed:", error instanceof Error ? error.message : error);
        }
      }),
    );
  }
}

/**
 * Whether the prospect's free lookup last failed, for the prospect page's "Enrichment
 * unavailable" line and its Retry. Null when it never ran, or never reached the gateway.
 */
export async function getEnrichmentState(prospect: Pick<Prospect, "id" | "workspace_id">): Promise<"succeeded" | "failed" | null> {
  const run = await findDataSourceRun(prospect.workspace_id, "gateway_enrich", freeEnrichmentKey(prospect.id));
  return run?.status ?? null;
}

/** The line shown after a lookup a person asked for. Fixed wording: nothing the gateway
 * sent is echoed into it but the labels of the columns this code filled. */
export function enrichmentMessage(outcome: EnrichmentOutcome): string {
  if (outcome.status === "failed") return outcome.message;
  if (outcome.status === "nothing_to_fill") return "Every detail a source can fill already has a value.";
  if (outcome.status === "already_done") return "This lookup already ran. Nothing more was spent.";

  const found = outcome.filled.length > 0 ? `Filled: ${outcome.filled.join(", ")}.` : "Nothing new was found for the missing details.";
  const spent =
    outcome.unitsSpent === null
      ? ""
      : outcome.unitsSpent === 0
        ? " No paid lookups were used."
        : ` Used ${outcome.unitsSpent} paid lookup${outcome.unitsSpent === 1 ? "" : "s"}${outcome.paidRemaining === null ? "" : `; ${outcome.paidRemaining} left`}.`;
  const setup = outcome.providerIssues.some((issue) => issue.status === "needs_setup")
    ? " Some sources need setup and were not asked."
    : "";
  return `${found}${spent}${setup}`;
}

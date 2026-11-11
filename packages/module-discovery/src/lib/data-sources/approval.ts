import {
  approveProspectSuggestionsWithProspects,
  type SuggestionApproval,
} from "../prospects/mutations";
import type { Prospect } from "../prospects/types";
import { queueProspectEnrichment } from "./enrichment";
import { isGatewayConfigured } from "./workslake-client";

/**
 * DISC-DATA-P0-04.1: approving suggestions, and queueing the one free lookup of each
 * approved company's missing details.
 *
 * Every way a suggestion becomes a prospect goes through here, so they all queue the
 * lookup the same way: a person approving on the "To review" list, AI Discovery's
 * "Approve automatically" stage, and the first-setup auto-populate. One
 * `discovery.prospect.enrichment_requested` event per approved company, drained by
 * `events/handlers.ts`, parked without a Discovery licence. The lookup's ledger key is
 * the prospect, so a redelivered event, or an immediate attempt that already succeeded,
 * asks nothing twice.
 *
 * Queueing never blocks or undoes an approval: a publish that fails is logged and the
 * prospect stays as approved. With no gateway settings there is nothing to ask, so
 * nothing is queued. A channel is a public outlet, not an organisation, and is skipped.
 */
export async function approveSuggestionsAndQueueEnrichment(
  workspaceId: string,
  suggestionIds: string[],
): Promise<SuggestionApproval & { prospects: Prospect[]; enrichmentQueuedFor: string[] }> {
  const approval = await approveProspectSuggestionsWithProspects(workspaceId, suggestionIds);
  const companyIds = approval.prospects
    .filter((prospect) => (prospect.kind ?? "company") === "company")
    .map((prospect) => prospect.id);
  if (companyIds.length === 0 || !isGatewayConfigured()) return { ...approval, enrichmentQueuedFor: [] };
  try {
    await queueProspectEnrichment(workspaceId, companyIds);
  } catch (error) {
    console.error("Could not queue enrichment:", error instanceof Error ? error.message : error);
    return { ...approval, enrichmentQueuedFor: [] };
  }
  return { ...approval, enrichmentQueuedFor: companyIds };
}

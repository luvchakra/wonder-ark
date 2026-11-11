import { registerEventHandler } from "@cofounderai/core/events/registry";
import type { DomainEvent } from "@cofounderai/core/events/types";
import { createAdminClient } from "../db/admin";
import { ENRICHMENT_REQUESTED_EVENT, enrichProspect } from "../lib/data-sources/enrichment";
import { UsageLimitExceededError } from "../lib/usage/limits";

/**
 * module-discovery's event subscriptions (00-MASTER-PLAN.md's module contract layout).
 * Imported once, for its side effect, from apps/web/app/api/cron/drain-events/route.ts
 * before the drain loop runs, as every other module's handlers.ts is.
 *
 * DISC-DATA-P0-04.1: approving a company suggestion queues one free lookup of the
 * prospect's missing details. The event is published with `required_module:
 * 'discovery'`, so the drain parks it for a business without the licence and never
 * calls this. There is no signed-in user here, so the lookup runs with the service
 * role and is told the event's business; `enrichProspect` refuses a prospect that does
 * not belong to it.
 *
 * Safe to redeliver: the approve action also attempts the lookup straight away (the
 * drain runs once a day), and a lookup that already succeeded for the prospect is found
 * in the run ledger and not asked again. A value a person typed is never overwritten,
 * whichever attempt runs.
 *
 * A gateway that did not answer, or a used-up lookup quota, throws so the drain retries
 * with backoff. Everything else is final and returns: a prospect that is gone, a
 * gateway that is not set up, nothing left to fill, or a used-up monthly run allowance
 * (the person can still use Retry or "Fill missing details" on the prospect page).
 */
registerEventHandler(ENRICHMENT_REQUESTED_EVENT, async (event: DomainEvent) => {
  const { prospectId } = event.payload as { prospectId?: unknown };
  if (typeof prospectId !== "string" || !prospectId) return;

  let outcome;
  try {
    outcome = await enrichProspect(prospectId, {
      allowPaid: false,
      client: createAdminClient(),
      businessId: event.business_id,
    });
  } catch (error) {
    if (error instanceof UsageLimitExceededError) return;
    throw error;
  }
  if (outcome.status === "failed" && (outcome.reason === "unavailable" || outcome.reason === "quota")) {
    throw new Error(`Enrichment did not run (${outcome.reason}).`);
  }
});

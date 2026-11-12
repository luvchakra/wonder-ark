"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { runFind } from "@cofounderai/module-discovery/lib/data-sources/find";
import { findTargetOf, type FindState, type SaveWeeklySearchState } from "@cofounderai/module-discovery/lib/data-sources/types";
import { saveWeeklySearch, setSavedSearchEnabled } from "@cofounderai/module-discovery/lib/data-sources/saved-searches";
import { after } from "next/server";
import { approveSuggestionsAndQueueEnrichment } from "@cofounderai/module-discovery/lib/data-sources/approval";
import { runQueuedEnrichmentNow } from "@cofounderai/module-discovery/lib/data-sources/enrichment";
import { discardProspectSuggestions } from "@cofounderai/module-discovery/lib/prospects/mutations";

async function discoverPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects/discover`;
}
async function prospectsPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects`;
}

/**
 * DISC-DATA-P0-03.1: one Find run, from whichever source the person chose. The form
 * supplies only what was typed and which source was picked; `runFind` resolves the
 * business, checks the licence and the usage allowance, and takes the source from the
 * server's own list.
 *
 * Returns what happened as state rather than throwing: Next.js redacts a thrown Server
 * Action error's message in production (see `runAiAction`), and a refused or failed
 * search has to say which it was.
 */
export async function findAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  _prevState: FindState,
  formData: FormData,
): Promise<FindState> {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  try {
    const outcome = await runFind(workspaceId, {
      sourceId: field("sourceId"),
      // DISC-CONS-P0-02.1: companies, channels or places they gather.
      target: findTargetOf(field("target")),
      what: field("what"),
      where: field("where"),
      companySize: field("companySize") || undefined,
      alsoLookFor: field("alsoLookFor") || undefined,
      hasWebsite: formData.get("hasWebsite") !== null,
    });
    if (outcome.status === "completed") revalidatePath(await discoverPath(businessId, productId));
    return outcome;
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "failed",
      reason: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * DISC-DATA-P0-05.1: "Run this weekly". Saves the search that was just run, as the form
 * posts it back; `saveWeeklySearch` checks the licence and that the source is a free,
 * active WorksLake source before storing anything. With one already saved it changes
 * nothing and says so, unless `replace` was posted, which the page sends only from its
 * "Replace it" button. Returned as state so a refusal reaches the screen.
 */
export async function saveWeeklySearchAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  _prevState: SaveWeeklySearchState,
  formData: FormData,
): Promise<SaveWeeklySearchState> {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  try {
    const outcome = await saveWeeklySearch(
      workspaceId,
      {
        sourceId: field("sourceId"),
        what: field("what"),
        where: field("where"),
        companySize: field("companySize") || undefined,
        hasWebsite: formData.get("hasWebsite") !== null,
      },
      { replace: formData.get("replace") !== null },
    );
    if (outcome.status === "saved") revalidatePath(await discoverPath(businessId, productId));
    return outcome;
  } catch (error) {
    unstable_rethrow(error);
    return { status: "failed", message: error instanceof Error ? error.message : "The search couldn't be saved." };
  }
}

/** DISC-DATA-P0-05.1: pause or resume the offering's weekly search. */
export async function setWeeklySearchEnabledAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  enabled: boolean,
) {
  await setSavedSearchEnabled(workspaceId, enabled);
  revalidatePath(await discoverPath(businessId, productId));
}

export async function approveSuggestionsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  // DISC-DATA-P0-04.1: each approved company gets one free lookup of its missing details,
  // queued through core.domain_events by the shared approval (so AI Discovery's automatic
  // approval queues it the same way). Here a person is waiting, so it is also attempted
  // straight after the response, because the drain runs once a day. Neither blocks the
  // approval, and a failure of either leaves the prospect as it is.
  const { added, duplicates, enrichmentQueuedFor } = await approveSuggestionsAndQueueEnrichment(workspaceId, ids);
  if (enrichmentQueuedFor.length > 0) after(() => runQueuedEnrichmentNow(enrichmentQueuedFor));

  revalidatePath(await prospectsPath(businessId, productId));
  revalidatePath(await discoverPath(businessId, productId));
  // DISC-DATA-P0-03.3: a suggestion refused as a duplicate is reported, not counted as
  // added. The prospects page already words this for a file import.
  redirect(
    `${await prospectsPath(businessId, productId)}?imported=${added}${duplicates > 0 ? `&duplicates=${duplicates}` : ""}`,
  );
}

export async function discardSuggestionsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  await discardProspectSuggestions(workspaceId, ids);
  revalidatePath(await discoverPath(businessId, productId));
  redirect(await discoverPath(businessId, productId));
}

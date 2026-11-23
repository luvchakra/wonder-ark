"use server";

import { businessPath } from "@/lib/business-path";
import { redirect } from "next/navigation";
import type { BulkActionResult } from "@cofounderai/module-discovery/lib/prospects/bulk-actions";
import { revalidatePath } from "next/cache";
import { createProspect, setProspectsShortlisted } from "@cofounderai/module-discovery/lib/prospects/mutations";
import { saveSignupPage } from "@cofounderai/module-discovery/lib/audience/pages";
import { findDuplicateProspect } from "@cofounderai/module-discovery/lib/prospects/duplicates";
import {
  bulkResearchProspects,
  bulkScoreProspects,
} from "@cofounderai/module-discovery/lib/prospects/bulk-actions";
import {
  autoDiscoverOneProspect,
  type AutoPopulateProspectsResult,
} from "@cofounderai/module-discovery/lib/ai-approval/auto-populate";
import { listProspects } from "@cofounderai/module-discovery/lib/prospects/queries";
import { needsAiSetup, prepQueue, prepStepOf, PREP_STEP_LABEL, runPrepStep, stepsLeft, stopsTheRun } from "@cofounderai/module-discovery/lib/prospects/prep";
import { getAutoSend } from "@cofounderai/module-discovery/lib/auto-send/settings";

async function prospectsPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects`;
}

export async function createProspectAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const companyName = String(formData.get("companyName") ?? "");
  const website = String(formData.get("website") ?? "");

  const duplicate = await findDuplicateProspect(workspaceId, { companyName, website });
  if (duplicate) {
    revalidatePath(await prospectsPath(businessId, productId));
    redirect(`${await prospectsPath(businessId, productId)}/${duplicate.id}?duplicate=1`);
  }

  const prospect = await createProspect(workspaceId, {
    companyName,
    website,
    industry: String(formData.get("industry") ?? ""),
    companySize: String(formData.get("companySize") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
  }, { shortlist: true });
  revalidatePath(await prospectsPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}/${prospect.id}`);
}

function bulkResultQuery(action: string, result: BulkActionResult) {
  const q = new URLSearchParams({
    bulkAction: action,
    bulkCompleted: String(result.completed),
    bulkDone: String(result.alreadyDone),
    bulkNotReady: String(result.notReady),
    bulkFailed: String(result.failed),
    bulkLimit: result.limitReached ? "1" : "0",
  });
  return q.toString();
}

export async function bulkResearchAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const result = await bulkResearchProspects(workspaceId, ids);
  revalidatePath(await prospectsPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}?${bulkResultQuery("research", result)}`);
}

/**
 * The Prospects step of the Overview page's "Let AI Auto-Populate Info" flow (called
 * directly from the client `AutoPopulateStepBanner`, not through a `<form>`). What it may
 * approve is decided on the server from the workspace's own business setting
 * (DISC-AI-APPROVAL-01, `autoDiscoverOneProspect`): "Approve automatically" adds the one
 * company found as a prospect and drafts its research, score, strategy and message;
 * "Review each step" leaves it as a suggestion on the Discover page. Nothing is sent in
 * either mode.
 */
export async function autoDiscoverOneProspectAction(
  businessId: string,
  productId: string,
  workspaceId: string,
): Promise<AutoPopulateProspectsResult> {
  const result = await autoDiscoverOneProspect(workspaceId);
  revalidatePath(await prospectsPath(businessId, productId));
  return result;
}

export async function bulkScoreAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const result = await bulkScoreProspects(workspaceId, ids);
  revalidatePath(await prospectsPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}?${bulkResultQuery("score", result)}`);
}

/** DISC-CONS-P0-03.2: the offering's sign-up page settings. `saveSignupPage` checks the
 * licence; RLS keeps it to the member's own workspace. */
export async function saveSignupPageAction(businessId: string, productId: string, workspaceId: string, formData: FormData) {
  await saveSignupPage(workspaceId, {
    enabled: formData.get("enabled") !== null,
    valueLine: formData.get("valueLine"),
    questions: [formData.get("question_0"), formData.get("question_1")],
    consentText: formData.get("consentText"),
  });
  revalidatePath(await prospectsPath(businessId, productId));
}

/**
 * DISC-PROS-P0-08.1: "Use these" on the Select tab picks the ticked prospects for work, then
 * opens the working list (Channels, Companies) where research, scoring and campaigns happen.
 * "Back to Select" sends ticked ones back. The list to return to is one of the page's own.
 */
export async function shortlistProspectsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  nextList: string | null,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const moved = await setProspectsShortlisted(workspaceId, ids, true);
  revalidatePath(await prospectsPath(businessId, productId));
  const list = nextList && /^(companies|channels)$/.test(nextList) ? `list=${nextList}&` : "";
  redirect(`${await prospectsPath(businessId, productId)}?${list}shortlisted=${moved}`);
}

export async function unshortlistProspectsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const ids = formData.getAll("ids").map(String);
  const moved = await setProspectsShortlisted(workspaceId, ids, false);
  revalidatePath(await prospectsPath(businessId, productId));
  redirect(`${await prospectsPath(businessId, productId)}?unshortlisted=${moved}`);
}

/** DISC-AUTO-P0-01.1: what one call of the preparation runner did. */
export type PrepResult = {
  /** Chosen prospects still to prepare after this call (not counting skipped ones). */
  remaining: number;
  /** DISC-AUTO-P0-01.3: their steps left, for the progress bar. */
  stepsLeft: number;
  /** "Researched Week Plan", or null when there was nothing to do. */
  did: string | null;
  /** The prospect that failed this time; the runner skips it for the rest of the run. */
  failedId?: string;
  error?: string;
  /** DISC-AUTO-P0-01.2: a failure every prospect would hit (credits used up, the AI key
   * refused or missing, the provider down): the runner stops and shows `error`. */
  limitReached?: boolean;
  /** The fix is the AI key: the runner links to the AI provider settings. */
  needsAiSetup?: boolean;
};

/**
 * DISC-AUTO-P0-01.1: prepares the next picked prospect by one step (research, score, plan,
 * first-message draft) under the person's own session. Called again and again by the
 * offering's preparation runner until nothing is left. Sends nothing.
 */
export async function prepareNextProspectAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  /** DISC-AUTO-P0-01.3: only the prospects the person chose to prepare. */
  chosen: string[],
  skip: string[],
): Promise<PrepResult> {
  // DISC-AUTO-P0-03.1: read on every call, failing closed, so turning it off takes effect at once.
  const options = { autoSend: await getAutoSend(businessId) };
  // The chosen ids only narrow this workspace's own picked prospects, read under RLS.
  const inChosen = (list: Awaited<ReturnType<typeof listProspects>>) => prepQueue(list, skip, options).filter((p) => chosen.includes(p.id));
  const sumSteps = (list: ReturnType<typeof inChosen>) => list.reduce((sum, p) => sum + stepsLeft(p, options), 0);
  const queue = inChosen(await listProspects(workspaceId, { shortlisted: true }));
  const next = queue[0];
  if (!next) return { remaining: 0, stepsLeft: 0, did: null };
  const label = PREP_STEP_LABEL[prepStepOf(next, options)!];
  try {
    await runPrepStep(workspaceId, next, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (stopsTheRun(error)) {
      return { remaining: queue.length, stepsLeft: sumSteps(queue), did: null, limitReached: true, error: message, needsAiSetup: needsAiSetup(error) };
    }
    const rest = queue.slice(1);
    return { remaining: rest.length, stepsLeft: sumSteps(rest), did: null, failedId: next.id, error: `Couldn't prepare ${next.company_name}: ${message}` };
  }
  revalidatePath(await prospectsPath(businessId, productId));
  const after = inChosen(await listProspects(workspaceId, { shortlisted: true }));
  return { remaining: after.length, stepsLeft: sumSteps(after), did: `${label} ${next.company_name}` };
}

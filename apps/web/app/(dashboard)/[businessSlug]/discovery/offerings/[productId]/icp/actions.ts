"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateIcp } from "@cofounderai/module-discovery/lib/ai/generate-icp";
import {
  updateIcpProfile,
  approveIcpProfile,
  cloneIcpProfileToWorkspace,
  parseListField,
} from "@cofounderai/module-discovery/lib/icp/mutations";
import { invalidateDownstreamStages } from "@cofounderai/module-discovery/lib/pipeline/invalidate";
import { autoPopulateIcp } from "@cofounderai/module-discovery/lib/ai-approval/auto-populate";
import { getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { createBuyerPersona, updateBuyerPersona, deleteBuyerPersona } from "@cofounderai/module-discovery/lib/personas/mutations";
import type { PersonaPriority, PersonaRole } from "@cofounderai/module-discovery/lib/personas/types";

async function icpPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/icp`;
}

export async function generateIcpAction(
  businessId: string,
  productId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const force = formData.get("force") === "true";
    await generateIcp(productId, { force });
    revalidatePath(await icpPath(businessId, productId));
  });
}

function icpFieldsFromFormData(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    industries: parseListField(String(formData.get("industries") ?? "")),
    companySizes: parseListField(String(formData.get("companySizes") ?? "")),
    geographies: parseListField(String(formData.get("geographies") ?? "")),
    roles: parseListField(String(formData.get("roles") ?? "")),
    painPoints: parseListField(String(formData.get("painPoints") ?? "")),
    buyingSignals: parseListField(String(formData.get("buyingSignals") ?? "")),
    exclusions: parseListField(String(formData.get("exclusions") ?? "")),
    revenue: parseListField(String(formData.get("revenue") ?? "")),
    businessModel: parseListField(String(formData.get("businessModel") ?? "")),
    technology: parseListField(String(formData.get("technology") ?? "")),
    growthStage: parseListField(String(formData.get("growthStage") ?? "")),
    existingTools: parseListField(String(formData.get("existingTools") ?? "")),
  };
}

export async function updateIcpAction(
  businessId: string,
  productId: string,
  icpId: string,
  formData: FormData,
) {
  await updateIcpProfile(icpId, icpFieldsFromFormData(formData));
  revalidatePath(await icpPath(businessId, productId));
}

/**
 * DISC-OFFER-P0-11.1/11.2: "Save & Run Downstream" -- the doc's own ICP worked example.
 * Saves exactly like `updateIcpAction` above, then invalidates everything
 * `downstreamOf("icp")` (DISC-OFFER-P0-11.3) so AI Discovery genuinely recomputes ICP-
 * derived buyer personas/discovery strategy/accounts/signals/scoring/research/
 * recommendations rather than skipping them as already-done. Redirects to the offering
 * Overview page with `?autorun=1` so `RunAiDiscoveryPanel` immediately resumes through
 * the now-reset stages -- "save" and "run what depends on it" read as one action to the
 * founder, not a save followed by a separate manual click (DISC-OFFER-P0-11.2's own
 * "Run Discovery From Here"). `redirect()` throws internally (Next.js's own navigation
 * signal) -- called last, after every other await, so nothing here is skipped by it.
 */
export async function updateIcpAndRunDownstreamAction(
  businessId: string,
  productId: string,
  icpId: string,
  formData: FormData,
) {
  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) throw new Error("Workspace not found for this offering.");

  await updateIcpProfile(icpId, icpFieldsFromFormData(formData));
  await invalidateDownstreamStages(workspace.id, "icp");
  revalidatePath(await icpPath(businessId, productId));
  redirect(`${await businessPath(businessId)}/discovery/offerings/${productId}?autorun=1`);
}

/** DISC-OFFER-P0-02.2's "ICP can be cloned" -- clones another offering's ICP onto this
 * one's own workspace (creating it if this offering had none, overwriting if it did). */
export async function cloneIcpAction(businessId: string, productId: string, sourceIcpId: string): Promise<{ error: string } | { success: true }> {
  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) return { error: "Workspace not found for this offering." };

  try {
    await cloneIcpProfileToWorkspace(sourceIcpId, workspace.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not clone this ideal customer." };
  }
  revalidatePath(await icpPath(businessId, productId));
  return { success: true };
}

export async function approveIcpAction(
  businessId: string,
  productId: string,
  icpId: string,
) {
  await approveIcpProfile(icpId);
  revalidatePath(await icpPath(businessId, productId));
}

/**
 * The ICP step of the Overview page's "Let AI Auto-Populate Info" flow (called directly
 * from the client `AutoPopulateStepBanner` as it walks Overview -> ICP -> Prospects, not
 * through a `<form>`): generates a fresh ICP, and approves it only when the business chose
 * "Approve automatically" -- read on the server from the offering's own business
 * (DISC-AI-APPROVAL-01, `autoPopulateIcp`). Thrown errors propagate to the caller as-is --
 * the banner's own try/catch turns them into its step-failed UI.
 */
export async function autoPopulateIcpAction(businessId: string, productId: string): Promise<void> {
  await autoPopulateIcp(productId);
  revalidatePath(await icpPath(businessId, productId));
}

/** DISC-OFFER-P0-02.3's "Offering Buyer Persona Definition" actions. */
function personaFieldsFromFormData(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    roleInCommittee: String(formData.get("roleInCommittee") ?? "other") as PersonaRole,
    priority: String(formData.get("priority") ?? "medium") as PersonaPriority,
    notes: String(formData.get("notes") ?? ""),
  };
}

export async function createPersonaAction(
  businessId: string,
  productId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) return { error: "Workspace not found for this offering." };

  try {
    await createBuyerPersona(workspace.id, personaFieldsFromFormData(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add this persona." };
  }
  revalidatePath(await icpPath(businessId, productId));
  return { success: true };
}

export async function updatePersonaAction(
  businessId: string,
  productId: string,
  personaId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  try {
    await updateBuyerPersona(personaId, personaFieldsFromFormData(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save this persona." };
  }
  revalidatePath(await icpPath(businessId, productId));
  return { success: true };
}

export async function deletePersonaAction(
  businessId: string,
  productId: string,
  personaId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    await deleteBuyerPersona(personaId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not delete this persona." };
  }
  revalidatePath(await icpPath(businessId, productId));
  return { success: true };
}

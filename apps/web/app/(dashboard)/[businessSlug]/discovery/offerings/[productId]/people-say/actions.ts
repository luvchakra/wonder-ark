"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { summariseWhatPeopleSay } from "@cofounderai/module-discovery/lib/audience/themes";

/** DISC-CONS-P0-04.2: summarise the offering's feedback into themes. A refused or empty
 * result is reported as an error, never as a summary. */
export async function summariseAction(businessId: string, productId: string, workspaceId: string): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await summariseWhatPeopleSay(workspaceId);
    if (outcome.status === "empty") throw new Error("There is no feedback to summarise yet.");
    if (outcome.status === "failed") throw new Error(outcome.message);
    revalidatePath(`${await businessPath(businessId)}/discovery/offerings/${productId}/people-say`);
  });
}

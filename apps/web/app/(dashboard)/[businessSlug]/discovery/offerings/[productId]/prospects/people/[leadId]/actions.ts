"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { logConversation, messageLead, sendQuestions, updateLead } from "@cofounderai/module-discovery/lib/audience/leads";
import type { LeadActionState } from "@cofounderai/module-discovery/lib/audience/types";

/**
 * DISC-CONS-P0-04.1/05.2: what a member does on a person's page. Each library call checks
 * the licence and goes through the member's session; a send is refused unless the
 * person consented and has not unsubscribed. Results come back as state so a refusal
 * reaches the screen with its reason.
 */
async function leadPath(businessId: string, productId: string, leadId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects/people/${leadId}`;
}

async function run(
  businessId: string,
  productId: string,
  leadId: string,
  fn: () => Promise<{ status: "completed" | "failed"; message: string }>,
): Promise<LeadActionState> {
  try {
    const outcome = await fn();
    revalidatePath(await leadPath(businessId, productId, leadId));
    return outcome;
  } catch (error) {
    unstable_rethrow(error);
    return { status: "failed", message: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function logConversationAction(businessId: string, productId: string, leadId: string, _prev: LeadActionState, formData: FormData) {
  return run(businessId, productId, leadId, async () => {
    await logConversation(leadId, { body: String(formData.get("body") ?? ""), tags: String(formData.get("tags") ?? "") });
    return { status: "completed", message: "Saved." };
  });
}

export async function sendQuestionsAction(businessId: string, productId: string, leadId: string, _prev: LeadActionState, formData: FormData) {
  return run(businessId, productId, leadId, () => sendQuestions(leadId, [formData.get("question_0"), formData.get("question_1")]));
}

export async function messageLeadAction(businessId: string, productId: string, leadId: string, _prev: LeadActionState, formData: FormData) {
  return run(businessId, productId, leadId, () =>
    messageLead(leadId, { subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") }),
  );
}

export async function updateLeadAction(businessId: string, productId: string, leadId: string, _prev: LeadActionState, formData: FormData) {
  return run(businessId, productId, leadId, async () => {
    await updateLead(leadId, { status: String(formData.get("status") ?? ""), tags: String(formData.get("tags") ?? "") });
    return { status: "completed", message: "Saved." };
  });
}

"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  saveProspectEdits,
  updateProspectStatus,
  setProspectOutcome,
} from "@cofounderai/module-discovery/lib/prospects/mutations";
import { enrichProspect, enrichmentMessage } from "@cofounderai/module-discovery/lib/data-sources/enrichment";
import {
  contactLookupMessage,
  findContactsForProspect,
  removeContactOnRequest,
} from "@cofounderai/module-discovery/lib/data-sources/contacts";
import { listDataSources } from "@cofounderai/module-discovery/lib/data-sources/index";
import {
  gatewayFailureMessage,
  type LookupQuotaState,
  type LookupState,
} from "@cofounderai/module-discovery/lib/data-sources/types";
import type { ProspectStatus } from "@cofounderai/module-discovery/lib/prospects/types";
import {
  createContact,
  editContact,
  deleteContact,
} from "@cofounderai/module-discovery/lib/contacts/mutations";
import { researchProspect } from "@cofounderai/module-discovery/lib/ai/research-prospect";
import { applyIncrementalSignalUpdate } from "@cofounderai/module-discovery/lib/pipeline/incremental";
import { getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { generateResearchBrief } from "@cofounderai/module-discovery/lib/ai/generate-research-brief";
import { scoreProspect } from "@cofounderai/module-discovery/lib/scoring/score-prospect";
import { generateOutreachStrategy } from "@cofounderai/module-discovery/lib/ai/generate-strategy";
import { approveOutreachStrategy, updateOutreachStrategy } from "@cofounderai/module-discovery/lib/outreach/mutations";
import type { OutreachChannel } from "@cofounderai/module-discovery/lib/outreach/types";
import { generateOutreachMessage } from "@cofounderai/module-discovery/lib/ai/generate-message";
import { generateReply } from "@cofounderai/module-discovery/lib/ai/generate-reply";
import {
  updateMessageContent,
  updateMessageContact,
  approveMessage,
  markMessageSent,
  deleteMessage,
} from "@cofounderai/module-discovery/lib/messages/mutations";
import { sendMessage } from "@cofounderai/module-discovery/lib/messages/send";
import {
  closeConversation,
  logInboundReply,
} from "@cofounderai/module-discovery/lib/conversations/mutations";
import { addToWatchlist, updateWatchlistEntry, removeFromWatchlist } from "@cofounderai/module-discovery/lib/watchlist/mutations";
import { addProspectFeedback } from "@cofounderai/module-discovery/lib/prospect-feedback/mutations";
import type { ProspectFeedbackTag } from "@cofounderai/module-discovery/lib/prospect-feedback/types";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { promoteProspectToCrm, recordInteraction } from "@cofounderai/module-crm/contract/index";
import type { RecordInteractionInput } from "@cofounderai/module-crm/lib/interactions/types";
import type { MessageChannel, MessageClassification } from "@cofounderai/module-discovery/lib/messages/types";

/** CRM-03.2: which classifications are meaningful enough to become a CRM interaction at
 * all (not spam/noise -- out_of_office and unsubscribe are signal-free for CRM purposes),
 * and which of those need `requires_response = true` (a definitive "not interested" is
 * still worth recording for the relationship timeline, but nobody needs to act on it). */
const CRM_INTERACTION_CLASSIFICATIONS: Partial<Record<MessageClassification, { requiresResponse: boolean }>> = {
  interested: { requiresResponse: true },
  question: { requiresResponse: true },
  objection: { requiresResponse: true },
  not_interested: { requiresResponse: false },
};

const DISCOVERY_TO_CRM_CHANNEL: Record<MessageChannel, RecordInteractionInput["channel"]> = {
  email: "email",
  whatsapp: "whatsapp",
  linkedin: "other",
};

async function prospectPath(businessId: string, productId: string, prospectId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects/${prospectId}`;
}

async function conversionsPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/conversions`;
}

export async function updateProspectAction(
  businessId: string,
  productId: string,
  prospectId: string,
  formData: FormData,
) {
  // DISC-DATA-P0-04.1: a value the person changed stops being credited to a source.
  await saveProspectEdits(prospectId, {
    companyName: String(formData.get("companyName") ?? ""),
    website: String(formData.get("website") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    companySize: String(formData.get("companySize") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    twitterUrl: String(formData.get("twitterUrl") ?? ""),
    companyEmail: String(formData.get("companyEmail") ?? ""),
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function updateProspectStatusAction(
  businessId: string,
  productId: string,
  prospectId: string,
  formData: FormData,
) {
  const status = String(formData.get("status") ?? "new") as ProspectStatus;
  await updateProspectStatus(prospectId, status);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function addToWatchlistAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  prospectId: string,
  formData: FormData,
) {
  const nextReviewAtRaw = String(formData.get("nextReviewAt") ?? "").trim();
  await addToWatchlist(workspaceId, prospectId, {
    watchReason: String(formData.get("watchReason") ?? "").trim(),
    nextReviewAt: nextReviewAtRaw === "" ? null : new Date(nextReviewAtRaw).toISOString(),
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function updateWatchlistAction(
  businessId: string,
  productId: string,
  prospectId: string,
  entryId: string,
  formData: FormData,
) {
  const nextReviewAtRaw = String(formData.get("nextReviewAt") ?? "").trim();
  await updateWatchlistEntry(entryId, {
    watchReason: String(formData.get("watchReason") ?? "").trim(),
    nextReviewAt: nextReviewAtRaw === "" ? null : new Date(nextReviewAtRaw).toISOString(),
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function removeFromWatchlistAction(
  businessId: string,
  productId: string,
  prospectId: string,
  entryId: string,
) {
  await removeFromWatchlist(entryId);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function addProspectFeedbackAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  prospectId: string,
  formData: FormData,
) {
  const tag = String(formData.get("feedbackTag") ?? "") as ProspectFeedbackTag;
  const noteRaw = String(formData.get("note") ?? "").trim();
  await addProspectFeedback(workspaceId, prospectId, tag, noteRaw === "" ? null : noteRaw);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function addContactAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  prospectId: string,
  formData: FormData,
) {
  await createContact(workspaceId, prospectId, {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? ""),
    email: String(formData.get("email") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function updateContactAction(
  businessId: string,
  productId: string,
  prospectId: string,
  contactId: string,
  formData: FormData,
) {
  // DISC-DATA-P0-04.2: changing the address clears what a lookup said about the old one.
  await editContact(contactId, {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? ""),
    email: String(formData.get("email") ?? ""),
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

/**
 * Deletes a contact. DISC-DATA-P0-04.3: with "They asked not to be contacted" ticked, the
 * address is first passed to WorksLake's removal list; if that cannot be done the
 * contact is kept and the reason is returned, so the request is not lost. Returned as
 * state, not thrown, so the reason reaches the screen (see `runAiAction`).
 */
export async function deleteContactAction(
  businessId: string,
  productId: string,
  prospectId: string,
  contactId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    if (formData.get("askedNotToBeContacted") !== null) {
      const outcome = await removeContactOnRequest(contactId);
      if (outcome.status === "failed") throw new Error(outcome.message);
    } else {
      await deleteContact(contactId);
    }
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

/**
 * DISC-DATA-P0-04.1: runs the free lookup of a prospect's missing details again, after
 * the one queued at approval failed. Free sources only; fills only the blanks.
 */
export async function retryEnrichmentAction(
  businessId: string,
  productId: string,
  prospectId: string,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await enrichProspect(prospectId, { allowPaid: false });
    revalidatePath(await prospectPath(businessId, productId, prospectId));
    if (outcome.status === "failed") throw new Error(outcome.message);
  });
}

/** Turns a lookup into what the screen shows, never letting an exception stand in for a
 * reason: a refused licence or a used-up allowance is a failed lookup with its message. */
async function runLookup(run: () => Promise<{ failed: boolean; message: string }>): Promise<LookupState> {
  try {
    const { failed, message } = await run();
    return { status: failed ? "failed" : "completed", message };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : "Something went wrong. Nothing was changed." };
  }
}

/**
 * DISC-DATA-P0-04.1: "Fill missing details" -- the same lookup with paid sources allowed.
 * Runs only on the person's confirmation. `requestKey` is made by the server when the
 * page renders and names this one click, so a double click is answered once.
 */
export async function fillMissingDetailsAction(
  businessId: string,
  productId: string,
  prospectId: string,
  requestKey: string,
): Promise<LookupState> {
  const state = await runLookup(async () => {
    const outcome = await enrichProspect(prospectId, { allowPaid: true, requestKey });
    return { failed: outcome.status === "failed", message: enrichmentMessage(outcome) };
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
  return state;
}

/**
 * DISC-DATA-P0-04.2: "Find contacts" -- up to three people in the approved ideal
 * customer's roles. Always spends paid lookups, so it runs only on the person's
 * confirmation and, like the lookup above, once per click.
 */
export async function findContactsAction(
  businessId: string,
  productId: string,
  prospectId: string,
  requestKey: string,
): Promise<LookupState> {
  const state = await runLookup(async () => {
    const outcome = await findContactsForProspect(prospectId, requestKey);
    return { failed: outcome.status === "failed", message: contactLookupMessage(outcome) };
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
  return state;
}

/**
 * How many paid lookups the business has left, for the confirmation shown before a paid
 * lookup. Read from the gateway when the person opens it; the business is resolved on
 * the server from the workspace the caller can read. Spends nothing.
 */
export async function lookupQuotaAction(workspaceId: string): Promise<LookupQuotaState> {
  try {
    const list = await listDataSources(workspaceId);
    if (list.gateway.state === "ok" && list.quota) {
      return { state: "ok", period: list.quota.period, paid: list.quota.paid };
    }
    const state = list.gateway.state === "ok" ? "unavailable" : list.gateway.state;
    return { state, message: gatewayFailureMessage(state, list.gateway.resetAt, list.quota) };
  } catch {
    return { state: "unavailable", message: "Unavailable: couldn't read how many paid lookups are left." };
  }
}

/**
 * DISC-OFFER-P1-01.2: "Incremental Re-Run" -- the one place fresh evidence for an
 * *existing* opportunity enters this module today (see `applyIncrementalSignalUpdate`'s
 * own doc comment for why the pipeline's own automated path never needs this). A
 * best-effort follow-up, not folded into `runAiAction`'s own error surface -- a founder
 * re-researching a prospect should see their fresh research either way even if the
 * incremental recompute that follows it hits something unexpected.
 */
export async function researchProspectAction(
  businessId: string,
  productId: string,
  prospectId: string,
): Promise<AiActionState> {
  return runAiAction(async () => {
    await researchProspect(prospectId);
    try {
      const workspace = await getWorkspaceForProduct(productId);
      if (workspace) {
        await applyIncrementalSignalUpdate(workspace.id, prospectId);
      }
    } catch {
      // The fresh research itself is already saved and worth showing regardless --
      // never let the follow-on incremental recompute's own failure mask that success.
    }
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

export async function generateResearchBriefAction(
  businessId: string,
  productId: string,
  prospectId: string,
): Promise<AiActionState> {
  return runAiAction(async () => {
    await generateResearchBrief(prospectId);
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

export async function scoreProspectAction(
  businessId: string,
  productId: string,
  prospectId: string,
) {
  await scoreProspect(prospectId);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function generateStrategyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const contactId = String(formData.get("contactId") ?? "") || null;
    await generateOutreachStrategy(prospectId, contactId);
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

export async function approveStrategyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  strategyId: string,
) {
  await approveOutreachStrategy(strategyId);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

/** Item #5 of a UX pass: lets the founder edit an AI-generated strategy directly
 * (draft or already-approved) instead of only regenerating or approving as-is. */
export async function updateStrategyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  strategyId: string,
  formData: FormData,
) {
  await updateOutreachStrategy(strategyId, {
    strategy: String(formData.get("strategy") ?? ""),
    channel: String(formData.get("channel") ?? "email") as OutreachChannel,
    keyMessage: String(formData.get("keyMessage") ?? ""),
    cta: String(formData.get("cta") ?? ""),
  });
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function generateMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  strategyId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  const resendTemplateId = String(formData.get("resendTemplateId") ?? "").trim() || undefined;
  return runAiAction(async () => {
    await generateOutreachMessage(strategyId, resendTemplateId);
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

export async function updateMessageContentAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
  formData: FormData,
) {
  const subject = formData.has("subject") ? String(formData.get("subject")) : null;
  await updateMessageContent(messageId, String(formData.get("content") ?? ""), subject);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function approveMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
) {
  await approveMessage(messageId);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function markMessageSentAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
) {
  await markMessageSent(messageId);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

/** Email-channel "Approve" (docs/prospects-pipeline-redesign-requirements.md R1) --
 * approving an email message sends it immediately via lib/messages/send.ts instead of
 * waiting for a separate manual "Mark sent" click. A pre-flight failure (no contact
 * email, sending not configured) surfaces through AiActionState rather than throwing,
 * same as the AI actions above; a real provider-side send failure is recorded on the
 * message row itself (status 'failed') and read back on revalidate, not thrown here. */
export async function approveAndSendMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const contactId = String(formData.get("contactId") ?? "") || null;
    if (contactId) await updateMessageContact(messageId, contactId);
    await approveMessage(messageId);
    // DISC-DATA-P0-04.2: the person's one confirmation for a risky or unverified address.
    await sendMessage(messageId, { confirmedUnverified: formData.get("confirmedUnverified") === "1" });
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

/** Retries sending an already-approved (or previously failed) email message -- R2's
 * "Retry" action. */
export async function sendMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const contactId = String(formData.get("contactId") ?? "") || null;
    if (contactId) await updateMessageContact(messageId, contactId);
    await sendMessage(messageId, { confirmedUnverified: formData.get("confirmedUnverified") === "1" });
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

export async function deleteMessageAction(
  businessId: string,
  productId: string,
  prospectId: string,
  messageId: string,
) {
  await deleteMessage(messageId);
  revalidatePath(await prospectPath(businessId, productId, prospectId));
}

export async function generateReplyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  conversationId: string,
): Promise<AiActionState> {
  return runAiAction(async () => {
    await generateReply(conversationId);
    revalidatePath(await prospectPath(businessId, productId, prospectId));
  });
}

/** Closing a thread is also the moment the founder records the deal outcome (docs:
 * Conversations redesign) -- the two submit buttons in the form share this one action,
 * each contributing its own `outcome` value. */
export async function closeConversationAction(
  businessId: string,
  productId: string,
  prospectId: string,
  conversationId: string,
  formData: FormData,
) {
  const outcome = String(formData.get("outcome") ?? "");
  await closeConversation(conversationId);
  if (outcome === "won" || outcome === "lost") {
    await setProspectOutcome(prospectId, outcome);
  }
  revalidatePath(await prospectPath(businessId, productId, prospectId));

  // Item #7 of a UX pass: marking a prospect "Won" is the moment it becomes a
  // conversion, so land the founder on the Conversions page (scrolled to its own
  // Customers list, via the `#bottom` anchor that page's own JSX carries) instead of
  // leaving them on the prospect page they were just closing out.
  if (outcome === "won") {
    revalidatePath(await conversionsPath(businessId, productId));
    redirect(`${await conversionsPath(businessId, productId)}#bottom`);
  }
}

/**
 * Logs a prospect's reply typed in by hand (docs section: Conversations redesign) --
 * uses runAiAction/AiActionState like the other AI-invoking actions here because
 * logInboundReply best-effort-classifies the reply, an AI call that can fail on a usage
 * limit or provider error.
 *
 * CRM-03.2: a meaningful classification (see CRM_INTERACTION_CLASSIFICATIONS above)
 * also records a CRM interaction -- best-effort, same as classification itself, since a
 * CRM hiccup must never lose the reply that already saved successfully.
 * `recordInteraction()`'s own party+channel matching (CRM-01.3) reuses an existing open
 * conversation for this party/channel when one exists rather than always starting a new
 * one. `sourceModule`/`sourceReference` keep the original Discovery prospect traceable.
 * Nothing is recorded when the prospect has no linked `core.parties` row yet.
 */
export async function logInboundReplyAction(
  businessId: string,
  productId: string,
  prospectId: string,
  partyId: string | null,
  conversationId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const content = String(formData.get("content") ?? "");
    const message = await logInboundReply(conversationId, content);
    revalidatePath(await prospectPath(businessId, productId, prospectId));

    const rule = message.classification ? CRM_INTERACTION_CLASSIFICATIONS[message.classification] : undefined;
    if (rule && partyId) {
      try {
        await recordInteraction(businessId, {
          partyId,
          channel: DISCOVERY_TO_CRM_CHANNEL[message.channel],
          direction: "inbound",
          occurredAt: message.sent_at ?? undefined,
          contentExcerpt: message.content.slice(0, 500),
          requiresResponse: rule.requiresResponse,
          sourceModule: "discovery",
          sourceReference: prospectId,
          metadata: { discoveryMessageId: message.id, classification: message.classification },
        });
      } catch (err) {
        console.error("[crm] failed to record interaction for Discovery reply:", err);
      }
    }
  });
}

/**
 * CRM-03.1's "Promote to CRM" button. Carries the prospect forward *by reference*
 * (party + prospect id) rather than copying its ICP fit/buying signals/research into a
 * new CRM-side snapshot -- see module-crm's `promoteProspectToLead()` docstring. Returns
 * the contract's own result so the button can distinguish `MODULE_NOT_LICENSED` from a
 * genuine error, same ADR-10 pattern `createOpportunityAction` in the Conversions
 * route already follows.
 */
export async function promoteProspectToCrmAction(businessId: string, productId: string, prospectId: string, partyId: string) {
  const result = await promoteProspectToCrm(businessId, { partyId, prospectId });
  if (result.ok) revalidatePath(await prospectPath(businessId, productId, prospectId));
  return result;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUnsubscribe, type SuppressionReason } from "@cofounderai/core/privacy/suppression";
import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import { getBusinessIdForWorkspace } from "../tenancy/queries";

/**
 * DISC-CAMP-P0-04.1: what stops a campaign's follow-ups to a prospect, and what goes on
 * the business's opt-out list.
 *
 * A reply of any kind, a bounce, a complaint, an unsubscribe, a won or lost outcome and
 * a deleted contact each stop the prospect's enrollment: nothing more is sent to it by
 * any campaign. A bounce, a complaint and a reply that asks to unsubscribe also add the
 * address (its hash) to `core.communication_suppressions`, the list every outreach send
 * checks, so no later email from the business reaches it either, campaign or not.
 *
 * Every function here takes the client it should write with: the service role for a
 * webhook or the tick, the person's own session for something they did.
 */

export const STOP_REASON = {
  replied: "Replied",
  unsubscribed: "Asked to unsubscribe",
  bounced: "The email bounced",
  complaint: "Reported the email as unwanted",
  suppressed: "Asked not to be emailed",
  contactDeleted: "The contact was deleted",
  noEmail: "No email address",
  invalidAddress: "The address is marked invalid",
  unverifiedAddress: "The address is risky or not verified",
  noMessage: "No text was written for this step",
  outcomeUnknown: "A send's outcome is unknown",
} as const;

/** Stops every active enrollment of a prospect. Returns how many were stopped. */
export async function stopEnrollmentsForProspect(
  client: SupabaseClient,
  prospectId: string,
  status: "replied" | "stopped",
  reason: string,
): Promise<number> {
  const { data, error } = await client
    .from("outreach_enrollments")
    .update({ status, stop_reason: reason.slice(0, 200), next_due_at: null })
    .eq("prospect_id", prospectId)
    .eq("status", "active")
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

/** Adds an address to the business's opt-out list (its hash only). Service role. */
export async function suppressAddress(workspaceId: string, email: string | null | undefined, reason: SuppressionReason, client: SupabaseClient): Promise<boolean> {
  const address = email?.trim();
  if (!address) return false;
  const businessId = await getBusinessIdForWorkspace(workspaceId, client);
  if (!businessId) return false;
  await recordUnsubscribe(businessId, emailHash(address), reason);
  return true;
}

/** The address an outbound message went to: its contact's, else the prospect's general one. */
export async function recipientOfMessage(
  client: SupabaseClient,
  message: { contact_id: string | null; prospect_id: string },
): Promise<string | null> {
  if (message.contact_id) {
    const { data, error } = await client.from("contacts").select("email").eq("id", message.contact_id).maybeSingle();
    if (error) throw error;
    return (data?.email as string | null | undefined) ?? null;
  }
  const { data, error } = await client.from("prospects").select("company_email").eq("id", message.prospect_id).maybeSingle();
  if (error) throw error;
  return (data?.company_email as string | null | undefined) ?? null;
}

/**
 * A bounce or a complaint about a message that was sent: marks the campaign send it
 * belongs to (if any), stops the prospect's enrollment, and puts the address on the
 * opt-out list. Safe to repeat: a send already marked is left as it is, the stop finds
 * nothing active, and the opt-out row is an idempotent upsert.
 */
export async function recordBounce(
  client: SupabaseClient,
  message: { id: string; workspace_id: string; prospect_id: string; contact_id: string | null },
  kind: "bounce" | "complaint",
): Promise<void> {
  const { error } = await client
    .from("outreach_sends")
    .update({ bounced_at: new Date().toISOString() })
    .eq("message_id", message.id)
    .is("bounced_at", null);
  if (error) throw error;
  await stopEnrollmentsForProspect(client, message.prospect_id, "stopped", kind === "bounce" ? STOP_REASON.bounced : STOP_REASON.complaint);
  await suppressAddress(message.workspace_id, await recipientOfMessage(client, message), kind, client);
}

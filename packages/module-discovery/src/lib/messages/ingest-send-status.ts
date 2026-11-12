import { createAdminClient } from "../../db/admin";
import { recordBounce } from "../campaigns/stops";
import type { Message } from "./types";

export type SendStatusEvent = {
  providerMessageId: string;
  status: "sent" | "delivered" | "bounced" | "failed" | "complained";
  reason?: string | null;
};

export type IngestResult =
  | { matched: true; message: Message }
  | { matched: false; reason: string };

const FAILURE_STATUSES = new Set(["bounced", "failed", "complained"]);

/**
 * Applies a Resend delivery-status webhook event to the matching message row
 * (docs/prospects-pipeline-redesign-requirements.md R2). Only bounce/failure-shaped
 * events change anything -- a message is already marked 'sent' from the send-response
 * itself (lib/messages/send.ts), so a "delivered" event has nothing new to record.
 *
 * Runs with the admin client (no logged-in user in a webhook request), matching by
 * provider_message_id rather than any tenant-scoped lookup, per lib/supabase/admin.ts's
 * contract.
 */
export async function ingestSendStatus(event: SendStatusEvent): Promise<IngestResult> {
  if (!FAILURE_STATUSES.has(event.status)) {
    return { matched: false, reason: `Ignored status: ${event.status}` };
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("messages")
    .select("id")
    .eq("provider_message_id", event.providerMessageId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) {
    return { matched: false, reason: `No message found for ${event.providerMessageId}.` };
  }

  const { data, error } = await admin
    .from("messages")
    .update({
      status: "failed",
      failure_reason: event.reason ?? `Delivery ${event.status}.`,
    })
    .eq("id", existing.id)
    .select()
    .single();
  if (error) throw error;

  // DISC-CAMP-P0-04.1: a bounce or a complaint stops the campaign's follow-ups to that
  // prospect and puts the address on the business's opt-out list. A plain "failed" says
  // nothing about the address, so it does neither.
  if (event.status === "bounced" || event.status === "complained") {
    await recordBounce(admin, data, event.status === "bounced" ? "bounce" : "complaint");
  }

  return { matched: true, message: data };
}

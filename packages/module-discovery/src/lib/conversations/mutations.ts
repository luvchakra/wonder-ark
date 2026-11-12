import { STOP_REASON, stopEnrollmentsForProspect } from "../campaigns/stops";
import { createClient } from "../../db/server";
import { classifyReply } from "../ai/classify-reply";
import { getConversation, getOpenConversation } from "./queries";
import type { Conversation, ConversationChannel } from "./types";
import type { Message } from "../messages/types";

/** Conversations are created lazily -- the first outbound send or inbound reply on a
 * prospect/channel opens one; there's never an empty thread. */
export async function getOrCreateConversation(
  workspaceId: string,
  prospectId: string,
  contactId: string | null,
  channel: ConversationChannel,
): Promise<Conversation> {
  const existing = await getOpenConversation(prospectId, channel);
  if (existing) return existing;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      workspace_id: workspaceId,
      prospect_id: prospectId,
      contact_id: contactId,
      channel,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markConversationReplied(conversationId: string): Promise<Conversation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "replied", last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markConversationAwaitingReply(
  conversationId: string,
): Promise<Conversation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "awaiting_reply", last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function closeConversation(conversationId: string): Promise<Conversation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "closed" })
    .eq("id", conversationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Manually records a prospect's reply the founder received outside of automated
 * ingestion (a LinkedIn/WhatsApp message, a phone call, a reply that arrived some other
 * way) as a real inbound message in this conversation -- the same shape
 * ingest-inbound-email.ts produces for a real inbound email, so it's indistinguishable
 * from an automated one afterward: it's classified (best-effort, same as the webhook
 * path) and it unblocks "Generate reply" exactly like a webhook-ingested reply would.
 */
export async function logInboundReply(conversationId: string, content: string): Promise<Message> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Reply content is required.");

  const conversation = await getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      workspace_id: conversation.workspace_id,
      prospect_id: conversation.prospect_id,
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      channel: conversation.channel,
      direction: "inbound",
      content: trimmed,
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  await markConversationReplied(conversation.id);
  // DISC-CAMP-P0-04.1: a reply a person logs by hand stops the campaign's follow-ups to
  // this prospect, as one that arrived by email does.
  await stopEnrollmentsForProspect(supabase, conversation.prospect_id, "replied", STOP_REASON.replied);

  // Best-effort, same as the inbound-email webhook: the reply is worth keeping even if
  // classification fails.
  try {
    return await classifyReply(data.id);
  } catch (err) {
    console.error("Failed to classify manually logged reply:", err);
    return data;
  }
}

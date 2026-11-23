import { createClient } from "../../db/server";
import type { Message } from "./types";

export async function listMessages(prospectId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** DISC-REACH-P0-01.1: one message, under the person's own session (RLS scopes it). */
export async function getMessage(messageId: string): Promise<Message | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("messages").select("*").eq("id", messageId).maybeSingle();
  if (error) throw error;
  return data;
}

/** DISC-REACH-P0-01.1: the newest unsent direct-message draft of each given prospect, for
 * To do's "Message on Instagram" cards. Never an email. */
export async function listDirectDrafts(workspaceId: string, prospectIds: string[]): Promise<Message[]> {
  if (prospectIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("prospect_id", prospectIds)
    .neq("channel", "email")
    .in("status", ["draft", "approved"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const newest = new Map<string, Message>();
  for (const message of (data ?? []) as Message[]) if (!newest.has(message.prospect_id)) newest.set(message.prospect_id, message);
  return [...newest.values()];
}

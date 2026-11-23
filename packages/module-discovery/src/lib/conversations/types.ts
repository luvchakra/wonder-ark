export type ConversationChannel = "email" | "linkedin" | "whatsapp" | "instagram" | "facebook";
export type ConversationStatus = "awaiting_reply" | "replied" | "closed";

export type Conversation = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  contact_id: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

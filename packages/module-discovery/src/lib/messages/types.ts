export type MessageChannel = "email" | "linkedin" | "whatsapp";
export type MessageDirection = "outbound" | "inbound";
export type MessageStatus = "draft" | "approved" | "sent" | "failed";
export type MessageClassification =
  | "interested"
  | "not_interested"
  | "question"
  | "objection"
  | "out_of_office"
  | "unsubscribe"
  | "other";

export type Message = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  /** Email subject line, kept separate from `content` (the body) so it never needs to be
   * parsed back out of a concatenated string at send time. Null for linkedin/whatsapp. */
  subject: string | null;
  content: string;
  status: MessageStatus;
  classification: MessageClassification | null;
  recommended_action: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  provider_message_id: string | null;
  /** DISC-CAMP-P0-02.3: set while a send is in flight; the compare-and-set that makes a
   * message send once. */
  send_claimed_at?: string | null;
  /** Counts definite failures; part of the provider idempotency key. */
  send_attempt?: number;
  /** Set when this message was generated from one of the founder's Resend templates
   * (resend.com/docs/dashboard/templates) instead of free-form AI copy -- send.ts sends
   * via Resend's `template: { id, variables }` API when set, raw html/text otherwise.
   * `resend_template_name` is captured once at generation time for display; the
   * template lives in Resend, not this database, so this is a denormalized label, not
   * a live lookup. Both null for a free-form message. */
  resend_template_id: string | null;
  resend_template_name: string | null;
  template_variables: Record<string, string | number> | null;
  created_at: string;
  updated_at: string;
};

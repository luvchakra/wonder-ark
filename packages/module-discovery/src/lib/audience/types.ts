/**
 * DISC-CONS-P0-03.1/04.1: people who opted in to an offering, and what they say. Shapes
 * only: no server code, so client components may import it.
 */

export const LEAD_STATUSES = ["new", "contacted", "interviewed", "active", "unsubscribed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  interviewed: "Interviewed",
  active: "Active",
  unsubscribed: "Unsubscribed",
};

export const LEAD_SOURCES = ["waitlist", "import", "manual"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  waitlist: "Sign-up page",
  import: "Import",
  manual: "Added by hand",
};

/** discovery.audience_leads, as a member may read it (never the private token). */
export type AudienceLead = {
  id: string;
  workspace_id: string;
  email: string;
  name: string | null;
  answers: Record<string, string>;
  consent_text: string | null;
  consent_at: string | null;
  source: LeadSource;
  referrer_lead_id: string | null;
  utm: Record<string, string>;
  status: LeadStatus;
  party_id: string | null;
  tags: string[];
  referral_code: string;
  confirmation_sent_at: string | null;
  survey: { questions: string[]; sent_at: string } | null;
  created_at: string;
};

/** Every column a member may select. `lead_token` is the service role's only. */
export const LEAD_COLUMNS =
  "id, workspace_id, email, name, answers, consent_text, consent_at, source, referrer_lead_id, utm, status, party_id, tags, referral_code, confirmation_sent_at, survey, created_at";

export type AudienceLeadWithReferrals = AudienceLead & { referrals: number };

export type SignupPage = {
  id: string;
  workspace_id: string;
  token: string;
  enabled: boolean;
  value_line: string | null;
  questions: string[];
  consent_text: string;
  created_at: string;
  updated_at: string;
};

export const FEEDBACK_KINDS = ["interview", "survey", "comment"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  interview: "Conversation",
  survey: "Answers",
  comment: "Comment",
};

export type AudienceFeedback = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  prospect_id: string | null;
  kind: FeedbackKind;
  body: string;
  tags: string[];
  created_at: string;
};

/** What a public sign-up returns. Never says whether an address was already on the
 * list (B5.3.3): a new sign-up, a repeat and a honeypot hit all read "joined". */
export type SignupOutcome =
  | { status: "joined" }
  | { status: "invalid"; message: string }
  | { status: "rate_limited" }
  | { status: "unavailable" };

export type SignupState = SignupOutcome | null;

/** What a signed-in action on a person reports. */
export type LeadActionState = { status: "completed" | "failed"; message: string } | null;

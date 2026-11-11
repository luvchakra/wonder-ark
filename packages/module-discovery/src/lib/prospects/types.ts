export type ProspectStatus = "new" | "qualified" | "disqualified";

/** "open" until a conversation with this prospect is closed (docs: Conversations
 * redesign) -- set to "won" or "lost" at that point. Separate from `status` (a
 * qualification judgment made early in the pipeline): outcome is the deal result, and a
 * prospect can have conversations across multiple channels, so it lives here rather than
 * on any one conversation. */
export type ProspectOutcome = "open" | "won" | "lost";

export type Prospect = {
  id: string;
  workspace_id: string;
  company_name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  company_size: string | null;
  location: string | null;
  description: string | null;
  status: ProspectStatus;
  outcome: ProspectOutcome;
  fit_score: number | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  company_email: string | null;
  party_id: string | null;
  created_at: string;
  updated_at: string;
  /** DISC-DATA-P0-01.2: where the prospect came from -- all additive, and absent on a
   * value built before these columns existed (hence optional here). `kind` is 'company'
   * for an organisation or 'channel' for a named public outlet, in which case
   * `company_name` holds the channel's name. `source` is the id of the source that found
   * it ('web_search', or the gateway's provider id), `source_name` its attribution text
   * and `source_ref` a link back to the record. `field_sources` maps a column a source
   * filled to where that value came from; a value a person typed has no entry. */
  kind?: ProspectKind;
  source?: string | null;
  source_name?: string | null;
  source_ref?: string | null;
  phone?: string | null;
  channel_type?: string | null;
  audience_size?: number | null;
  field_sources?: Record<string, ProspectFieldSource>;
};

export type ProspectKind = "company" | "channel";

/** One entry of `prospects.field_sources`. */
export type ProspectFieldSource = {
  provider: string;
  name: string;
  url: string | null;
  observedAt: string | null;
};

export type ProspectSuggestion = {
  id: string;
  workspace_id: string;
  company_name: string;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  location: string | null;
  description: string | null;
  match_reason: string | null;
  source_url: string | null;
  created_at: string;
  /** DISC-DATA-P0-01.2: where the suggestion came from. `source` is 'web_search' for the
   * AI web search, otherwise the gateway's provider id; `external_id` is the source's own
   * id for the record, and `payload` the validated gateway record it was staged from.
   * Optional for the same reason as on `Prospect`. */
  kind?: ProspectKind;
  source?: string | null;
  source_name?: string | null;
  source_ref?: string | null;
  external_id?: string | null;
  payload?: unknown;
};

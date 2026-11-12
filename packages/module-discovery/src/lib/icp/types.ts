export type IcpStatus = "draft" | "approved";

export type IcpProfile = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  industries: string[];
  company_sizes: string[];
  geographies: string[];
  roles: string[];
  pain_points: string[];
  buying_signals: string[];
  exclusions: string[];
  /** DISC-OFFER-P0-02.2's own field-list additions -- the backlog's "revenue/business
   * model/technology/growth stage/existing tools" beyond what this table already had. */
  revenue: string[];
  business_model: string[];
  technology: string[];
  growth_stage: string[];
  existing_tools: string[];
  /** DISC-CONS-P0-01.2: the Ideal user of a consumer offering (`lib/icp/audience.ts`),
   * null for an offering sold to companies only. Read through `readIdealUser`. */
  audience?: unknown;
  /** DISC-OFFER-P0-13.1: "Structured Stage Outputs" -- the doc's own worked ICP example
   * names `confidence`/`evidence` alongside the list fields above; both are nullable/
   * empty rather than defaulted, since a row created before this story (or since edited
   * by hand -- see `updateIcpProfile`) has genuinely never had either computed, which is
   * a different fact from "computed and found unconfident/unsupported." `evidence` is a
   * plain array of short quotes/paraphrases from the product profile, not the richer
   * `EvidenceItem` shape research/buyer-intelligence use -- see the migration's own
   * comment for why that fuller shape doesn't fit a single-call ICP synthesis. */
  confidence: number | null;
  evidence: string[];
  status: IcpStatus;
  /** DISC-OFFER-P0-14.2: "Versioned Stage Results" -- the current version number, always
   * in sync with the latest row in `icp_profile_versions` (there is no separate
   * "is_current" flag to drift). 0 for an ICP that predates this story and has never
   * been written to since -- its own current content has genuinely never been
   * snapshotted, a different fact from "this is version 1". */
  version: number;
  created_at: string;
  updated_at: string;
};

/** DISC-OFFER-P0-14.2: which of the two things that ever overwrite an ICP's content
 * produced this particular version -- a closed vocabulary, not open-ended free text (the
 * same discipline `PipelineRunTrigger` already established). */
export type IcpProfileVersionSource = "ai_generated" | "user_edit";

/** DISC-OFFER-P0-14.2: one immutable snapshot of `IcpProfile`'s own content fields, taken
 * every time that content changes. `id`/`workspace_id`/`icp_id`/`version`/`source`/
 * `created_at` are this table's own columns; every other field mirrors `IcpProfile`
 * exactly so a version can be rendered with the same field list as the live ICP. */
export type IcpProfileVersion = {
  id: string;
  workspace_id: string;
  icp_id: string;
  version: number;
  source: IcpProfileVersionSource;
  name: string;
  description: string | null;
  industries: string[];
  company_sizes: string[];
  geographies: string[];
  roles: string[];
  pain_points: string[];
  buying_signals: string[];
  exclusions: string[];
  revenue: string[];
  business_model: string[];
  technology: string[];
  growth_stage: string[];
  existing_tools: string[];
  /** DISC-CONS-P0-01.2: the Ideal user as it stood in this version. */
  audience?: unknown;
  confidence: number | null;
  evidence: string[];
  status: IcpStatus;
  created_at: string;
};

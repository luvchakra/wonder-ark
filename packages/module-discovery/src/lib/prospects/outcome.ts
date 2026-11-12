import type { ProspectOutcome, ProspectStatus } from "./types";

/**
 * DISC-OFFER-P1 §7-02.2 "Discovery Outcome Tracking" -- the doc's own ten-stage list,
 * verbatim. "Discovery should retain downstream outcome references but not own CRM
 * lifecycle": the last four (`qualified`/`won`/`lost`/`nurture`) are read live from
 * `crm.lead.status` via the already-existing `getDiscoveryHandoffLead` contract call
 * (module-crm/contract/index.ts) -- Discovery never writes to that field, only displays
 * it, the same "reference, don't own" shape `module-crm`'s own `getDiscoveryCrmFunnel`
 * already established in the opposite direction (CRM reading Discovery's own
 * `getProspectFunnelCounts` contract rather than querying Discovery's tables directly).
 *
 * Never stored -- same "derive from what already exists, don't add a column nothing
 * would keep in sync" precedent as `deriveProspectPipelineState` (pipeline.ts) and
 * `computeHandoffStatus` (opportunities/handoff.ts). A rescore, a new message, or a
 * status change on the downstream CRM lead all change this on the next read for free.
 */
export type DiscoveryOutcomeStage =
  | "discovered"
  | "reviewed"
  | "accepted"
  | "contacted"
  | "conversation"
  | "crm_handoff"
  | "qualified"
  | "won"
  | "lost"
  | "nurture";

export const DISCOVERY_OUTCOME_STAGE_LABEL: Record<DiscoveryOutcomeStage, string> = {
  discovered: "Discovered",
  reviewed: "Reviewed",
  accepted: "Accepted",
  contacted: "Contacted",
  conversation: "Conversation",
  crm_handoff: "CRM Handoff",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
};

/**
 * DISC-CONS-P0-02.2 (B5.2.5): a channel's pipeline reuses the same stages and outcome;
 * only the word changes. A channel that is "won" is one the offering is live on (a post
 * up, a feature or a sponsorship agreed), so it reads "Live".
 */
export function outcomeStageLabel(stage: DiscoveryOutcomeStage, kind?: string | null): string {
  if (stage === "won" && kind === "channel") return "Live";
  return DISCOVERY_OUTCOME_STAGE_LABEL[stage];
}

/** The word for a prospect's own outcome value ("won" or "lost"), for its kind. */
export function prospectOutcomeLabel(outcome: "won" | "lost", kind?: string | null): string {
  if (outcome === "won") return kind === "channel" ? "Live" : "Won";
  return "Lost";
}

export type DiscoveryOutcomeStageInput = {
  hasResearch: boolean;
  prospectStatus: ProspectStatus;
  hasSentMessage: boolean;
  hasConversation: boolean;
  /** True once an opportunity for this prospect has been sent to CRM, or a CRM lead for
   * it already exists on file -- the same signal `computeHandoffStatus` already reads,
   * just collapsed to a boolean here (this story only needs "has handoff happened", not
   * which of the four handoff-mechanics states it's in). */
  handedOffToCrm: boolean;
  /** `crm.lead.status` for this prospect's own handoff lead (via
   * `getDiscoveryHandoffLead`), or `null` when no CRM lead exists yet. Deliberately a
   * plain string, not CRM's own `LeadStatus` type -- module-discovery may only import
   * module-crm's `contract/index.ts`, and comparing against the four literal values this
   * function actually cares about needs no shared type. Any other CRM lead status (e.g.
   * "new", "contacted", "opportunity", "unresponsive", "disqualified") is treated as
   * "no reportable downstream outcome yet", same as `null`. */
  downstreamLeadStatus: string | null;
  /** Discovery's own `prospects.outcome` -- set locally when a conversation closes,
   * independent of any CRM handoff (a deal can close entirely within Discovery before
   * ever touching CRM). Checked before `handedOffToCrm` so a closed-won/lost prospect
   * that was never sent to CRM still reports its real outcome rather than falling back
   * to an earlier, less-advanced stage. */
  prospectOutcome: ProspectOutcome;
};

/**
 * Priority order matches the doc's own listed sequence, checked furthest-downstream
 * first -- same "the furthest point reached wins" shape `deriveProspectPipelineState`
 * and `computeHandoffStatus` both already use. The downstream CRM lead's own status is
 * checked first: once CRM reports qualified/won/lost/nurture, that's the more
 * authoritative, more current signal than anything computed purely within Discovery.
 */
export function computeDiscoveryOutcomeStage(input: DiscoveryOutcomeStageInput): DiscoveryOutcomeStage {
  if (input.downstreamLeadStatus === "won") return "won";
  if (input.downstreamLeadStatus === "lost") return "lost";
  if (input.downstreamLeadStatus === "nurture") return "nurture";
  if (input.downstreamLeadStatus === "qualified") return "qualified";
  if (input.prospectOutcome === "won") return "won";
  if (input.prospectOutcome === "lost") return "lost";
  if (input.handedOffToCrm) return "crm_handoff";
  if (input.hasConversation) return "conversation";
  if (input.hasSentMessage) return "contacted";
  if (input.prospectStatus === "qualified") return "accepted";
  if (input.hasResearch) return "reviewed";
  return "discovered";
}

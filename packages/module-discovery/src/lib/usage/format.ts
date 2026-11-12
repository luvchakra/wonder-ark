import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "./limits";

/** Founder-facing label per `ai_runs.operation` value -- shared by every usage view
 * (product-level, business-level) so the wording never drifts between them. */
export const OPERATION_LABEL: Record<string, string> = {
  understand_product: "Offering profile",
  generate_icp: "ICP generation",
  research_prospect: "Prospect research",
  discover_prospects: "Prospect discovery",
  generate_outreach_strategy: "Outreach strategy",
  generate_outreach_message: "Message generation",
  write_campaign_messages: "Campaign messages",
  generate_reply: "Reply generation",
  classify_reply: "Reply classification",
  chat: "AI assistant",
  // DISC-DATA-P0-02.3: prospect-data lookups through the WorksLake gateway, recorded in
  // the same ledger (lib/data-sources/runs.ts) so they show beside the AI runs.
  gateway_search: "Prospect search (WorksLake)",
  gateway_signals: "Hiring signals (WorksLake)",
  gateway_enrich: "Prospect enrichment (WorksLake)",
  gateway_contacts: "Contact lookup (WorksLake)",
};

/** Founder-facing usage is expressed as "% of AI credits used," never a raw dollar
 * figure -- the underlying free-tier cap is still tracked in USD (limits.ts), this is
 * just the display framing. Clamped to 100 since spend can exceed the cap briefly before
 * assertWithinUsageLimit blocks further runs. */
export function creditsUsedPercent(totalCost: number, limitUsd = FREE_TIER_MONTHLY_COST_LIMIT_USD): number {
  if (limitUsd <= 0) return 0;
  return Math.min(100, Math.round((totalCost / limitUsd) * 100));
}

import { cn } from "@cofounderai/core/lib/utils";
import { outcomeStageLabel, type DiscoveryOutcomeStage } from "../../lib/prospects/outcome";

const TERMINAL_STYLE: Partial<Record<DiscoveryOutcomeStage, string>> = {
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-muted text-muted-foreground",
  nurture: "bg-amber-100 text-amber-800",
  qualified: "bg-primary/10 text-primary",
};

/** DISC-OFFER-P1 §7-02.2 "Discovery Outcome Tracking" -- the doc's own ten-stage
 * reference, shown as a single current-stage tag next to the existing pipeline-stage
 * indicator. Deliberately a second, separate badge rather than replacing
 * `PROSPECT_STAGE_LABEL` above it -- that one tracks Discovery's own upstream working
 * stages (research/score/strategy/messages), this one is the wider reference spanning
 * into CRM's own downstream lifecycle; conflating them would lose the "not own CRM
 * lifecycle" distinction the doc itself draws. */
export function DiscoveryOutcomeBadge({ stage, kind }: { stage: DiscoveryOutcomeStage; kind?: string | null }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TERMINAL_STYLE[stage] ?? "bg-muted text-muted-foreground")}>
      {outcomeStageLabel(stage, kind)}
    </span>
  );
}

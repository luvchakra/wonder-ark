import { Check } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { PROSPECT_STAGES, type ProspectStage } from "../../lib/prospects/pipeline";

/**
 * DISC-NAV-P0-01.12: one prospect's way to becoming a customer, as five steps with a green
 * tick on each one done. Worked out from the prospect's derived pipeline stage and its
 * outcome, so it shows only what really happened.
 */
const STEPS: { label: string; reachedAt: ProspectStage }[] = [
  { label: "Research", reachedAt: "researched" },
  { label: "Score", reachedAt: "scored" },
  { label: "Write", reachedAt: "messaged" },
  { label: "Send", reachedAt: "sent" },
  { label: "Reply", reachedAt: "replied" },
];

export function prospectProgress(stage: ProspectStage, outcome: "open" | "won" | "lost") {
  const at = PROSPECT_STAGES.indexOf(stage);
  return [
    ...STEPS.map((s) => ({ label: s.label, done: at >= PROSPECT_STAGES.indexOf(s.reachedAt) })),
    { label: "Won", done: outcome === "won" },
  ];
}

export function ProspectProgress({ stage, outcome }: { stage: ProspectStage; outcome: "open" | "won" | "lost" }) {
  return (
    <ol aria-label="Progress" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {prospectProgress(stage, outcome).map((s) => (
        <li key={s.label} className={cn("flex items-center gap-1", s.done ? "font-medium text-emerald-700" : "text-muted-foreground")}>
          {s.done ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/40" />}
          {s.label}
          {s.done ? <span className="sr-only"> (done)</span> : null}
        </li>
      ))}
    </ol>
  );
}

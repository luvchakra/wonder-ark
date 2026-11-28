import type { ConversionFunnel } from "../../lib/prospects/pipeline";

const reached = (funnel: ConversionFunnel, stage: string) => funnel.steps.find((step) => step.stage === stage)?.reached ?? 0;

/**
 * DISC-NAV-P0-02.4: Results in one row, in the order it happens: how many prospects the
 * offering has, how many were contacted, how many replied, how many were won (owner,
 * 2026-11-28: the tab had too many items). Every figure is a count of the offering's own
 * prospects: a message sent, a reply received, an outcome marked Won. The rate under a
 * figure is shown only when there is something to divide by.
 */
export function ResultsSummary({ funnel, wonCount }: { funnel: ConversionFunnel; wonCount: number }) {
  const contacted = reached(funnel, "sent");
  const replied = reached(funnel, "replied");
  const figures: { label: string; value: number; note: string | null }[] = [
    { label: "Prospects", value: funnel.total, note: null },
    { label: "Contacted", value: contacted, note: null },
    { label: "Replied", value: replied, note: contacted > 0 ? `${funnel.replyRate}% of contacted` : null },
    { label: "Won", value: wonCount, note: null },
  ];
  return (
    <dl aria-label="Results so far" className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-card px-2 py-3 text-center">
      {figures.map((figure) => (
        <div key={figure.label} className="flex min-w-0 flex-col">
          <dt className="order-2 truncate text-xs text-muted-foreground">{figure.label}</dt>
          <dd className="order-1 text-xl font-semibold tabular-nums">{figure.value}</dd>
          {figure.note ? <dd className="order-3 truncate text-[11px] text-muted-foreground">{figure.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

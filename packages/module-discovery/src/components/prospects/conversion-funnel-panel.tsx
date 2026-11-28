import type { ConversionFunnel } from "../../lib/prospects/pipeline";

/** Renders a computed ConversionFunnel (lib/prospects/pipeline.ts) as KPI cards plus a
 * per-stage bar chart -- shared by the per-product Conversions tab and the account-wide
 * dashboard summary so both look and compute identically. */
export function ConversionFunnelPanel({
  funnel,
  wonCount = 0,
  figures = true,
}: {
  funnel: ConversionFunnel;
  /** DISC-NAV-P0-02.4: false leaves out the four figure cards, where the page already
   * shows the counts (the offering's Results). */
  figures?: boolean;
  /** Prospects with outcome "won" -- the account's actual customer count. Separate from
   * the funnel's "closed" stage, which only means a conversation ended (it says nothing
   * about whether the deal was won or lost). */
  wonCount?: number;
}) {
  const { total, steps, replyRate, closeRate } = funnel;

  // Derived straight from the funnel's own step counts -- no extra props needed. "closed"
  // means the conversation ended, win or lose, so it doubles as (won + lost) for a win
  // rate, and total - closed is whatever's still active in the pipeline.
  const closedCount = steps.find((s) => s.stage === "closed")?.reached ?? 0;
  const sentCount = steps.find((s) => s.stage === "sent")?.reached ?? 0;
  const repliedCount = steps.find((s) => s.stage === "replied")?.reached ?? 0;
  const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Customers (won) leads the grid -- it's the metric that actually matters most
          here (the others are how you got there), so it gets top-left / first-read
          position rather than being buried third. */}
      {figures ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Customers (won)</p>
          <p className="mt-1 text-2xl font-semibold">{wonCount}</p>
          {winRate !== null ? <p className="mt-1 text-xs text-muted-foreground">{winRate}% win rate</p> : null}
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Total prospects</p>
          <p className="mt-1 text-2xl font-semibold">{total}</p>
          {closedCount > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {total - closedCount} active · {closedCount} closed
            </p>
          ) : null}
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Reply rate</p>
          <p className="mt-1 text-2xl font-semibold">{replyRate}%</p>
          {sentCount > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {repliedCount} of {sentCount} sent replied
            </p>
          ) : null}
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Overall conversion</p>
          <p className="mt-1 text-2xl font-semibold">{closeRate}%</p>
          {total > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {closedCount} of {total} closed
            </p>
          ) : null}
        </div>
      </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-md border p-4">
        <h3 className="font-medium">Pipeline funnel</h3>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add prospects to see your conversion funnel.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {steps.map((step, i) => {
              const percentOfTotal = total > 0 ? Math.round((step.reached / total) * 100) : 0;
              const prevReached = i > 0 ? steps[i - 1]!.reached : total;
              const stepRate =
                prevReached > 0 ? Math.round((step.reached / prevReached) * 100) : 0;
              return (
                <div key={step.stage} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted-foreground">{step.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percentOfTotal}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-medium">{step.reached}</span>
                  {i > 0 ? (
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                      {stepRate}% of prev
                    </span>
                  ) : (
                    <span className="w-16 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

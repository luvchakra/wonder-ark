import type { OfferingPerformanceAnalysis, RateBucket } from "../../lib/performance-analysis/types";

function RateBucketList({ buckets }: { buckets: RateBucket[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {buckets.map((b) => (
        <li key={b.label} className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5">
          <span className="truncate">{b.label}</span>
          <span className="shrink-0 text-muted-foreground">
            {b.rate}% <span className="text-xs">({b.matched}/{b.total})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * DISC-OFFER-P1-02.3 "Offering Performance Analysis" -- the doc's questions, each its own
 * block. Plays are answered per Discovery Definition (see types.ts).
 *
 * DISC-NAV-P0-02.4: only a question with rows gets a block; the ones with nothing to show
 * yet are named together in one closing line, so an early offering is not five empty
 * boxes (owner, 2026-11-28). Nothing is hidden: every question is either answered or named.
 */
export function OfferingPerformanceAnalysisView({ analysis }: { analysis: OfferingPerformanceAnalysis }) {
  const blocks: { title: string; note: string; buckets: RateBucket[] }[] = [
    { title: "Signals that start conversations", note: "Share of prospects with each signal who had a conversation.", buckets: analysis.signalsProducingConversations },
    { title: "Industries that convert", note: "Won rate by each prospect's own industry.", buckets: analysis.industryConversionRates },
    { title: "Places that convert", note: "Won rate by each prospect's own location.", buckets: analysis.locationConversionRates },
    { title: "Buyer roles that reply", note: "Reply rate by contact job title, among conversations linked to a named contact.", buckets: analysis.buyerRolesThatRespond },
    { title: "Score against outcome", note: "Won rate by score range.", buckets: analysis.scoreVsOutcome },
    { title: "Discovery Plays", note: "Share of each play's opportunities sent to CRM.", buckets: analysis.playsPerformance },
  ];
  const answered = blocks.filter((block) => block.buckets.length > 0);
  const empty = blocks.filter((block) => block.buckets.length === 0);
  return (
    <div className="flex flex-col gap-4">
      {answered.map((block) => (
        <section key={block.title} className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">{block.title}</h3>
          <p className="text-xs text-muted-foreground">{block.note}</p>
          <RateBucketList buckets={block.buckets} />
        </section>
      ))}
      {empty.length > 0 ? (
        <p className="text-xs text-muted-foreground">Nothing recorded yet for: {empty.map((block) => block.title).join(", ")}.</p>
      ) : null}
    </div>
  );
}

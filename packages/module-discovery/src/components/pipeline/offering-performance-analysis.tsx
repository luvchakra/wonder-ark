import type { OfferingPerformanceAnalysis, RateBucket } from "../../lib/performance-analysis/types";
import { SectionFold } from "../ui/section-fold";

function RateBucketList({ buckets, emptyMessage }: { buckets: RateBucket[]; emptyMessage: string }) {
  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
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
 * DISC-NAV-P0-02.3: a section's answer in one line, from its own rows and nothing else: the
 * row with the most matches (ties go to the higher rate), or that there are none yet.
 */
export function leadingLine(buckets: RateBucket[], emptyMessage: string, noneYet: string): string {
  if (buckets.length === 0) return emptyMessage;
  const best = [...buckets].sort((a, b) => b.matched - a.matched || b.rate - a.rate)[0]!;
  if (best.matched === 0) return noneYet;
  return `${best.label}: ${best.rate}% (${best.matched}/${best.total})`;
}

/**
 * DISC-OFFER-P1-02.3 "Offering Performance Analysis" -- the doc's five questions, each its
 * own section. Plays are answered per Discovery Definition (see types.ts).
 *
 * DISC-NAV-P0-02.3: each question is a closed fold whose summary line is its leading
 * answer, so Results reads as five lines until one is opened (owner, 2026-11-27).
 */
export function OfferingPerformanceAnalysisView({ analysis }: { analysis: OfferingPerformanceAnalysis }) {
  const places = [...analysis.industryConversionRates, ...analysis.locationConversionRates];
  return (
    <div className="flex flex-col gap-3">
      <SectionFold
        title="Signals that start conversations"
        hint={leadingLine(analysis.signalsProducingConversations, "No signals recorded yet.", "No conversations from a signal yet.")}
      >
        <RateBucketList buckets={analysis.signalsProducingConversations} emptyMessage="No signals recorded yet." />
      </SectionFold>

      <SectionFold title="Industries and places that convert" hint={leadingLine(places, "No prospects with an industry or a location yet.", "None won yet.")}>
        <p className="text-xs text-muted-foreground">Won rate by each prospect&apos;s own industry and location.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Industry</p>
            <RateBucketList buckets={analysis.industryConversionRates} emptyMessage="No prospects with an industry on file yet." />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Location</p>
            <RateBucketList buckets={analysis.locationConversionRates} emptyMessage="No prospects with a location on file yet." />
          </div>
        </div>
      </SectionFold>

      <SectionFold
        title="Buyer roles that reply"
        hint={leadingLine(analysis.buyerRolesThatRespond, "No conversations linked to a named contact yet.", "No replies yet.")}
      >
        <p className="text-xs text-muted-foreground">Reply rate by contact job title, among conversations linked to a named contact.</p>
        <RateBucketList buckets={analysis.buyerRolesThatRespond} emptyMessage="No conversations linked to a named contact yet." />
      </SectionFold>

      <SectionFold title="Score against outcome" hint={leadingLine(analysis.scoreVsOutcome, "No scored prospects yet.", "None won yet.")}>
        <p className="text-xs text-muted-foreground">Won rate by score range.</p>
        <RateBucketList buckets={analysis.scoreVsOutcome} emptyMessage="No scored prospects yet." />
      </SectionFold>

      <SectionFold
        title="Discovery Plays"
        hint={leadingLine(analysis.playsPerformance, "No opportunities found by a Discovery Play yet.", "None sent to CRM yet.")}
      >
        <p className="text-xs text-muted-foreground">Share of each play&apos;s opportunities sent to CRM.</p>
        <RateBucketList buckets={analysis.playsPerformance} emptyMessage="No opportunities found by a Discovery Play yet." />
      </SectionFold>
    </div>
  );
}

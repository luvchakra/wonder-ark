import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { MoreActions } from "../ui/more-actions";
import { effectiveRecommendedAction } from "../../lib/opportunities/next-best-action";
import { NEXT_BEST_ACTION_LABEL, type Opportunity } from "../../lib/opportunities/types";
import type { Prospect } from "../../lib/prospects/types";
import { SendToCrmButton, type RelationshipMatch } from "./send-to-crm-button";

type PromoteResult = { ok: true; data: { leadId: string; alreadyPromoted: boolean } } | { ok: false; error: string };

const CONFIDENCE_BADGE_CLASS: Record<"low" | "medium" | "high", string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-muted text-muted-foreground",
};

/**
 * DISC-OFFER-P0-15.1: "Final Human Action Gate" -- the doc's own literal worked example
 * (Top Opportunity / Acme Corp / Score: 92 / Why Now / Contact / Recommended Action /
 * Confidence, with [Edit Recommendation] [Send to CRM] [Watch] [Dismiss]), rendered on
 * the offering Overview page right where the automated pipeline (DISC-OFFER-P0-10.1)
 * hands off to a human -- the doc's own §13 diagram places "Human Approval" right before
 * CRM Handoff, and `runCrmHandoffStage`'s own comment already names this exact story as
 * the reason it only ever counts ready opportunities rather than sending anything.
 * "Automation should stop before external action" already holds structurally (this
 * card, like every other Discovery surface, only ever labels/counts -- nothing here
 * sends a message or writes to CRM on its own, a founder's own click on one of the four
 * buttons below does); this component exists to make that stopping point visible and
 * decisive rather than only true in the abstract.
 *
 * Three of the four buttons reuse real, already-existing mechanisms unchanged: `Send to
 * CRM` is the identical `SendToCrmButton` (DISC-OFFER-P0-08.1) the Opportunity Detail
 * page already uses, `Watch`/`Dismiss` are one-click forms over `setOpportunityStatus`
 * (05.1). `Edit Recommendation` deliberately links to the Opportunity Detail page's own
 * `#recommended-action` section rather than duplicating a second inline override editor
 * here -- the same "the real page is the way to act on the rest" restraint this run has
 * applied repeatedly (DISC-OFFER-P0-01.3's long descriptions, DISC-OFFER-P0-10.3's
 * underlying-stage links) -- flagged here as a scope call rather than silently decided.
 */
export function TopOpportunityGate({
  businessId,
  productId,
  opportunity,
  prospect,
  contactName,
  hasParty,
  relationship,
  watchAction,
  dismissAction,
  sendToCrmAction,
}: {
  businessId: string;
  productId: string;
  opportunity: Opportunity;
  prospect: Prospect;
  contactName: string | null;
  hasParty: boolean;
  relationship: RelationshipMatch | null;
  watchAction: () => Promise<void>;
  dismissAction: () => Promise<void>;
  sendToCrmAction: () => Promise<PromoteResult>;
}) {
  const opportunityPath = `/dashboard/businesses/${businessId}/discovery/offerings/${productId}/opportunities/${opportunity.id}`;
  const action = effectiveRecommendedAction(opportunity);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-muted-foreground">Top Opportunity</h2>
        <Link href={opportunityPath} className="text-xs text-muted-foreground hover:underline">
          View full detail →
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={opportunityPath} className="text-lg font-semibold hover:underline">
            {prospect.company_name}
          </Link>
          <Badge variant="outline">{opportunity.priority} priority</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Score:</span>
          <span className="text-xl font-semibold">{opportunity.score ?? "—"}</span>
        </div>
      </div>

      {opportunity.why_now ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Why Now</p>
          <p className="text-sm">{opportunity.why_now}</p>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium text-muted-foreground">Contact</p>
        <p className="text-sm">{contactName ?? "No contact recorded yet."}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Recommended Action</p>
        <p className="text-sm font-medium">
          {action ? NEXT_BEST_ACTION_LABEL[action] : "No recommendation yet"}
          {opportunity.recommended_action_override ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(founder override)</span>
          ) : null}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Confidence:</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CONFIDENCE_BADGE_CLASS[opportunity.confidence]}`}>
          {opportunity.confidence}
        </span>
      </div>

      {/* DISC-NAV-P0-01.9: one action in view; the rest folded under More. */}
      <div className="mt-1 flex flex-wrap items-start gap-2">
        <SendToCrmButton hasParty={hasParty} relationship={relationship} sendAction={sendToCrmAction} />
        <MoreActions>
          <Link
            href={`${opportunityPath}#recommended-action`}
            className="inline-flex h-8 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
          >
            Edit Recommendation
          </Link>
          <form action={watchAction}>
            <SubmitButton size="sm" variant="outline" pendingText="Saving...">
              Watch
            </SubmitButton>
          </form>
          <form action={dismissAction}>
            <SubmitButton size="sm" variant="outline" pendingText="Saving...">
              Dismiss
            </SubmitButton>
          </form>
        </MoreActions>
      </div>
    </section>
  );
}

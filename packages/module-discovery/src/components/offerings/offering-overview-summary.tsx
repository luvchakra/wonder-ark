import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { buttonVariants } from "@cofounderai/core/ui/button";
import { AiActionForm } from "../ai/ai-action-form";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { OFFERING_STATUS_LABEL, OFFERING_TYPE_LABEL } from "../../lib/offerings/types";
import type { Offering } from "../../lib/offerings/types";
import {
  computeOfferingDefinitionQuality,
  QUALITY_DIMENSION_LABEL,
  QUALITY_LEVEL_LABEL,
  type OfferingDefinitionQualityDimension,
  type QualityLevel,
} from "../../lib/offerings/definition-quality";
import { identifyMissingOfferingInformation } from "../../lib/offerings/missing-information";
import { PERSONA_PRIORITY_LABEL, PERSONA_ROLE_LABEL } from "../../lib/personas/types";
import type { BuyerPersona } from "../../lib/personas/types";
import type { IcpProfile } from "../../lib/icp/types";
import type { ProspectCounts } from "../../lib/prospects/queries";
import type { OpportunityOutcomeFunnel } from "../../lib/opportunities/outcome-funnel";

const QUALITY_DIMENSION_ORDER: OfferingDefinitionQualityDimension[] = [
  "description",
  "target_customer",
  "icp_evidence",
  "buyer_evidence",
  "differentiation",
];

const QUALITY_LEVEL_BADGE_VARIANT: Record<QualityLevel, "default" | "secondary" | "outline"> = {
  strong: "default",
  medium: "secondary",
  weak: "outline",
};

const ICP_LIST_FIELDS = [
  "industries",
  "company_sizes",
  "geographies",
  "roles",
  "pain_points",
  "buying_signals",
  "exclusions",
  "revenue",
  "business_model",
  "technology",
  "growth_stage",
  "existing_tools",
] as const;

function icpFieldsDefined(icp: IcpProfile): number {
  return ICP_LIST_FIELDS.filter((field) => icp[field].length > 0).length;
}

/**
 * DISC-OFFER-P0-03.2's "Offering Discovery Overview" -- "what should I do today for this
 * offering?" answered from data that genuinely exists today only. The backlog's own
 * suggested section list also includes Active Discovery Plays / Today's Opportunities /
 * Recent Signals / Watchlist / CRM Handoffs -- all deliberately left out here since none
 * of those entities exist yet (they're 04.2/05.x-07.x/P1/08.x's own stories); adding them
 * now would mean either fabricated numbers or empty placeholders, the same false-
 * precision problem already avoided in 01.3's offerings table. This card set grows as
 * those stories land, each adding its own real section rather than a stub.
 */
export function OfferingOverviewSummary({
  businessSlug,
  offering,
  icp,
  personas,
  prospectCounts,
  outcomeFunnel,
  researchFurtherAction,
}: {
  /** DISC-OFFER-P1-05.4: links use the slug route -- the old /dashboard/businesses/<id>
   * path had no route and every link here 404'd. */
  businessSlug: string;
  offering: Offering;
  icp: IcpProfile | null;
  personas: BuyerPersona[];
  prospectCounts: ProspectCounts;
  /** DISC-OFFER-P1-04.2: "Learn From Outcomes" -- null reads as "not computed for this
   * render," same treatment `icp`/other optional props already get; the card itself
   * additionally hides whenever there are zero opportunities yet (see below). */
  outcomeFunnel: OpportunityOutcomeFunnel | null;
  /** DISC-OFFER-P1-03.2: the missing-information callout's own "[Research Further]" --
   * a forced ICP regeneration, identical to the ICP page's own "Regenerate" button. */
  researchFurtherAction: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
}) {
  const basePath = `/${businessSlug}/discovery/offerings/${offering.id}`;
  const icpFieldsCount = icp ? icpFieldsDefined(icp) : 0;
  // DISC-OFFER-P1-03.1: "Offering Definition Quality" -- shown right here rather than a
  // new section elsewhere, since this component already only renders once
  // `product.product_profile` exists (the page's own gate above), which is exactly the
  // doc's own "after website analysis" trigger -- no new data fetching needed, every
  // input this diagnostic reads (`offering.detailed_description`/`offering.product_profile`,
  // `icp`, `personas`) is already a prop here.
  const quality = computeOfferingDefinitionQuality({
    detailedDescription: offering.detailed_description,
    icp,
    personas,
    productProfile: offering.product_profile,
  });
  // DISC-OFFER-P1-03.2: "Missing Information Suggestions" -- same gate/placement
  // reasoning as P1-03.1 just above (this component already only renders once a
  // product profile exists, i.e. "we understand what you sell"); an empty result means
  // genuinely nothing is missing, so the callout itself doesn't render at all rather
  // than showing an empty "less certain about" list.
  const missingInformation = identifyMissingOfferingInformation({ icp, personas });

  const nextAction = !icp
    ? { label: "Define your ICP", href: `${basePath}/icp` }
    : icp.status === "draft"
      ? { label: "Review and approve your ICP", href: `${basePath}/icp` }
      : personas.length === 0
        ? { label: "Add buyer personas", href: `${basePath}/icp` }
        : prospectCounts.total === 0
          ? { label: "Discover prospects", href: `${basePath}/prospects` }
          : { label: "Review your prospects", href: `${basePath}/prospects` };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What should I do today?</p>
        <Link href={nextAction.href} className="text-sm font-medium text-primary hover:underline">
          {nextAction.label} &rarr;
        </Link>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Offering definition quality</p>
          <span className="text-sm font-semibold">{quality.overall}/100</span>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {QUALITY_DIMENSION_ORDER.map((dimension) => (
            <div key={dimension} className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{QUALITY_DIMENSION_LABEL[dimension]}</span>
              <Badge variant={QUALITY_LEVEL_BADGE_VARIANT[quality.dimensions[dimension]]}>
                {QUALITY_LEVEL_LABEL[quality.dimensions[dimension]]}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {missingInformation.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm">We understand what you sell.</p>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">We are less certain about</p>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {missingInformation.map((item) => (
                <li key={item.field}>{item.label}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <AiActionForm
              action={researchFurtherAction}
              buttonLabel="Research Further"
              pendingText="Researching..."
              buttonProps={{ variant: "outline" }}
              wrapperClassName="flex flex-col items-start gap-2"
            >
              <input type="hidden" name="force" value="true" />
            </AiActionForm>
            <Link href={`${basePath}/icp`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Edit Manually
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Offering</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{OFFERING_TYPE_LABEL[offering.offering_type ?? "other"]}</Badge>
            <Badge variant="outline">{OFFERING_STATUS_LABEL[offering.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{offering.category ?? "No category set"}</p>
        </div>

        <Link href={`${basePath}/icp`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">ICP health</p>
          {icp ? (
            <>
              <div className="flex items-center gap-1.5">
                <Badge variant={icp.status === "approved" ? "default" : "secondary"}>{icp.status === "approved" ? "Approved" : "Draft"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{icpFieldsCount} of {ICP_LIST_FIELDS.length} fields defined</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No ideal customer yet</p>
          )}
        </Link>

        <Link href={`${basePath}/prospects`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Prospects</p>
          <p className="text-sm text-muted-foreground">
            {prospectCounts.total} total &middot; {prospectCounts.qualified} qualified &middot; {prospectCounts.new} new
          </p>
        </Link>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Buyer personas</p>
          <Link href={`${basePath}/icp`} className="text-xs font-medium text-primary hover:underline">
            Manage &rarr;
          </Link>
        </div>
        {personas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No buyer personas yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {personas.map((persona) => (
              <Badge key={persona.id} variant="secondary" title={`${PERSONA_ROLE_LABEL[persona.role_in_committee]} • ${PERSONA_PRIORITY_LABEL[persona.priority]} priority`}>
                {persona.title}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {outcomeFunnel && outcomeFunnel.totalOpportunities > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Discovery effectiveness</p>
            <span className="text-sm font-semibold">{outcomeFunnel.winRate}% win rate</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{outcomeFunnel.totalOpportunities}</span>
              <span className="text-xs text-muted-foreground">Opportunities</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{outcomeFunnel.withConversation}</span>
              <span className="text-xs text-muted-foreground">Conversations</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{outcomeFunnel.sentToCrm}</span>
              <span className="text-xs text-muted-foreground">Sent to CRM</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{outcomeFunnel.won}</span>
              <span className="text-xs text-muted-foreground">Won</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

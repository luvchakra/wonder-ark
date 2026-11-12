import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { buttonVariants } from "@cofounderai/core/ui/button-variants";
import { AiActionForm } from "../ai/ai-action-form";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { OFFERING_TYPE_LABEL } from "../../lib/offerings/types";
import type { Offering } from "../../lib/offerings/types";
import {
  computeOfferingDefinitionQuality,
  QUALITY_DIMENSION_LABEL,
  QUALITY_LEVEL_LABEL,
  type OfferingDefinitionQualityDimension,
  type QualityLevel,
} from "../../lib/offerings/definition-quality";
import { identifyMissingOfferingInformation } from "../../lib/offerings/missing-information";
import type { BuyerPersona } from "../../lib/personas/types";
import type { IcpProfile } from "../../lib/icp/types";
import type { ProspectCounts } from "../../lib/prospects/queries";
import type { OpportunityOutcomeFunnel } from "../../lib/opportunities/outcome-funnel";

/**
 * DISC-OFFER-P0-03.2's "Offering Discovery Overview", as the parts of the Setup tab
 * (DISC-NAV-P0-01.4): the one next step leads the page; the definition quality, the
 * missing-information callout (DISC-OFFER-P1-03.1/03.2) and the outcome numbers
 * (DISC-OFFER-P1-04.2) are shown inside the sections they belong to. The counts that
 * repeated other tabs (prospects, personas) are left to those tabs.
 */

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

/** The ideal customer in one line, for its section's summary. */
export function icpHint(icp: IcpProfile | null): string {
  if (!icp) return "Not defined yet";
  const defined = ICP_LIST_FIELDS.filter((field) => icp[field].length > 0).length;
  return `${icp.status === "approved" ? "Approved" : "Draft, not approved yet"} · ${defined} of ${ICP_LIST_FIELDS.length} fields`;
}

/** The offering in one line, for its section's summary. */
export function offeringHint(offering: Offering, icp: IcpProfile | null, personas: BuyerPersona[]): string {
  const type = OFFERING_TYPE_LABEL[offering.offering_type ?? "other"];
  if (!offering.product_profile) return `${type} · no profile yet`;
  const quality = computeOfferingDefinitionQuality({
    detailedDescription: offering.detailed_description,
    icp,
    personas,
    productProfile: offering.product_profile,
  });
  return `${type} · definition ${quality.overall}/100`;
}

/** Where the offering's own setup screens are: the ideal customer is a section of Setup. */
function setupSection(basePath: string, section: string) {
  return `${basePath}?open=${section}#${section}`;
}

/** The one thing to do next for this offering, from its data. */
export function NextStepLine({
  basePath,
  icp,
  personas,
  prospectCounts,
}: {
  basePath: string;
  icp: IcpProfile | null;
  personas: BuyerPersona[];
  prospectCounts: ProspectCounts;
}) {
  const next = !icp
    ? { label: "Define your ideal customer", href: setupSection(basePath, "icp") }
    : icp.status === "draft"
      ? { label: "Review and approve your ideal customer", href: setupSection(basePath, "icp") }
      : personas.length === 0
        ? { label: "Add buyer personas", href: setupSection(basePath, "icp") }
        : prospectCounts.total === 0
          ? { label: "Find prospects", href: `${basePath}/prospects/discover` }
          : { label: "Review your prospects", href: `${basePath}/prospects` };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <p className="text-sm text-muted-foreground">Next step</p>
      <Link href={next.href} className="text-sm font-medium text-primary hover:underline">
        {next.label} &rarr;
      </Link>
    </div>
  );
}

/** DISC-OFFER-P1-03.1/03.2: how well the offering is defined, and what is missing. */
export function OfferingQuality({
  basePath,
  offering,
  icp,
  personas,
  researchFurtherAction,
}: {
  basePath: string;
  offering: Offering;
  icp: IcpProfile | null;
  personas: BuyerPersona[];
  /** The missing-information callout's "Research further": a forced ICP regeneration. */
  researchFurtherAction: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
}) {
  const quality = computeOfferingDefinitionQuality({
    detailedDescription: offering.detailed_description,
    icp,
    personas,
    productProfile: offering.product_profile,
  });
  const missingInformation = identifyMissingOfferingInformation({ icp, personas });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Definition quality</p>
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
      {missingInformation.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
          <p className="text-sm">
            Less certain about: <span className="text-muted-foreground">{missingInformation.map((item) => item.label).join(", ")}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <AiActionForm
              action={researchFurtherAction}
              buttonLabel="Research further"
              pendingText="Researching..."
              buttonProps={{ variant: "outline", size: "sm" }}
              wrapperClassName="flex flex-col items-start gap-2"
            >
              <input type="hidden" name="force" value="true" />
            </AiActionForm>
            <Link href={setupSection(basePath, "icp")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Edit manually
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** DISC-OFFER-P1-04.2: "Learn from outcomes", once there is at least one opportunity. */
export function OutcomeFunnelSummary({ funnel }: { funnel: OpportunityOutcomeFunnel | null }) {
  if (!funnel || funnel.totalOpportunities === 0) return null;
  const figures = [
    [funnel.totalOpportunities, "Opportunities"],
    [funnel.withConversation, "Conversations"],
    [funnel.sentToCrm, "Sent to CRM"],
    [funnel.won, "Won"],
  ] as const;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Discovery effectiveness</p>
        <span className="text-sm font-semibold">{funnel.winRate}% win rate</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {figures.map(([value, label]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-lg font-semibold">{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

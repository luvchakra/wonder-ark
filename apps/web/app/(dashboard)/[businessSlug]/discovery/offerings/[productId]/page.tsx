import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProductKnowledge } from "@cofounderai/module-discovery/lib/knowledge/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { listBuyerPersonas } from "@cofounderai/module-discovery/lib/personas/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";
import { getOpportunityOutcomeFunnel } from "@cofounderai/module-discovery/lib/opportunities/queries";
import { ProductOverviewShell } from "@cofounderai/module-discovery/components/tenancy/product-overview-shell";
import { CollapsibleCard } from "@cofounderai/module-discovery/components/ui/collapsible-card";
import { OfferingOverviewSummary } from "@cofounderai/module-discovery/components/offerings/offering-overview-summary";
import { RunAiDiscoveryPanel } from "@cofounderai/module-discovery/components/pipeline/run-ai-discovery-panel";
import { RediscoverySchedule } from "@cofounderai/module-discovery/components/pipeline/rediscovery-schedule";
import { SavedDiscoveryCriteria } from "@cofounderai/module-discovery/components/pipeline/saved-discovery-criteria";
import { TopOpportunityGate } from "@cofounderai/module-discovery/components/opportunities/top-opportunity-gate";
import { listPipelineStages, getLastCompletedPipelineRun } from "@cofounderai/module-discovery/lib/pipeline/queries";
import { getTopGateOpportunity } from "@cofounderai/module-discovery/lib/opportunities/dashboard-queries";
import { getBuyerIntelligenceForProspect } from "@cofounderai/module-discovery/lib/buyer-intelligence/queries";
import { computeBuyerFitScores } from "@cofounderai/module-discovery/lib/buyer-intelligence/scoring";
import { classifyExistingRelationship } from "@cofounderai/module-crm/contract/index";
import { getAiApprovalMode } from "@cofounderai/module-discovery/lib/ai-approval/queries";
import { AudienceTypeForm } from "@cofounderai/module-discovery/components/offerings/audience-type-form";
import { audienceTypeOf, suggestAudienceType } from "@cofounderai/module-discovery/lib/icp/audience";
import {
  addFileSourceAction,
  addTextSourceAction,
  deleteSourceAction,
  generateProductProfileAction,
  updateProductDescriptionAction,
  updateProductWebsiteAction,
  updateSourceAction,
  sendTopOpportunityToCrmAction,
  updateTopOpportunityStatusAction,
  updateRediscoveryIntervalAction,
  updateDiscoveryCriteriaAction,
  regenerateIcpFromOverviewAction,
  setAudienceTypeAction,
} from "./actions";

function icpPath(businessSlug: string, productId: string) {
  return `/${businessSlug}/discovery/offerings/${productId}/icp`;
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ businessSlug: string; productId: string }>;
}) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const sources = await listProductKnowledge(workspace.id);

  // DISC-OFFER-P0-03.2's "Offering Discovery Overview" -- only shown once the offering
  // has a profile: before that, the setup wizard below (generate a profile from a
  // website/description) already answers "what should I do today," so a dashboard
  // summarizing mostly-empty ICP/persona/prospect state would be redundant noise, not
  // help. Once a profile exists, this becomes the "primary offering workspace" surface
  // the setup shell (still useful for revisiting sources/regenerating the profile) sits
  // below.
  const [icp, personas, prospectCounts, outcomeFunnel] = product.product_profile
    ? await Promise.all([
        getIcpProfile(workspace.id),
        listBuyerPersonas(workspace.id),
        getProspectCounts(workspace.id),
        // DISC-OFFER-P1-04.2: "Learn From Outcomes" -- same profile-gated condition as
        // the rest of this summary; a fresh offering with no opportunities yet has
        // nothing to measure (the card itself additionally hides on a zero count).
        getOpportunityOutcomeFunnel(workspace.id),
      ])
    : [null, [], null, null];
  const pipelineStages = await listPipelineStages(workspace.id);
  const lastRun = await getLastCompletedPipelineRun(workspace.id);
  // DISC-AI-APPROVAL-01: shown where the AI flows start; each flow re-reads it itself.
  const aiApprovalMode = await getAiApprovalMode(businessId);
  const aiApprovalSettingsHref = `/${businessSlug}/business#ai-approvals`;

  // DISC-OFFER-P0-15.1: "Final Human Action Gate" -- only fetched once there's real
  // opportunity data to gate on at all (same profile-gated condition as the summary
  // below); a fresh offering with no opportunities yet has nothing here to decide on.
  const topGateRow = prospectCounts ? await getTopGateOpportunity(workspace.id) : null;
  const topGateContext = topGateRow
    ? await (async () => {
        const buyerIntelligence = await getBuyerIntelligenceForProspect(workspace.id, topGateRow.prospect.id);
        const { primaryContactId } = computeBuyerFitScores(buyerIntelligence);
        const primaryContact = buyerIntelligence.find((person) => person.contact.id === primaryContactId) ?? buyerIntelligence[0] ?? null;
        // DISC-OFFER-P0-08.2: a degraded null (CRM not licensed) reads as "no warning to
        // show" -- the same ADR-10 normal-result handling the Opportunity Detail route
        // already applies to this exact call.
        const relationshipResult = await classifyExistingRelationship(businessId, {
          companyName: topGateRow.prospect.company_name,
          excludePartyId: topGateRow.prospect.party_id,
          contactEmail: primaryContact?.contact.email ?? null,
        });
        return {
          contactName: primaryContact?.name ?? null,
          hasParty: Boolean(topGateRow.prospect.party_id),
          relationship: relationshipResult.ok ? relationshipResult.data : null,
        };
      })()
    : null;

  // DISC-CONS-P0-01.1: "Who buys this?" leads the page until a person has answered it,
  // then lives with the rest of the setup. One form either way.
  const audienceConfirmed = Boolean(product.audience_confirmed_at);
  const audienceForm = (
    <AudienceTypeForm
      action={setAudienceTypeAction.bind(null, businessId, productId)}
      current={audienceTypeOf(product)}
      confirmed={audienceConfirmed}
      suggested={suggestAudienceType(product)}
    />
  );

  return (
    // DISC-OFFER-P1-05.4 "Offering Overview UX Polish" -- hierarchy planned per
    // docs/design/claude-ui-design-rules.md before touching markup: the most urgent,
    // decision-shaped content (the one opportunity a founder should act on right now,
    // then this offering's own overall health) leads the page; the discovery pipeline's
    // own mechanics (schedule/criteria/run panel -- how it works, not what to decide)
    // come next, grouped under one heading instead of three unlabeled boxes in a row;
    // the original setup wizard (website/description/knowledge sources) moves last,
    // collapsed by default once a profile already exists -- that content doesn't stop
    // being real or editable, it just stops being the first thing an established
    // offering's own founder has to scroll past every visit. Nothing here changes what
    // renders for a brand-new offering (no profile yet): the gated Top Opportunity/
    // Overview cards are still both null then, and the setup card still defaults open.
    <div className="flex flex-col gap-8">
      {audienceConfirmed ? null : audienceForm}
      {topGateRow && topGateContext ? (
        <TopOpportunityGate
          businessId={businessId}
          productId={productId}
          opportunity={topGateRow.opportunity}
          prospect={topGateRow.prospect}
          contactName={topGateContext.contactName}
          hasParty={topGateContext.hasParty}
          relationship={topGateContext.relationship}
          watchAction={updateTopOpportunityStatusAction.bind(null, businessId, productId, topGateRow.opportunity.id, "watching")}
          dismissAction={updateTopOpportunityStatusAction.bind(null, businessId, productId, topGateRow.opportunity.id, "dismissed")}
          sendToCrmAction={sendTopOpportunityToCrmAction.bind(
            null,
            businessId,
            productId,
            topGateRow.opportunity.id,
            topGateRow.prospect.id,
            topGateRow.prospect.party_id ?? "",
          )}
        />
      ) : null}
      {product.product_profile && prospectCounts ? (
        <OfferingOverviewSummary
          businessSlug={businessSlug}
          offering={product}
          icp={icp}
          personas={personas}
          prospectCounts={prospectCounts}
          outcomeFunnel={outcomeFunnel}
          researchFurtherAction={regenerateIcpFromOverviewAction.bind(null, businessId, productId)}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Discovery pipeline</h2>
        <RediscoverySchedule
          interval={workspace.rediscovery_interval}
          nextDiscoveryAt={workspace.next_discovery_at}
          lastDiscoveryAt={lastRun?.completed_at ?? null}
          updateIntervalAction={updateRediscoveryIntervalAction.bind(null, businessId, productId, workspace.id)}
        />
        <SavedDiscoveryCriteria workspace={workspace} updateCriteriaAction={updateDiscoveryCriteriaAction.bind(null, businessId, productId, workspace.id)} />
        <RunAiDiscoveryPanel
          businessSlug={businessSlug}
          productId={productId}
          initialStages={pipelineStages}
          aiApprovalMode={aiApprovalMode}
          aiApprovalSettingsHref={aiApprovalSettingsHref}
        />
      </section>

      <CollapsibleCard label="Offering setup & sources" defaultOpen={!product.product_profile}>
        {audienceConfirmed ? <div className="mb-4">{audienceForm}</div> : null}
        <ProductOverviewShell
          product={product}
          sources={sources}
          websiteAction={updateProductWebsiteAction.bind(null, businessId, productId)}
          descriptionAction={updateProductDescriptionAction.bind(null, businessId, productId)}
          generateProfileAction={generateProductProfileAction.bind(null, businessId, productId)}
          addFileAction={addFileSourceAction.bind(null, businessId, productId, workspace.id)}
          addTextAction={addTextSourceAction.bind(null, businessId, productId, workspace.id)}
          updateSourceAction={updateSourceAction.bind(null, businessId, productId)}
          deleteSourceAction={deleteSourceAction.bind(null, businessId, productId)}
          nextHref={`${icpPath(businessSlug, productId)}?autopopulate=1`}
          aiApprovalMode={aiApprovalMode}
          aiApprovalSettingsHref={aiApprovalSettingsHref}
        />
      </CollapsibleCard>
    </div>
  );
}

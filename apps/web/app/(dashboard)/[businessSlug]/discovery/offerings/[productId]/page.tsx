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
import { ProductOverviewShell } from "@cofounderai/module-discovery/components/tenancy/product-overview-shell";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import {
  icpHint,
  NextStepLine,
  offeringHint,
  OfferingQuality,
} from "@cofounderai/module-discovery/components/offerings/offering-overview-summary";
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
import IcpPage from "./icp/page";
import DiscoveryDefinitionsPage from "./discovery/page";

function icpPath(businessSlug: string, productId: string) {
  return `/${businessSlug}/discovery/offerings/${productId}/icp`;
}

/** DISC-NAV-P0-01.4: the Setup tab's sections, in order; `?open=<id>` opens one. */
const SETUP_SECTIONS = ["offering", "icp", "discovery"] as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; productId: string }>;
  searchParams: Promise<{ open?: string; suggest?: string }>;
}) {
  const { businessSlug, productId } = await params;
  const query = await searchParams;
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
  const [icp, personas, prospectCounts] = product.product_profile
    ? await Promise.all([getIcpProfile(workspace.id), listBuyerPersonas(workspace.id), getProspectCounts(workspace.id)])
    : [null, [], null];
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

  const basePath = `/${businessSlug}/discovery/offerings/${productId}`;
  const opened = SETUP_SECTIONS.find((id) => id === query.open) ?? (product.product_profile ? null : "offering");
  const lastRunAt = lastRun?.completed_at ? new Date(lastRun.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
  const discoveryHint = `${lastRunAt ? `Last run ${lastRunAt}` : "Never run"} · ${workspace.rediscovery_interval === "off" ? "not scheduled" : `repeats ${workspace.rediscovery_interval}`}`;

  return (
    // DISC-NAV-P0-01.4: the Setup tab is one short page. The next step and any decision
    // waiting on a person (who buys this, the top opportunity) lead; everything else is
    // a section folded behind a chevron: the offering itself, its ideal customer (the
    // Ideal customer page, buyer personas included) and how discovery runs (schedule,
    // criteria, the AI run and the definitions). The Ideal customer and Definitions pages
    // keep their own addresses and render the same content.
    <div className="flex flex-col gap-4">
      {audienceConfirmed ? null : audienceForm}
      {product.product_profile && prospectCounts ? (
        <NextStepLine basePath={basePath} icp={icp} personas={personas} prospectCounts={prospectCounts} />
      ) : null}
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

      <SectionFold id="offering" title="Offering" hint={offeringHint(product, icp, personas)} open={opened === "offering"}>
        {product.product_profile ? (
          <OfferingQuality
            basePath={basePath}
            offering={product}
            icp={icp}
            personas={personas}
            researchFurtherAction={regenerateIcpFromOverviewAction.bind(null, businessId, productId)}
          />
        ) : null}
        {audienceConfirmed ? audienceForm : null}
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
      </SectionFold>

      <SectionFold id="icp" title="Ideal customer" hint={icpHint(icp)} open={opened === "icp"}>
        <IcpPage params={params} searchParams={Promise.resolve({ suggest: query.suggest })} />
      </SectionFold>

      <SectionFold id="discovery" title="Discovery" hint={discoveryHint} open={opened === "discovery"}>
        <RunAiDiscoveryPanel
          businessSlug={businessSlug}
          productId={productId}
          initialStages={pipelineStages}
          aiApprovalMode={aiApprovalMode}
          aiApprovalSettingsHref={aiApprovalSettingsHref}
        />
        <RediscoverySchedule
          interval={workspace.rediscovery_interval}
          nextDiscoveryAt={workspace.next_discovery_at}
          lastDiscoveryAt={lastRun?.completed_at ?? null}
          updateIntervalAction={updateRediscoveryIntervalAction.bind(null, businessId, productId, workspace.id)}
        />
        <SavedDiscoveryCriteria workspace={workspace} updateCriteriaAction={updateDiscoveryCriteriaAction.bind(null, businessId, productId, workspace.id)} />
        <DiscoveryDefinitionsPage params={params} />
      </SectionFold>
    </div>
  );
}

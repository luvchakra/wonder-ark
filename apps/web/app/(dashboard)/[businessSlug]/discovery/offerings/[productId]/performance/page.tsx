import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getPerformanceAnalysisRawData } from "@cofounderai/module-discovery/lib/performance-analysis/queries";
import { computeOfferingPerformanceAnalysis } from "@cofounderai/module-discovery/lib/performance-analysis/analysis";
import { OfferingPerformanceAnalysisView } from "@cofounderai/module-discovery/components/pipeline/offering-performance-analysis";
import { ResultsSummary } from "@cofounderai/module-discovery/components/pipeline/results-summary";
import { getOpportunityOutcomeFunnel } from "@cofounderai/module-discovery/lib/opportunities/queries";
import { OutcomeFunnelSummary } from "@cofounderai/module-discovery/components/offerings/offering-overview-summary";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import { listProspects } from "@cofounderai/module-discovery/lib/prospects/queries";
import { computeConversionFunnel } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";
import { countFeedback } from "@cofounderai/module-discovery/lib/audience/themes";
import { CustomersList } from "../conversions/customers-list";
import PeopleSayPage from "../people-say/page";

/**
 * DISC-NAV-P0-02.4: Results, kept to what answers "what did my outreach lead to?" (owner,
 * 2026-11-28: the tab had too many items). Four counts of the offering's own prospects,
 * then at most three closed sections: the customers won, what is working (how far
 * prospects got and which kinds convert), and, once someone has given feedback, what
 * people say. Conversions keeps its own page and address; its customers list is shared.
 */
export default async function PerformanceAnalysisPage({
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

  const [raw, outcomeFunnel, prospects, feedbackCount] = await Promise.all([
    getPerformanceAnalysisRawData(workspace.id),
    getOpportunityOutcomeFunnel(workspace.id),
    listProspects(workspace.id),
    countFeedback(workspace.id),
  ]);
  const analysis = computeOfferingPerformanceAnalysis(raw);
  const funnel = computeConversionFunnel(prospects);
  const customers = prospects.filter((p) => p.outcome === "won");

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Results</h1>
      <ResultsSummary funnel={funnel} wonCount={customers.length} />

      <SectionFold
        id="conversions"
        title="Customers"
        done={customers.length > 0}
        hint={customers.length === 0 ? "No won deals yet" : `${customers.length} won`}
      >
        <div className="flex justify-end">
          <ExportMenu exportId="discovery.conversions" businessSlug={businessSlug} params={{ productId }} kind="report" />
        </div>
        <CustomersList
          businessId={businessId}
          productId={productId}
          workspaceId={workspace.id}
          customers={customers}
          basePath={`/${businessSlug}/discovery/offerings/${productId}/prospects`}
        />
      </SectionFold>

      <SectionFold id="working" title="What is working" hint="How far prospects got, and which kinds reply and convert">
        <div className="flex justify-end">
          <ExportMenu exportId="discovery.performance" businessSlug={businessSlug} params={{ productId }} kind="report" />
        </div>
        <ConversionFunnelPanel funnel={funnel} wonCount={customers.length} figures={false} />
        {/* DISC-OFFER-P1-04.2: the outcome numbers, shown once there are opportunities. */}
        <OutcomeFunnelSummary funnel={outcomeFunnel} />
        <OfferingPerformanceAnalysisView analysis={analysis} />
      </SectionFold>

      {/* DISC-CONS-P0-04.2: themes across feedback, once there is any to summarise. */}
      {feedbackCount > 0 ? (
        <SectionFold id="people-say" title="What people say" hint={`Themes across ${feedbackCount} piece${feedbackCount === 1 ? "" : "s"} of feedback`}>
          <PeopleSayPage params={params} />
        </SectionFold>
      ) : null}
    </div>
  );
}

import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getPerformanceAnalysisRawData } from "@cofounderai/module-discovery/lib/performance-analysis/queries";
import { computeOfferingPerformanceAnalysis } from "@cofounderai/module-discovery/lib/performance-analysis/analysis";
import { OfferingPerformanceAnalysisView } from "@cofounderai/module-discovery/components/pipeline/offering-performance-analysis";
import { getOpportunityOutcomeFunnel } from "@cofounderai/module-discovery/lib/opportunities/queries";
import { OutcomeFunnelSummary } from "@cofounderai/module-discovery/components/offerings/offering-overview-summary";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import ConversionsPage from "../conversions/page";
import PeopleSayPage from "../people-say/page";
import UsagePage from "../usage/page";

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

  const [raw, outcomeFunnel] = await Promise.all([getPerformanceAnalysisRawData(workspace.id), getOpportunityOutcomeFunnel(workspace.id)]);
  const analysis = computeOfferingPerformanceAnalysis(raw);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Performance analysis</h1>
          <p className="text-sm text-muted-foreground">What&apos;s actually working for this offering, computed from everything discovered so far.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="discovery.performance" businessSlug={businessSlug} params={{ productId }} kind="report" />
        </div>
      </div>
      {/* DISC-OFFER-P1-04.2: the outcome numbers, moved here from the old Overview. */}
      <OutcomeFunnelSummary funnel={outcomeFunnel} />
      <OfferingPerformanceAnalysisView analysis={analysis} />

      {/* DISC-NAV-P0-01.4: the Results tab's other pages, folded below. */}
      <div className="flex flex-col gap-3">
        <SectionFold id="conversions" title="Conversions" hint="Prospects that became customers, and how">
          <ConversionsPage params={params} />
        </SectionFold>
        <SectionFold id="people-say" title="What people say" hint="Themes across the feedback you have logged">
          <PeopleSayPage params={params} />
        </SectionFold>
        <SectionFold id="usage" title="Usage" hint="AI use this month, by operation">
          <UsagePage params={params} />
        </SectionFold>
      </div>
    </div>
  );
}

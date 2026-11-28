import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspects } from "@cofounderai/module-discovery/lib/prospects/queries";
import { computeConversionFunnel } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";
import { CustomersList } from "./customers-list";

/**
 * A conversion funnel built entirely from data listProspects already returns -- no new
 * query, no new AI call. computeConversionFunnel (lib/prospects/pipeline.ts) exploits
 * deriveProspectPipelineState's reverse-order stage checks: a prospect's `.stage` is
 * always the furthest point it has reached, so "how many prospects reached stage X or
 * further" is a plain index comparison.
 */
export default async function ConversionsPage({
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

  const prospects = await listProspects(workspace.id);
  const funnel = computeConversionFunnel(prospects);
  const customers = prospects.filter((p) => p.outcome === "won");
  const basePath = `/${businessSlug}/discovery/offerings/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <ExportMenu exportId="discovery.conversions" businessSlug={businessSlug} params={{ productId }} kind="report" />
      </div>
      <ConversionFunnelPanel funnel={funnel} wonCount={customers.length} />

      <div className="flex flex-col gap-3 rounded-md border p-4">
        <h3 className="font-medium">Customers</h3>
        <CustomersList businessId={businessId} productId={productId} workspaceId={workspace.id} customers={customers} basePath={basePath} />
      </div>
      {/* Item #7 of a UX pass: marking a prospect "Won" redirects here with a `#bottom`
          fragment so the founder lands scrolled to this list/button, not back at the top
          of the funnel panel they've already seen. */}
      <div id="bottom" aria-hidden="true" />
    </div>
  );
}

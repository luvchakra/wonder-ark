import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listPipelineStages, getLastCompletedPipelineRun } from "@cofounderai/module-discovery/lib/pipeline/queries";
import { getAiApprovalMode } from "@cofounderai/module-discovery/lib/ai-approval/queries";
import { RunAiDiscoveryPanel } from "@cofounderai/module-discovery/components/pipeline/run-ai-discovery-panel";
import { RediscoverySchedule } from "@cofounderai/module-discovery/components/pipeline/rediscovery-schedule";
import { SavedDiscoveryCriteria } from "@cofounderai/module-discovery/components/pipeline/saved-discovery-criteria";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import { updateRediscoveryIntervalAction, updateDiscoveryCriteriaAction } from "./actions";
import DiscoveryDefinitionsPage from "./discovery/page";

/**
 * DISC-NAV-P0-01.11: automatic discovery -- the AI run that finds, researches and scores
 * prospects, its schedule, saved criteria and definitions -- folded on Find, the step that
 * finds prospects. It used to sit on Define, where it read as part of describing the offering.
 */
export async function DiscoverySection({ params }: { params: Promise<{ businessSlug: string; productId: string }> }) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  const product = businessId ? await getProduct(productId) : null;
  if (!businessId || !product || product.business_id !== businessId) return null;
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) return null;

  const [pipelineStages, lastRun, aiApprovalMode] = await Promise.all([
    listPipelineStages(workspace.id),
    getLastCompletedPipelineRun(workspace.id),
    getAiApprovalMode(businessId),
  ]);
  const aiApprovalSettingsHref = `/${businessSlug}/business#ai-approvals`;
  const lastRunAt = lastRun?.completed_at ? new Date(lastRun.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
  const hint = `${lastRunAt ? `Last run ${lastRunAt}` : "Never run"} · ${workspace.rediscovery_interval === "off" ? "not scheduled" : `repeats ${workspace.rediscovery_interval}`}`;

  return (
    <SectionFold id="discovery" title="Automatic discovery" hint={hint}>
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
  );
}

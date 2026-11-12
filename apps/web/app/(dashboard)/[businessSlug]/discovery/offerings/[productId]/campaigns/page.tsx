import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { CampaignList } from "@cofounderai/module-discovery/components/campaigns/campaign-parts";
import { listCampaignsWithCounts } from "@cofounderai/module-discovery/lib/campaigns/campaigns";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { createCampaignAction } from "./actions";

/**
 * DISC-CAMP-P0-05.1: Campaigns, under the offering's Prospects tab.
 *
 * Planned before markup (docs/design/claude-ui-design-rules.md): the task here is to see
 * what is running and start another, so the page is a title, one primary action ("New
 * campaign", which makes a draft and opens it; nothing is sent by creating one) and the
 * list. A campaign's row carries one control, the link to its page, where everything
 * about it lives. The list is cards that stack on a phone and sit in a row from `md` up.
 *
 * Visible controls: 1 plus one link per campaign.
 */
export default async function CampaignsPage({ params }: { params: Promise<{ businessSlug: string; productId: string }> }) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const campaigns = await listCampaignsWithCounts(workspace.id);
  const basePath = `/${businessSlug}/discovery/offerings/${productId}/campaigns`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Campaigns</h1>
          <p className="text-sm text-muted-foreground">A short sequence of emails to your prospects, sent from your own mailbox once you launch it.</p>
        </div>
        <form action={createCampaignAction.bind(null, businessId, productId, workspace.id)}>
          <SubmitButton size="sm" pendingText="Creating...">
            New campaign
          </SubmitButton>
        </form>
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No campaigns yet. A new campaign starts as a draft: nothing is written or sent until you ask for it.
        </p>
      ) : (
        <CampaignList campaigns={campaigns} basePath={basePath} />
      )}
    </div>
  );
}

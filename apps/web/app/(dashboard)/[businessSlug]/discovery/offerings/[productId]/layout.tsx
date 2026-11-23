import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import type { ReactNode } from "react";
import {
  getBusiness,
  getProduct,
  getWorkspaceForProduct,
  listProducts,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";
import { ProductNav } from "@cofounderai/module-discovery/components/tenancy/product-nav";
import { AutoPopulateProgressProvider } from "@cofounderai/module-discovery/components/tenancy/auto-populate-progress";
import { EditableName } from "@cofounderai/module-discovery/components/tenancy/editable-name";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { OfferingContextSelector } from "@cofounderai/module-discovery/components/offerings/offering-context-selector";
import { renameProductAction } from "./actions";
import { loadOfferingJourney } from "@cofounderai/module-discovery/lib/journey/load";
import { PrepRunner } from "@cofounderai/module-discovery/components/prospects/prep-runner";
import { getAutoSend } from "@cofounderai/module-discovery/lib/auto-send/settings";
import { prepareNextProspectAction } from "./prospects/actions";

export default async function ProductLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessSlug: string; productId: string }>;
}) {
  const { businessSlug, productId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  // Independent lookups (neither depends on the other's result) -- fetched in parallel
  // rather than as two sequential round trips, same pattern as the dashboard layout.
  const [product, business, offerings] = await Promise.all([getProduct(productId), getBusiness(businessId), listProducts(businessId)]);
  if (!product || product.business_id !== businessId) notFound();
  if (!business) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  const [icp, prospectCounts] = workspace
    ? await Promise.all([getIcpProfile(workspace.id), getProspectCounts(workspace.id)])
    : [null, null];

  const basePath = `/${businessSlug}/discovery/offerings/${productId}`;
  const completed = {
    overview: Boolean(product.product_profile),
    icp: Boolean(icp),
    prospects: Boolean(prospectCounts && prospectCounts.total > 0),
  };

  // DISC-NAV-P0-02.1: set up means described and its ideal customer approved; then the
  // offering opens on To do, and its count shows on the tab.
  const setupDone = Boolean(product.product_profile) && icp?.status === "approved";
  // DISC-AUTO-P0-03.1: with Send automatically on, written first emails are sent too.
  const autoSend = setupDone ? await getAutoSend(businessId) : false;
  const journey = workspace ? await loadOfferingJourney({ workspaceId: workspace.id, setupDone, autoSend }) : null;

  return (
    // max-w-6xl (not the old max-w-2xl): the prospects table and prospect detail page's
    // conversation threads under this layout need real width to read comfortably --
    // 2xl (672px) made every row/thread cramped. Wider also just gives the shorter
    // ICP/conversions/usage pages more breathing room, not a regression for them.
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
      {/* Fixed category labels ("Business" / "Business Offering"), not the real
          business/offering names -- the offering's own name is already the page heading
          right below (EditableName), so the breadcrumb's job is to show where this page
          sits in the hierarchy, not repeat an identity the heading already carries. */}
      <Breadcrumbs
        items={[
          { label: "Business", href: `/${businessSlug}/business` },
          { label: "Business Offering" },
        ]}
      />
      {/* EditableName lives inside the provider (not above it) so its own rename
          pencil can read `activeStage` and disable itself while the auto-populate
          flow is running -- it acts on the same product row that flow is writing to,
          same race the fieldset in product-overview-shell.tsx already guards against
          for every other control on the Overview step. */}
      <AutoPopulateProgressProvider>
        {/* DISC-OFFER-P0-03.1: the offering this page is about, switchable in place
            (keeping the section) when the business has more than one. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <EditableName
            name={product.name}
            action={renameProductAction.bind(null, businessId, productId)}
            headingClassName="text-xl font-semibold"
          />
          <OfferingContextSelector
            offeringsBasePath={`/${businessSlug}/discovery/offerings`}
            currentOfferingId={productId}
            offerings={offerings.map((o) => ({ id: o.id, name: o.name }))}
          />
        </div>
        <ProductNav basePath={basePath} completed={completed} setupDone={setupDone} todo={journey?.todo ?? 0} />
        {/* DISC-AUTO-P0-01.3: the person chooses which picked prospects to prepare
            (research, score, first message); nothing starts by itself. */}
        {/* Always mounted, so a finished run's last line stays when the list empties. */}
        {workspace && journey ? (
          <PrepRunner
            candidates={journey.prepCandidates}
            autoSend={autoSend}
            todoPath={basePath}
            prepareAction={prepareNextProspectAction.bind(null, businessId, productId, workspace.id)}
          />
        ) : null}
        {children}
      </AutoPopulateProgressProvider>
    </main>
  );
}

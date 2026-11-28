import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { SetupView } from "./setup-view";
import Link from "next/link";
import { FindView } from "./prospects/discover/find-view";

/**
 * DISC-NAV-P0-02.1: the offering's own address. Until it is set up (described, and its
 * ideal customer approved) it shows Setup; then it shows Search (DISC-NAV-P0-02.5, owner
 * 2026-11-29: find new prospects and approve them, nothing else; what is done with an
 * approved prospect is on Prospects). A link that opens a part of Setup (`?open=`,
 * `?suggest=`, `?autorun=`) still shows Setup.
 */
export default async function OfferingPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; productId: string }>;
  searchParams: Promise<{ open?: string; suggest?: string; autorun?: string; approved?: string; duplicates?: string; searched?: string; weekly?: string; searchNote?: string }>;
}) {
  const { businessSlug, productId } = await params;
  const query = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();
  const workspace = await getWorkspaceForProduct(product.id);
  const icp = workspace ? await getIcpProfile(workspace.id) : null;
  const setupDone = Boolean(product.product_profile) && icp?.status === "approved";

  if (!setupDone || query.open || query.suggest || query.autorun) {
    return <SetupView params={params} searchParams={Promise.resolve(query)} />;
  }
  const { approved, duplicates, searched, searchNote } = query;
  return (
    <FindView params={params} heading={false}>
      {approved ? (
        <p role="status" className="rounded-md border bg-muted p-3 text-sm">
          Approved {approved}.{duplicates && duplicates !== "0" ? ` Skipped ${duplicates} already in your prospects.` : ""}{" "}
          {approved === "0" ? null : (
            <Link href={`/${businessSlug}/discovery/offerings/${productId}/prospects`} className="font-medium text-primary hover:underline">
              Prepare and contact them on Prospects
            </Link>
          )}
        </p>
      ) : null}
      {searched !== undefined || searchNote ? (
        <p role="status" className="rounded-md border bg-muted p-3 text-sm">
          {searchNote
            ? `Ideal customer approved. ${searchNote}`
            : `Ideal customer approved. The first search found ${searched === "1" ? "1 new prospect" : `${searched} new prospects`} for you to approve${query.weekly === "1" ? "; it runs again every week" : ""}.`}
        </p>
      ) : null}
    </FindView>
  );
}

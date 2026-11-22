import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { SetupView } from "./setup-view";
import { TodoView } from "./todo-view";

/**
 * DISC-NAV-P0-02.1: the offering's own address. Until it is set up (described, and its
 * ideal customer approved) it shows Setup; then it shows To do. A link that opens a part of
 * Setup (`?open=`, `?suggest=`, `?autorun=`) still shows Setup.
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
  return <TodoView businessId={businessId} businessSlug={businessSlug} productId={productId} approved={query.approved} duplicates={query.duplicates} searched={query.searched} weekly={query.weekly === "1"} searchNote={query.searchNote} />;
}

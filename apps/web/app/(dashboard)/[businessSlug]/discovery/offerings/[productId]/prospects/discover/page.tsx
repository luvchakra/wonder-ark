import { FindView } from "./find-view";

/** The search at the address it always had; the offering's Search tab shows the same view. */
export default function DiscoverProspectsPage({ params }: { params: Promise<{ businessSlug: string; productId: string }> }) {
  return <FindView params={params} />;
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getWorkspaceForProduct, listProducts } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";

/**
 * PLATFORM-NAV-P0-03.3 (owner, 2026-11-29): where the Acquisition menu opens. The
 * business's offerings, one card each, for the person to choose which to work on; the
 * menu no longer jumps into the one last opened. Only what is needed to choose: the name
 * and how many prospects it has, counted from its own rows. Adding and editing offerings
 * stays on the Business page, linked below. With no offering yet there is nothing to
 * choose, so it goes to the Business page, where one is added.
 */
export default async function OfferingsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const offerings = await listProducts(businessId);
  if (offerings.length === 0) redirect(`/${businessSlug}/business#offerings`);

  // Archived offerings are managed on the Business page; here are the ones to work on.
  const open = offerings.filter((offering) => offering.status !== "archived");
  const rows = await Promise.all(
    open.map(async (offering) => {
      const workspace = await getWorkspaceForProduct(offering.id);
      const counts = workspace ? await getProspectCounts(workspace.id) : null;
      return { offering, prospects: counts?.total ?? 0 };
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
      <h1 className="text-xl font-semibold">Choose an offering</h1>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Every offering is archived.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ offering, prospects }) => (
            <li key={offering.id}>
              <Link
                href={`/${businessSlug}/discovery/offerings/${offering.id}`}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3.5 transition-colors hover:border-primary hover:bg-accent/40"
              >
                <span className="min-w-0">
                  <span className="block font-medium break-words">{offering.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {prospects === 1 ? "1 prospect" : `${prospects} prospects`}
                    {offering.status === "inactive" ? " · Inactive" : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/${businessSlug}/business#offerings`} className="self-start text-sm font-medium text-primary hover:underline">
        Add or edit offerings
      </Link>
    </main>
  );
}

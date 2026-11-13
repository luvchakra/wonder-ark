import type { Metadata } from "next";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { BRAND_TITLE_TEMPLATE } from "@cofounderai/core/brand/identity";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { SectionTabs } from "@cofounderai/module-discovery/components/marketing/section-tabs";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { fundingContext } from "./context";

/** BRAND-07: "Funding | WonderArk" in the browser tab. Absolute, with the template
 * re-declared: a plain title here would stop the root "%s | WonderArk" template from
 * reaching the pages below. */
export const metadata: Metadata = { title: { absolute: `Funding | ${BRAND_NAME}`, template: BRAND_TITLE_TEMPLATE } };

/** FND-03..14 — the Funding section's shared tab strip, and its access gate. */
export default async function FundingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { root, canView } = await fundingContext(businessSlug);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
      <SectionTabs
        tabs={[
          // DISC-NAV-P0-01.6: four tabs. Rounds and Analytics are sections of Overview,
          // Readiness of Profile, Outreach of Investors and Due diligence of Data room;
          // each keeps its own address and, opened there, its tab stays marked.
          { href: root, label: "Overview", exact: true, also: [`${root}/rounds`, `${root}/analytics`] },
          { href: `${root}/profile`, label: "Profile", also: [`${root}/readiness`] },
          { href: `${root}/investors`, label: "Investors", also: [`${root}/outreach`] },
          { href: `${root}/data-room`, label: "Data room", also: [`${root}/due-diligence`] },
        ]}
      />
      {canView ? (
        children
      ) : (
        <div className="rounded-xl border bg-card p-10">
          <EmptyState icon={Lock} message="Funding is limited to people with funding access. Ask an owner or admin if you need it." />
        </div>
      )}
    </main>
  );
}

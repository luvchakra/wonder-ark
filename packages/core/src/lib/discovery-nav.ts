/**
 * PLATFORM-NAV-P0-03.1 — the Discovery menu in the sidebar: four plain links, no folds.
 *
 *   Overview · Customer Acquisition · Marketing · Funding
 *
 * It replaced a tree of two links and four folding sections (DISC-NAV-01..05) that listed
 * every offering and every page of Marketing, Customer Acquisition and Funding: up to
 * 26 rows plus one per offering. Each of those pages already shows its own tabs across
 * the top (the offering's four tabs, Marketing's and Funding's section tabs), so the
 * sidebar repeated them. Now a section is one link that opens its first page, and the
 * tabs on the page do the rest. No route moved.
 *
 * What left the menu:
 *  - Business: it describes the business, not Discovery, so it is a row of its own above
 *    the modules (`businessNavLink`, PLATFORM-NAV-P0-03.2). Its page lists the offerings.
 *  - Business Offerings: the Business page lists them, and an offering's own pages carry
 *    a switcher, so the sidebar no longer repeats the list.
 *
 * Pure and framework-free so the active-state rules can be tested without rendering the
 * rail. Lives in core because the shell renders it and core cannot import a module.
 */

export interface DiscoveryNavLink {
  id: "overview" | "customer-acquisition" | "marketing" | "funding";
  label: string;
  href: string;
  icon: string;
  active: boolean;
}

function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The offering id in a `/<business>/discovery/offerings/<id>/...` path, else null. */
export function offeringIdFromPath(base: string, pathname: string | null): string | null {
  const offeringsRoot = `${base}/discovery/offerings`;
  const path = pathname ?? "";
  return path.startsWith(`${offeringsRoot}/`) ? path.slice(offeringsRoot.length + 1).split("/")[0] || null : null;
}

/** The Business page: the business's own details and its offerings. */
export function businessNavLink(base: string, pathname: string | null): { href: string; active: boolean } {
  const href = `${base}/business`;
  return { href, active: (pathname ?? "") === href };
}

/**
 * Customer Acquisition opens the offering in focus: the one in the URL, else the one the
 * founder last worked in (`rememberedOfferingId`, DISC-OFFER-P0-03.1, ignored when it no
 * longer exists), else the first. With no offering yet it opens the Business page, which
 * is where one is added. Exactly one link is active on any Discovery page.
 */
export function buildDiscoveryNav(
  base: string,
  products: { id: string; name: string }[],
  pathname: string | null,
  rememberedOfferingId?: string | null,
): DiscoveryNavLink[] {
  const path = pathname ?? "";
  const overviewHref = `${base}/discovery/dashboard`;
  const offeringsRoot = `${base}/discovery/offerings`;
  const marketingRoot = `${base}/discovery/marketing`;
  const fundingRoot = `${base}/discovery/funding`;

  const offeringInPath = offeringIdFromPath(base, path);
  const focus =
    products.find((p) => p.id === offeringInPath) ??
    products.find((p) => p.id === rememberedOfferingId) ??
    products[0] ??
    null;

  return [
    { id: "overview", label: "Overview", href: overviewHref, icon: "LayoutDashboard", active: path === overviewHref },
    {
      id: "customer-acquisition",
      label: "Customer Acquisition",
      href: focus ? `${offeringsRoot}/${focus.id}` : `${base}/business`,
      icon: "Users",
      active: under(path, offeringsRoot),
    },
    { id: "marketing", label: "Marketing", href: marketingRoot, icon: "Radio", active: under(path, marketingRoot) },
    { id: "funding", label: "Funding", href: fundingRoot, icon: "Landmark", active: under(path, fundingRoot) },
  ];
}

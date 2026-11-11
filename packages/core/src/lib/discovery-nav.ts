/**
 * DISC-NAV-01..05 — the Discovery sidebar tree (spec §2.6, §3.2):
 *
 *   Overview · Business · Business Offerings ▸ · Marketing ▸ · Customer Acquisition ▸ · Funding ▸
 *
 * One typed, static description of the tree, plus the adapter that lays Customer
 * Acquisition over the existing offering-scoped routes. Those routes stay exactly where
 * they are (`/discovery/offerings/<id>/icp`, `/prospects`, ...) — the spec forbids moving
 * or renaming them (§0.1, §38) — so each acquisition item points at the matching page of
 * the offering in focus: the one in the URL, or the first offering otherwise.
 *
 * Pure and framework-free so the active-state rules can be tested without rendering the
 * rail. Lives in core because the shell renders it and core cannot import a module.
 */

import { OFFERING_TABS, activeOfferingNav, buildOfferingNav } from "./offering-nav";

export type DiscoveryNavGroupId = "offerings" | "marketing" | "customer-acquisition" | "funding";

export interface DiscoveryNavLink {
  id: string;
  label: string;
  href: string;
  icon?: string;
  active: boolean;
}

export interface DiscoveryNavGroup {
  id: DiscoveryNavGroupId;
  heading: string;
  /** The group contains the current page; it starts expanded (§3.3). */
  holdsActive: boolean;
  items: DiscoveryNavLink[];
  /** Shown instead of items when the group has nothing to list. */
  emptyMessage?: string;
}

export interface DiscoveryNavTree {
  top: DiscoveryNavLink[];
  groups: DiscoveryNavGroup[];
}

const MARKETING = [
  { id: "dashboard", label: "Dashboard", slug: "" },
  { id: "strategy", label: "Strategy", slug: "strategy" },
  { id: "campaigns", label: "Campaigns", slug: "campaigns" },
  { id: "content", label: "Content", slug: "content" },
  { id: "assets", label: "Assets", slug: "assets" },
  { id: "website-seo", label: "Website & SEO", slug: "website-seo" },
  { id: "analytics", label: "Analytics", slug: "analytics" },
] as const;

const FUNDING = [
  { id: "dashboard", label: "Dashboard", slug: "" },
  { id: "profile", label: "Funding Profile", slug: "profile" },
  { id: "readiness", label: "Investor Readiness", slug: "readiness" },
  { id: "rounds", label: "Fundraising", slug: "rounds" },
  { id: "investors", label: "Investors", slug: "investors" },
  { id: "outreach", label: "Investor Outreach", slug: "outreach" },
  { id: "data-room", label: "Data Room", slug: "data-room" },
  { id: "due-diligence", label: "Due Diligence", slug: "due-diligence" },
  { id: "analytics", label: "Analytics", slug: "analytics" },
] as const;

/**
 * DISC-NAV-P0-01.1: Customer Acquisition lists the offering's four tabs -- Setup, Find,
 * Prospects, Results -- instead of nine entries, two of which opened the same page. Each
 * opens the tab's first page; every other page is one click further, on the tab's own
 * second row (lib/offering-nav.ts holds the one list both read). `slug: ""` is the
 * offering overview.
 */
export const CUSTOMER_ACQUISITION_ROUTES = OFFERING_TABS.map((tab) => ({
  id: tab.id,
  label: tab.label,
  slug: tab.pages[0]!.slug,
}));

function under(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Section links: the root item matches only itself, the rest also match sub-pages. */
function sectionLinks(
  root: string,
  pathname: string,
  items: readonly { id: string; label: string; slug: string }[],
): DiscoveryNavLink[] {
  return items.map((item) => {
    const href = item.slug ? `${root}/${item.slug}` : root;
    return { id: item.id, label: item.label, href, active: item.slug ? under(pathname, href) : pathname === href };
  });
}

/** The offering id in a `/<business>/discovery/offerings/<id>/...` path, else null. */
export function offeringIdFromPath(base: string, pathname: string | null): string | null {
  const offeringsRoot = `${base}/discovery/offerings`;
  const path = pathname ?? "";
  return path.startsWith(`${offeringsRoot}/`) ? path.slice(offeringsRoot.length + 1).split("/")[0] || null : null;
}

/**
 * `rememberedOfferingId` (DISC-OFFER-P0-03.1 "Offering Context Selector": "context
 * persists through relevant navigation"): the offering the founder last worked in. When
 * the URL names no offering -- Overview, Marketing, Funding -- Customer Acquisition keeps
 * pointing at that one instead of falling back to the first offering, so stepping out to
 * Marketing and back does not silently switch offerings. Ignored when it no longer exists.
 */
export function buildDiscoveryNav(
  base: string,
  products: { id: string; name: string }[],
  pathname: string | null,
  rememberedOfferingId?: string | null,
): DiscoveryNavTree {
  const path = pathname ?? "";
  const overviewHref = `${base}/discovery/dashboard`;
  const businessHref = `${base}/business`;
  const offeringsRoot = `${base}/discovery/offerings`;
  const marketingRoot = `${base}/discovery/marketing`;
  const fundingRoot = `${base}/discovery/funding`;

  const offeringInPath = offeringIdFromPath(base, path);
  const focus =
    products.find((p) => p.id === offeringInPath) ??
    products.find((p) => p.id === rememberedOfferingId) ??
    products[0] ??
    null;

  const offerings: DiscoveryNavGroup = {
    id: "offerings",
    heading: "Business Offerings",
    holdsActive: offeringInPath !== null,
    items: products.map((p) => {
      const href = `${offeringsRoot}/${p.id}`;
      return { id: p.id, label: p.name, href, active: under(path, href) };
    }),
    emptyMessage: "No business offerings yet.",
  };

  let acquisitionItems: DiscoveryNavLink[] = [];
  let acquisitionActive = false;
  if (focus) {
    const root = `${offeringsRoot}/${focus.id}`;
    // Exactly one item is active: the tab whose page the current path sits at or under
    // (so a single prospect lights up Prospects, and the Find page lights up Find).
    const tabs = buildOfferingNav(root);
    const activeTab = offeringInPath === focus.id ? (activeOfferingNav(tabs, path)?.tab.id ?? null) : null;
    acquisitionActive = activeTab !== null;
    acquisitionItems = tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      href: tab.href,
      active: tab.id === activeTab,
    }));
  }

  return {
    top: [
      { id: "overview", label: "Overview", href: overviewHref, icon: "LayoutDashboard", active: path === overviewHref },
      { id: "business", label: "Business", href: businessHref, icon: "Building2", active: path === businessHref },
    ],
    groups: [
      offerings,
      {
        id: "marketing",
        heading: "Marketing",
        holdsActive: under(path, marketingRoot),
        items: sectionLinks(marketingRoot, path, MARKETING),
      },
      {
        id: "customer-acquisition",
        heading: focus && products.length > 1 ? `Customer Acquisition · ${focus.name}` : "Customer Acquisition",
        holdsActive: acquisitionActive,
        items: acquisitionItems,
        emptyMessage: "Add a business offering to start acquiring customers.",
      },
      {
        id: "funding",
        heading: "Funding",
        holdsActive: under(path, fundingRoot),
        items: sectionLinks(fundingRoot, path, FUNDING),
      },
    ],
  };
}

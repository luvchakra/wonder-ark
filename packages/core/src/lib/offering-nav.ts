/**
 * DISC-NAV-P0-01.1/01.3: the offering's navigation, as data.
 *
 * Four tabs replace the nine an offering with a profile used to show. Every page stays
 * at the path it always had (docs/plan/12-DISCOVERY-EXPANSION-SPEC.md §0.1: no renamed
 * route, no dead deep link); what changes is only which tab it is reached from:
 *
 *   Setup      Overview, Ideal customer (the ICP page, which also holds buyer personas)
 *   Find       Find (with "To review" on the same page), Import, History, Definitions
 *   Prospects  All prospects, Opportunities, Watchlist
 *   Results    Performance, Conversions, Usage
 *
 * Pure and framework-free, so the offering's tab bar, the Discovery sidebar
 * (lib/discovery-nav.ts), their tests and the route check
 * (apps/web/tests/offering-nav-routes.test.ts) all read the same list. It lives in core
 * because the shell's sidebar reads it and core cannot import a module. No server code
 * here: a client component imports it.
 */

export type OfferingTabId = "setup" | "find" | "prospects" | "results";

export type OfferingNavPage = {
  /** The page's path below the offering, "" for the offering's overview. */
  slug: string;
  label: string;
  href: string;
};

export type OfferingNavTab = {
  id: OfferingTabId;
  label: string;
  /** Where the tab lands: its first page. */
  href: string;
  pages: OfferingNavPage[];
};

export const OFFERING_TABS: readonly { id: OfferingTabId; label: string; pages: readonly { slug: string; label: string }[] }[] = [
  {
    id: "setup",
    label: "Setup",
    pages: [
      { slug: "", label: "Overview" },
      { slug: "icp", label: "Ideal customer" },
    ],
  },
  {
    id: "find",
    label: "Find",
    pages: [
      { slug: "prospects/discover", label: "Search" },
      { slug: "prospects/import", label: "Import" },
      { slug: "history", label: "History" },
      { slug: "discovery", label: "Definitions" },
    ],
  },
  {
    id: "prospects",
    label: "Prospects",
    pages: [
      { slug: "prospects", label: "All" },
      { slug: "opportunities", label: "Opportunities" },
      { slug: "watchlist", label: "Watchlist" },
    ],
  },
  {
    id: "results",
    label: "Results",
    pages: [
      { slug: "performance", label: "Performance" },
      { slug: "conversions", label: "Conversions" },
      { slug: "usage", label: "Usage" },
    ],
  },
];

/** The four tabs and the pages each holds, with links under `basePath` (the offering's
 * own path, `/<business>/discovery/offerings/<id>`). */
export function buildOfferingNav(basePath: string): OfferingNavTab[] {
  return OFFERING_TABS.map((tab) => {
    const pages = tab.pages.map((page) => ({
      ...page,
      href: page.slug ? `${basePath}/${page.slug}` : basePath,
    }));
    return { id: tab.id, label: tab.label, href: pages[0]!.href, pages };
  });
}

export type OfferingNavActive = { tab: OfferingNavTab; page: OfferingNavPage };

/**
 * The tab and page the current path belongs to: the page with the longest path the
 * current one sits at or under. So `prospects/discover` belongs to Find although it sits
 * under `prospects`, a single prospect (`prospects/<id>`) belongs to Prospects, and a
 * single run (`history/<id>`) to Find. The overview matches only itself. Null when the
 * path is not under the offering at all.
 */
export function activeOfferingNav(tabs: OfferingNavTab[], pathname: string): OfferingNavActive | null {
  let best: OfferingNavActive | null = null;
  for (const tab of tabs) {
    for (const page of tab.pages) {
      const matches = page.slug ? pathname === page.href || pathname.startsWith(`${page.href}/`) : pathname === page.href;
      if (matches && (!best || page.href.length > best.page.href.length)) best = { tab, page };
    }
  }
  return best;
}

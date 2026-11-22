/**
 * DISC-NAV-P0-01.1/01.3: the offering's navigation, as data.
 *
 * DISC-NAV-P0-02.1 (2026-11-22): three tabs. Every page stays at the path it always had
 * (docs/plan/12-DISCOVERY-EXPANSION-SPEC.md §0.1: no renamed route, no dead deep link);
 * what changes is only which tab it is reached from:
 *
 *   To do      To do (the offering's own address once it is set up), Find more, Import,
 *              Definitions (automatic discovery), History
 *   Prospects  All prospects, Campaigns, Opportunities, Watchlist
 *   Results    Performance, Conversions, Usage, What people say
 *
 * Setup (what you sell, who buys it: `setup`, `icp`) is reached from the Setup link, not a
 * tab; before it is done the offering's own address shows it.
 *
 * DISC-NAV-P0-01.11: Watchlist and Usage keep their pages but are no longer sections of
 * their tab; neither leads to a new customer.
 *
 * DISC-NAV-P0-01.4: the tab bar shows the four tabs only, with no second row. Each tab
 * opens one page, its first, which shows the tab's other pages as sections folded behind
 * a chevron. The other pages keep their own addresses, and a tab stays marked on each.
 *
 * Pure and framework-free, so the offering's tab bar, the Discovery sidebar
 * (lib/discovery-nav.ts), their tests and the route check
 * (apps/web/tests/offering-nav-routes.test.ts) all read the same list. It lives in core
 * because the shell's sidebar reads it and core cannot import a module. No server code
 * here: a client component imports it.
 */

export type OfferingTabId = "todo" | "prospects" | "results";

export type OfferingNavPage = {
  /** The page's path below the offering, "" for the offering's overview. */
  slug: string;
  label: string;
  href: string;
};

export type OfferingNavTab = {
  id: OfferingTabId;
  label: string;
  /** DISC-NAV-P0-01.8: one line saying what this stage is for and how it works. */
  hint: string;
  /** Where the tab lands: its first page. */
  href: string;
  pages: OfferingNavPage[];
};

export const OFFERING_TABS: readonly { id: OfferingTabId; label: string; hint: string; pages: readonly { slug: string; label: string }[] }[] = [
  {
    // DISC-NAV-P0-02.1 (owner-approved redesign, 2026-11-22): three tabs. To do is the only
    // list the person works from; WonderArk finds and prepares the rest. Finding more and
    // its pages belong here, since what they find comes back to To do for approval.
    id: "todo",
    label: "To do",
    hint: "What needs you. WonderArk researches, scores and writes the rest by itself.",
    pages: [
      { slug: "", label: "To do" },
      { slug: "prospects/discover", label: "Find more" },
      { slug: "prospects/import", label: "Import" },
      { slug: "discovery", label: "Definitions" },
      { slug: "history", label: "History" },
    ],
  },
  {
    id: "prospects",
    label: "Prospects",
    hint: "Everyone you approved, and how far each has got.",
    pages: [
      { slug: "prospects", label: "All" },
      // DISC-CAMP-P0-05.1: outreach campaigns to the offering's prospects.
      { slug: "campaigns", label: "Campaigns" },
      { slug: "opportunities", label: "Opportunities" },
      { slug: "watchlist", label: "Watchlist" },
    ],
  },
  {
    id: "results",
    label: "Results",
    hint: "What your outreach led to: replies, deals won, and what people said.",
    pages: [
      { slug: "performance", label: "Performance" },
      { slug: "conversions", label: "Conversions" },
      { slug: "usage", label: "Usage" },
      // DISC-CONS-P0-04.2: themes across what people who opted in have said.
      { slug: "people-say", label: "What people say" },
    ],
  },
];

/** DISC-NAV-P0-02.1: Setup's pages, reached from the Setup link beside the tabs rather
 * than from a tab. */
export const OFFERING_SETUP_PAGES: readonly { slug: string; label: string }[] = [
  { slug: "setup", label: "Setup" },
  { slug: "icp", label: "Ideal customer" },
];

/** The tabs and the pages each holds, with links under `basePath` (the offering's
 * own path, `/<business>/discovery/offerings/<id>`). */
export function buildOfferingNav(basePath: string): OfferingNavTab[] {
  return OFFERING_TABS.map((tab) => {
    const pages = tab.pages.map((page) => ({
      ...page,
      href: page.slug ? `${basePath}/${page.slug}` : basePath,
    }));
    return { id: tab.id, label: tab.label, hint: tab.hint, href: pages[0]!.href, pages };
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

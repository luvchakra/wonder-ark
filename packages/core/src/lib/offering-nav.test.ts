/**
 * DISC-NAV-P0-01.1: the offering's four tabs. What matters is that no page was lost when
 * nine tabs became four, and that a page lights up the tab it now belongs to -- Find's
 * pages sit under `/prospects` and elsewhere, so "longest path wins" is the rule that
 * keeps them out of the Prospects tab.
 */
import { describe, expect, it } from "vitest";
import { OFFERING_TABS, activeOfferingNav, buildOfferingNav } from "./offering-nav";

const BASE = "/acme/discovery/offerings/p1";
const tabs = buildOfferingNav(BASE);
const active = (path: string) => {
  const found = activeOfferingNav(tabs, `${BASE}${path}`);
  return found ? `${found.tab.id}:${found.page.slug}` : null;
};

describe("buildOfferingNav", () => {
  it("has four tabs, in order, each landing on its first page", () => {
    expect(tabs.map((tab) => [tab.label, tab.href])).toEqual([
      ["Setup", BASE],
      ["Find", `${BASE}/prospects/discover`],
      ["Prospects", `${BASE}/prospects`],
      ["Results", `${BASE}/performance`],
    ]);
  });

  it("uses the plain labels", () => {
    const labels = tabs.flatMap((tab) => [tab.label, ...tab.pages.map((page) => page.label)]);
    expect(labels).toContain("Ideal customer");
    expect(labels).toContain("Find");
    expect(labels).not.toContain("ICP");
    expect(labels).not.toContain("Discovery");
  });

  it("still reaches every page the nine tabs reached, and Import and Usage besides", () => {
    const slugs = tabs.flatMap((tab) => tab.pages.map((page) => page.slug));
    for (const slug of ["", "icp", "discovery", "opportunities", "prospects", "watchlist", "performance", "conversions", "history"]) {
      expect(slugs).toContain(slug);
    }
    expect(slugs).toContain("prospects/discover");
    expect(slugs).toContain("prospects/import");
    expect(slugs).toContain("usage");
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("shows fewer links than the nine tabs did, whichever tab is open", () => {
    for (const tab of OFFERING_TABS) {
      expect(OFFERING_TABS.length + tab.pages.length).toBeLessThan(9);
    }
  });
});

describe("activeOfferingNav", () => {
  it("puts each page under its tab", () => {
    expect(active("")).toBe("setup:");
    expect(active("/icp")).toBe("setup:icp");
    expect(active("/prospects/discover")).toBe("find:prospects/discover");
    expect(active("/prospects/import")).toBe("find:prospects/import");
    expect(active("/history")).toBe("find:history");
    expect(active("/discovery")).toBe("find:discovery");
    expect(active("/prospects")).toBe("prospects:prospects");
    expect(active("/opportunities")).toBe("prospects:opportunities");
    expect(active("/watchlist")).toBe("prospects:watchlist");
    expect(active("/performance")).toBe("results:performance");
    expect(active("/conversions")).toBe("results:conversions");
    expect(active("/usage")).toBe("results:usage");
    expect(active("/people-say")).toBe("results:people-say");
    // DISC-CONS-P0-05.2: a person who opted in sits under the Prospects page's People list.
    expect(active("/prospects/people/l1")).toBe("prospects:prospects");
  });

  it("keeps a single prospect, run or opportunity under its list's tab", () => {
    expect(active("/prospects/8d0c")).toBe("prospects:prospects");
    expect(active("/history/r1")).toBe("find:history");
    expect(active("/opportunities/o1")).toBe("prospects:opportunities");
  });

  it("matches the overview only on the overview, and nothing outside the offering", () => {
    expect(active("/unknown")).toBeNull();
    expect(activeOfferingNav(tabs, "/acme/discovery/dashboard")).toBeNull();
    // Another offering whose id merely starts the same is not this one.
    expect(activeOfferingNav(tabs, `${BASE}2/icp`)).toBeNull();
  });
});

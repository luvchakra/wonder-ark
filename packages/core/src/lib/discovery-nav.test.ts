/**
 * DISC-NAV-01..05. The Discovery tree's shape and its active-route rules (spec §2.6, §3.3):
 * the page you are on is highlighted exactly once and its group starts open, and
 * Customer Acquisition points at the existing offering routes without moving them.
 */
import { describe, expect, it } from "vitest";
import { buildDiscoveryNav, CUSTOMER_ACQUISITION_ROUTES, offeringIdFromPath } from "./discovery-nav";
import { parseOfferingFocus } from "./offering-focus";

const BASE = "/acme";
const PRODUCTS = [
  { id: "p1", name: "Alarms" },
  { id: "p2", name: "Cameras" },
];

function activeIds(tree: ReturnType<typeof buildDiscoveryNav>): string[] {
  return [
    ...tree.top.filter((l) => l.active).map((l) => `top:${l.id}`),
    ...tree.groups.flatMap((g) => g.items.filter((l) => l.active).map((l) => `${g.id}:${l.id}`)),
  ];
}

const group = (tree: ReturnType<typeof buildDiscoveryNav>, id: string) => tree.groups.find((g) => g.id === id)!;

describe("buildDiscoveryNav", () => {
  it("has the approved hierarchy, in order", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/dashboard");
    expect(tree.top.map((l) => l.label)).toEqual(["Overview", "Business"]);
    expect(tree.groups.map((g) => g.id)).toEqual(["offerings", "marketing", "customer-acquisition", "funding"]);
    expect(group(tree, "marketing").items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Strategy",
      "Campaigns",
      "Content",
      "Assets",
      "Website & SEO",
      "Analytics",
    ]);
    expect(group(tree, "funding").items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Funding Profile",
      "Investor Readiness",
      "Fundraising",
      "Investors",
      "Investor Outreach",
      "Data Room",
      "Due Diligence",
      "Analytics",
    ]);
    expect(group(tree, "customer-acquisition").items.map((i) => i.label)).toEqual(
      CUSTOMER_ACQUISITION_ROUTES.map((r) => r.label),
    );
    expect(activeIds(tree)).toEqual(["top:overview"]);
  });

  it("opens Marketing and highlights the campaign list on a campaign's own page", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/marketing/campaigns/c1");
    expect(group(tree, "marketing").holdsActive).toBe(true);
    expect(group(tree, "funding").holdsActive).toBe(false);
    expect(activeIds(tree)).toEqual(["marketing:campaigns"]);
  });

  it("highlights the Marketing dashboard only on the dashboard itself", () => {
    expect(activeIds(buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/marketing"))).toEqual(["marketing:dashboard"]);
  });

  it("opens Funding on a funding page", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/funding/data-room");
    expect(group(tree, "funding").holdsActive).toBe(true);
    expect(activeIds(tree)).toEqual(["funding:data-room"]);
  });

  it("points Customer Acquisition at the existing routes of the offering in the URL", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/offerings/p2/prospects/x9");
    const acquisition = group(tree, "customer-acquisition");
    // DISC-NAV-P0-01.1: four entries, each opening its tab's first page.
    expect(acquisition.items.map((i) => [i.label, i.href])).toEqual([
      ["Setup", "/acme/discovery/offerings/p2"],
      ["Find", "/acme/discovery/offerings/p2/prospects/discover"],
      ["Prospects", "/acme/discovery/offerings/p2/prospects"],
      ["Results", "/acme/discovery/offerings/p2/performance"],
    ]);
    expect(acquisition.holdsActive).toBe(true);
    expect(acquisition.heading).toBe("Customer Acquisition · Cameras");
    // The offering is highlighted in Business Offerings and the stage in Acquisition.
    expect(activeIds(tree)).toEqual(["offerings:p2", "customer-acquisition:prospects"]);
  });

  it("highlights the tab a page belongs to, whichever of its pages is open", () => {
    const active = (path: string) => activeIds(buildDiscoveryNav(BASE, PRODUCTS, `/acme/discovery/offerings/p1${path}`));
    expect(active("")).toEqual(["offerings:p1", "customer-acquisition:setup"]);
    expect(active("/icp")).toEqual(["offerings:p1", "customer-acquisition:setup"]);
    // Find's pages sit under /prospects and elsewhere; none of them lights up Prospects.
    expect(active("/prospects/discover")).toEqual(["offerings:p1", "customer-acquisition:find"]);
    expect(active("/prospects/import")).toEqual(["offerings:p1", "customer-acquisition:find"]);
    expect(active("/history/r1")).toEqual(["offerings:p1", "customer-acquisition:find"]);
    expect(active("/watchlist")).toEqual(["offerings:p1", "customer-acquisition:prospects"]);
    expect(active("/usage")).toEqual(["offerings:p1", "customer-acquisition:results"]);
  });

  it("falls back to the first offering away from offering pages, without claiming the page", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/business");
    const acquisition = group(tree, "customer-acquisition");
    expect(acquisition.items[0]!.href).toBe("/acme/discovery/offerings/p1");
    expect(acquisition.holdsActive).toBe(false);
    expect(activeIds(tree)).toEqual(["top:business"]);
  });

  it("has no acquisition links when there is no offering yet", () => {
    const tree = buildDiscoveryNav(BASE, [], "/acme/discovery/dashboard");
    expect(group(tree, "customer-acquisition").items).toEqual([]);
    expect(group(tree, "offerings").items).toEqual([]);
  });
});

// DISC-OFFER-P0-03.1 "Offering Context Selector": context persists through navigation.
describe("remembered offering focus", () => {
  it("keeps Customer Acquisition on the offering last worked in when the URL names none", () => {
    const tree = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/marketing", "p2");
    expect(group(tree, "customer-acquisition").heading).toBe("Customer Acquisition · Cameras");
    expect(group(tree, "customer-acquisition").items[0]!.href).toBe("/acme/discovery/offerings/p2");
  });

  it("lets the URL win over the remembered offering, and ignores one that no longer exists", () => {
    expect(group(buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/offerings/p1/icp", "p2"), "customer-acquisition").heading).toBe(
      "Customer Acquisition · Alarms",
    );
    expect(group(buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/dashboard", "deleted"), "customer-acquisition").heading).toBe(
      "Customer Acquisition · Alarms",
    );
  });

  it("reads the offering id out of a path", () => {
    expect(offeringIdFromPath(BASE, "/acme/discovery/offerings/p2/prospects/x")).toBe("p2");
    expect(offeringIdFromPath(BASE, "/acme/discovery/offerings")).toBeNull();
    expect(offeringIdFromPath(BASE, "/other/discovery/offerings/p2")).toBeNull();
  });

  it("parses stored focus defensively", () => {
    expect(parseOfferingFocus({ b1: "p1", b2: 3, b3: "" })).toEqual({ b1: "p1" });
    expect(parseOfferingFocus(["p1"])).toEqual({});
    expect(parseOfferingFocus(null)).toEqual({});
  });
});

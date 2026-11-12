/**
 * PLATFORM-NAV-P0-03.1 / 03.2. The Discovery menu is four plain links and the Business
 * page is a row of its own. The page you are on is highlighted exactly once, and Customer
 * Acquisition opens the offering in focus without any route having moved.
 */
import { describe, expect, it } from "vitest";
import { buildDiscoveryNav, businessNavLink, offeringIdFromPath } from "./discovery-nav";
import { parseOfferingFocus } from "./offering-focus";

const BASE = "/acme";
const PRODUCTS = [
  { id: "p1", name: "Alarms" },
  { id: "p2", name: "Cameras" },
];

const activeIds = (links: ReturnType<typeof buildDiscoveryNav>) => links.filter((l) => l.active).map((l) => l.id);
const link = (links: ReturnType<typeof buildDiscoveryNav>, id: string) => links.find((l) => l.id === id)!;

describe("buildDiscoveryNav", () => {
  it("is four links, in order, with no Business and no list of offerings", () => {
    const links = buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/dashboard");
    expect(links.map((l) => [l.label, l.href])).toEqual([
      ["Overview", "/acme/discovery/dashboard"],
      ["Acquisition", "/acme/discovery/offerings/p1"],
      ["Marketing", "/acme/discovery/marketing"],
      ["Funding", "/acme/discovery/funding"],
    ]);
    expect(links.every((l) => l.icon)).toBe(true);
    expect(activeIds(links)).toEqual(["overview"]);
  });

  it("highlights Marketing on its dashboard and on any page under it", () => {
    expect(activeIds(buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/marketing"))).toEqual(["marketing"]);
    expect(activeIds(buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/marketing/campaigns/c1"))).toEqual(["marketing"]);
  });

  it("highlights Funding on a funding page", () => {
    expect(activeIds(buildDiscoveryNav(BASE, PRODUCTS, "/acme/discovery/funding/data-room"))).toEqual(["funding"]);
  });

  it("highlights Acquisition on every page of an offering, and opens that offering", () => {
    for (const path of ["", "/icp", "/prospects/discover", "/prospects/x9", "/campaigns/c1", "/usage"]) {
      const links = buildDiscoveryNav(BASE, PRODUCTS, `/acme/discovery/offerings/p2${path}`);
      expect(activeIds(links), path).toEqual(["customer-acquisition"]);
      expect(link(links, "customer-acquisition").href).toBe("/acme/discovery/offerings/p2");
    }
  });

  it("highlights nothing in Discovery on the Business page", () => {
    expect(activeIds(buildDiscoveryNav(BASE, PRODUCTS, "/acme/business"))).toEqual([]);
  });

  it("opens the Business page from Acquisition when there is no offering yet", () => {
    const links = buildDiscoveryNav(BASE, [], "/acme/discovery/dashboard");
    expect(link(links, "customer-acquisition").href).toBe("/acme/business");
    expect(links).toHaveLength(4);
  });
});

describe("businessNavLink", () => {
  it("points at the business's own page and is active only there", () => {
    expect(businessNavLink(BASE, "/acme/business")).toEqual({ href: "/acme/business", active: true });
    expect(businessNavLink(BASE, "/acme/discovery/dashboard").active).toBe(false);
    expect(businessNavLink(BASE, "/other/business").active).toBe(false);
    expect(businessNavLink(BASE, null).active).toBe(false);
  });
});

// DISC-OFFER-P0-03.1 "Offering Context Selector": context persists through navigation.
describe("remembered offering focus", () => {
  const acquisitionHref = (path: string, remembered?: string) =>
    link(buildDiscoveryNav(BASE, PRODUCTS, path, remembered), "customer-acquisition").href;

  it("keeps Acquisition on the offering last worked in when the URL names none", () => {
    expect(acquisitionHref("/acme/discovery/marketing", "p2")).toBe("/acme/discovery/offerings/p2");
  });

  it("lets the URL win over the remembered offering, and ignores one that no longer exists", () => {
    expect(acquisitionHref("/acme/discovery/offerings/p1/icp", "p2")).toBe("/acme/discovery/offerings/p1");
    expect(acquisitionHref("/acme/discovery/dashboard", "deleted")).toBe("/acme/discovery/offerings/p1");
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

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOfferingNav } from "@cofounderai/core/lib/offering-nav";

// DISC-NAV-P0-01.1. The offering's nine tabs became four. This is the check that no page
// was stranded by it: every page under offerings/[productId] must open from a link in
// the new nav, and every link in the nav must land on a page. Like menu-routes.test.ts
// it only reads the filesystem, so it runs in every `npm test` pass.
//
// A page with an id in its path (one prospect, one run, one opportunity) cannot be a nav
// link; it opens from a row of its list, so the list is what must be in the nav.
const __dirname = dirname(fileURLToPath(import.meta.url));
const OFFERING_ROOT = join(__dirname, "..", "app", "(dashboard)", "[businessSlug]", "discovery", "offerings", "[productId]");
const BASE = "/acme/discovery/offerings/p1";

function pageSlugs(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return pageSlugs(path);
    return entry === "page.tsx" ? [relative(OFFERING_ROOT, dir).split("\\").join("/")] : [];
  });
}

const pages = pageSlugs(OFFERING_ROOT).sort();
const navSlugs = new Set(buildOfferingNav(BASE).flatMap((tab) => tab.pages.map((page) => page.slug)));
const isDetail = (slug: string) => slug.includes("[");
/** `prospects/[prospectId]` -> `prospects`: the list a detail page opens from. */
const listOf = (slug: string) => slug.slice(0, slug.indexOf("/["));

describe("every offering page opens from a link in the four-tab nav", () => {
  // 15 when the tabs were regrouped; DISC-CAMP-P0-05.1 added Campaigns and one campaign.
  it("covers the 17 offering pages", () => {
    expect(pages).toHaveLength(17);
  });

  for (const slug of pages) {
    it(`/${slug || "(overview)"}`, () => {
      const linked = isDetail(slug) ? listOf(slug) : slug;
      expect(navSlugs.has(linked), `No nav link opens "${linked}"`).toBe(true);
    });
  }
});

describe("every link in the four-tab nav lands on a page", () => {
  for (const tab of buildOfferingNav(BASE)) {
    for (const page of tab.pages) {
      it(`${tab.label} → ${page.label}`, () => {
        const pagePath = join(OFFERING_ROOT, page.href.slice(BASE.length), "page.tsx");
        expect(existsSync(pagePath), `Expected ${pagePath}`).toBe(true);
      });
    }
  }
});

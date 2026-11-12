/** DISC-NAV-P0-01.5: Marketing's four tabs, and the pages that are sections of a tab's page. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ pathname: "/acme/discovery/marketing" }));
vi.mock("@cofounderai/core/shell/org-address-context", () => ({ useAppPathname: () => h.pathname }));
const { SectionTabs } = await import("./section-tabs");

const root = "/acme/discovery/marketing";
const tabs = [
  { href: root, label: "Overview", exact: true, also: [`${root}/strategy`, `${root}/analytics`] },
  { href: `${root}/campaigns`, label: "Campaigns" },
  { href: `${root}/content`, label: "Content", also: [`${root}/assets`] },
  { href: `${root}/website-seo`, label: "Website & SEO" },
];

function current(path: string): string[] {
  h.pathname = path;
  const html = renderToStaticMarkup(<SectionTabs tabs={tabs} />);
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((match) => match[1]!.replace("&amp;", "&"));
}

describe("SectionTabs", () => {
  it("marks the tab of the page in view", () => {
    expect(current(root)).toEqual(["Overview"]);
    expect(current(`${root}/campaigns/c1`)).toEqual(["Campaigns"]);
    expect(current(`${root}/website-seo`)).toEqual(["Website & SEO"]);
  });

  it("keeps a section's tab marked when the section is opened at its own address", () => {
    expect(current(`${root}/strategy`)).toEqual(["Overview"]);
    expect(current(`${root}/analytics`)).toEqual(["Overview"]);
    expect(current(`${root}/assets`)).toEqual(["Content"]);
  });

  it("leaves an exact tab unmarked on another tab's sub-page", () => {
    expect(current(`${root}/content/new`)).toEqual(["Content"]);
  });
});

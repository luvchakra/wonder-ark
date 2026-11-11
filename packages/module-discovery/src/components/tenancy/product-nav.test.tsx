/**
 * DISC-NAV-P0-01.1/01.2/01.3: what the offering's nav and the Today list render. Pins
 * the link count (CLAUDE.md "Minimal UI": it must go down from the nine tabs), the plain
 * labels, that the setup stepper keeps its four steps, and that every Today row carries
 * exactly one action.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ pathname: "/acme/discovery/offerings/p1" }));
vi.mock("@cofounderai/core/shell/org-address-context", () => ({ useAppPathname: () => h.pathname }));
vi.mock("./auto-populate-progress", () => ({ useAutoPopulateProgress: () => ({ activeStage: null }) }));

const { ProductNav } = await import("./product-nav");
const { TodayList } = await import("../prospects/today-list");
const { buildTodayList } = await import("../../lib/prospects/today");

const BASE = "/acme/discovery/offerings/p1";
const NINE_TABS = 9;

function links(html: string): { href: string; text: string; current: string | null }[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: /href="([^"]*)"/.exec(match[1]!)?.[1] ?? "",
    text: match[2]!.replace(/<[^>]+>/g, "").trim(),
    current: /aria-current="([^"]*)"/.exec(match[1]!)?.[1] ?? null,
  }));
}

function nav(path: string, completed: { overview?: boolean } = { overview: true }) {
  h.pathname = `${BASE}${path}`;
  return links(renderToStaticMarkup(<ProductNav basePath={BASE} completed={completed} />));
}

beforeEach(() => {
  h.pathname = BASE;
});

describe("ProductNav, once the offering has a profile", () => {
  it("shows four tabs and the pages of the tab in view", () => {
    expect(nav("/prospects").map((link) => link.text)).toEqual([
      "Setup",
      "Find",
      "Prospects",
      "Results",
      "All",
      "Opportunities",
      "Watchlist",
    ]);
  });

  it("shows fewer links than the nine tabs on every page", () => {
    for (const path of ["", "/icp", "/prospects/discover", "/prospects/import", "/history", "/discovery", "/prospects", "/opportunities", "/watchlist", "/performance", "/conversions", "/usage", "/prospects/abc"]) {
      expect(nav(path).length, path).toBeLessThan(NINE_TABS);
    }
    expect(nav("").length).toBe(6);
    expect(nav("/prospects/discover").length).toBe(8);
    expect(nav("/prospects").length).toBe(7);
    expect(nav("/performance").length).toBe(7);
  });

  it("marks the page in view, and its tab", () => {
    const found = nav("/prospects/import");
    expect(found.filter((link) => link.current === "page").map((link) => link.text)).toEqual(["Import"]);
    expect(found.find((link) => link.text === "Find")!.current).toBe("true");
    expect(found.find((link) => link.text === "Prospects")!.current).toBeNull();
  });

  it("keeps a single prospect under Prospects, with the list one click away", () => {
    const found = nav("/prospects/8d0c");
    expect(found.find((link) => link.text === "Prospects")!.current).toBe("true");
    expect(found.find((link) => link.text === "All")).toMatchObject({ href: `${BASE}/prospects`, current: "true" });
    expect(found.some((link) => link.current === "page")).toBe(false);
  });

  it("says Ideal customer and Find, never ICP or Discovery", () => {
    const labels = [...nav(""), ...nav("/prospects/discover")].map((link) => link.text);
    expect(labels).toContain("Ideal customer");
    expect(labels).toContain("Find");
    expect(labels).not.toContain("ICP");
    expect(labels).not.toContain("Discovery");
  });
});

describe("ProductNav, while the offering is being set up", () => {
  it("keeps the four-step bar, with the plain label", () => {
    expect(nav("", {}).map((link) => [link.text.replace(/^\d+/, ""), link.href])).toEqual([
      ["Overview", BASE],
      ["Ideal customer", `${BASE}/icp`],
      ["Prospects", `${BASE}/prospects`],
      ["Conversions", `${BASE}/conversions`],
    ]);
  });
});

describe("TodayList", () => {
  const stuck = { stage: "sent" as const, isStuck: true };
  const rows = buildTodayList({
    prospects: [{ stage: "replied", isStuck: false }, stuck, stuck],
    suggestionCount: 5,
    prospectsPath: `${BASE}/prospects`,
  });

  it("gives each row one action that opens the right page", () => {
    const html = renderToStaticMarkup(<TodayList rows={rows} />);
    expect(html).toContain("1 reply is waiting for your answer");
    expect(html).toContain("2 follow-ups are due");
    expect(html).toContain("5 suggestions are waiting for review");
    expect(links(html)).toEqual([
      { href: `${BASE}/prospects?stage=replied`, text: "Answer", current: null },
      { href: `${BASE}/prospects?stage=sent&amp;due=1`, text: "Follow up", current: null },
      { href: `${BASE}/prospects/discover#to-review-heading`, text: "Review", current: null },
    ]);
    expect(html.match(/<button\b/g)).toBeNull();
  });

  it("says so in one line when nothing is waiting, with no control", () => {
    const html = renderToStaticMarkup(<TodayList rows={[]} />);
    expect(html).toContain("Nothing is waiting for you today.");
    expect(links(html)).toEqual([]);
  });
});

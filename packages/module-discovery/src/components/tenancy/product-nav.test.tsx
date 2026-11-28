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
    text: match[2]!.replace(/<span aria-hidden="true"[^>]*>\d+<\/span>/g, "").replace(/<[^>]+>/g, "").trim(),
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
  // DISC-NAV-P0-02.1: three tabs and a Setup link. DISC-NAV-P0-02.5: Search and Prospects carry counts.
  const tabs = (path: string) => nav(path).filter((link) => link.text !== "Setup");

  it("shows the three tabs and Setup, on every page", () => {
    for (const path of ["", "/icp", "/setup", "/prospects/discover", "/prospects/import", "/history", "/discovery", "/prospects", "/opportunities", "/watchlist", "/campaigns", "/campaigns/abc", "/performance", "/conversions", "/usage", "/people-say", "/prospects/abc"]) {
      expect(nav(path).map((link) => link.text), path).toEqual(["Search", "Prospects", "Results", "Setup"]);
    }
  });

  it("lands each tab on its page, and Setup on setup", () => {
    expect(nav("").map((link) => link.href)).toEqual([BASE, `${BASE}/prospects`, `${BASE}/performance`, `${BASE}/setup`]);
  });

  it("counts what waits on Search and on Prospects, and nothing when nothing does", () => {
    h.pathname = BASE;
    const html = renderToStaticMarkup(<ProductNav basePath={BASE} completed={{ overview: true }} counts={{ search: 4, prospects: 2 }} />);
    expect(links(html)[0]!.text).toBe("Search4 waiting");
    expect(links(html)[1]!.text).toBe("Prospects2 waiting");
    expect(tabs("").map((link) => link.text)).toEqual(["Search", "Prospects", "Results"]);
  });

  it("marks the tab of the page in view, and Setup instead of Search while setting up", () => {
    expect(tabs("/prospects").find((link) => link.text === "Prospects")!.current).toBe("page");
    expect(tabs("/prospects/import").find((link) => link.text === "Search")!.current).toBe("true");
    expect(tabs("/campaigns/abc").find((link) => link.text === "Prospects")!.current).toBe("true");
    expect(tabs("/prospects/8d0c").find((link) => link.text === "Prospects")!.current).toBe("true");
    const setup = nav("/setup");
    expect(setup.find((link) => link.text === "Setup")!.current).toBe("page");
    expect(setup.filter((link) => link.current).length).toBe(1);
    h.pathname = BASE;
    const notSetUp = links(renderToStaticMarkup(<ProductNav basePath={BASE} completed={{ overview: true }} setupDone={false} />));
    expect(notSetUp.find((link) => link.text === "Search")!.current).toBeNull();
    expect(notSetUp.find((link) => link.text === "Setup")!.current).toBe("page");
  });

  it("shows fewer links than the nine tabs did", () => {
    expect(nav("/prospects").length).toBeLessThan(NINE_TABS);
  });
});

// DISC-NAV-P0-01.8: one short line under the tabs says what the tab in view is for.
describe("ProductNav's line about the tab in view", () => {
  const hintOf = (path: string, completed: { overview?: boolean } = { overview: true }) => {
    h.pathname = `${BASE}${path}`;
    const html = renderToStaticMarkup(<ProductNav basePath={BASE} completed={completed} />);
    const lines = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());
    return lines;
  };

  it("shows exactly one line, for the tab in view", () => {
    expect(hintOf("")).toEqual([expect.stringMatching(/Find new prospects/)]);
    expect(hintOf("/setup")).toEqual([expect.stringMatching(/Say what you sell and who buys it, then approve/)]);
    expect(hintOf("/prospects/p-123")).toEqual([expect.stringMatching(/Everyone you approved/)]);
    expect(hintOf("/conversions")).toEqual([expect.stringMatching(/What your outreach led to/)]);
  });

  it("does the same on the four-step bar while the offering is being set up", () => {
    expect(hintOf("/icp", {})).toEqual([expect.stringMatching(/approve it to start finding prospects/)]);
  });

  it("keeps each line short", () => {
    for (const path of ["", "/setup", "/prospects", "/performance"]) {
      for (const line of hintOf(path)) expect(line.length, path).toBeLessThanOrEqual(110);
    }
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

  describe("DISC-CAMP-P0-06.1: a campaign's call, WhatsApp and LinkedIn steps", () => {
    const task = (id: string, overrides: Record<string, unknown> = {}) => ({
      enrollmentId: id,
      prospectId: `p-${id}`,
      company: `Company <b>${id}</b>`,
      channel: "call" as const,
      draft: "Say you emailed them.\nAsk how they book jobs.",
      origin: "ai_generated" as const,
      detail: { text: "+91 98765 43210", href: "tel:+919876543210" },
      ...overrides,
    });
    const action = () => async () => null;

    it("shows who, the number as a link, the draft labelled with where it came from, and one action", () => {
      const html = renderToStaticMarkup(<TodayList rows={[]} tasks={{ tasks: [task("e1")], more: 0, atLeast: false }} taskAction={action} />);
      const shown = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      expect(shown).toContain("Call Company &lt;b&gt;e1&lt;/b&gt; : +91 98765 43210");
      expect(shown).toContain("Talking points · AI-generated");
      expect(shown).toContain("Say you emailed them. Ask how they book jobs.");
      expect(html).not.toContain("<b>e1</b>");
      expect(links(html)).toEqual([{ href: "tel:+919876543210", text: "+91 98765 43210", current: null }]);
      // One action on the row.
      expect(html.match(/<button\b[^>]*>([^<]*)</g)).toEqual([expect.stringContaining("Mark done")]);
      expect(html).not.toContain("Nothing is waiting");
      // Nothing was sent for it, and nothing here says so.
      expect(shown).not.toMatch(/\bsent\b/i);
    });

    it("shows a number or page with nowhere to open as text, not as a link", () => {
      const html = renderToStaticMarkup(
        <TodayList
          rows={[]}
          tasks={{
            tasks: [
              task("e1", { channel: "whatsapp", detail: { text: "98765 43210", href: null } }),
              task("e2", { channel: "linkedin", detail: { text: "no LinkedIn page is stored; find it by name", href: null } }),
            ],
            more: 0,
            atLeast: false,
          }}
          taskAction={action}
        />,
      );
      expect(links(html)).toEqual([]);
      expect(html).toContain("98765 43210");
      expect(html).toContain("no LinkedIn page is stored; find it by name");
      expect(html.match(/<button\b/g)).toHaveLength(2);
    });

    it("says how many more are due after the ones shown", () => {
      const html = renderToStaticMarkup(<TodayList rows={rows} tasks={{ tasks: [task("e1")], more: 3, atLeast: false }} taskAction={action} />);
      expect(html).toContain("3 more campaign tasks are due. They appear here as these are marked done.");
      expect(links(html)).toHaveLength(4);
      expect(html.match(/<button\b/g)).toHaveLength(1);
    });
  });

  it("says so in one line when nothing is waiting, with no control", () => {
    const html = renderToStaticMarkup(<TodayList rows={[]} />);
    expect(html).toBe("");
    expect(links(html)).toEqual([]);
  });
});

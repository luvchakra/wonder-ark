/** DISC-AUTO-P0-01.3: nothing is prepared until the person chooses which and presses Prepare. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const HOME = "/b/discovery/offerings/p1/prospects";
const h = vi.hoisted(() => ({ pathname: "/b/discovery/offerings/p1/prospects" }));
vi.mock("@cofounderai/core/shell/org-address-context", () => ({ useAppPathname: () => h.pathname }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { PrepRunner } = await import("./prep-runner");

const candidates = [
  { id: "a", name: "Week Plan", steps: 5 },
  { id: "b", name: "Melissa G", steps: 2 },
];
const action = vi.fn();
const render = () => renderToStaticMarkup(<PrepRunner candidates={candidates} prepareAction={action} homePath={HOME} />);

describe("PrepRunner", () => {
  it("lists the prospects to prepare, none ticked, and starts nothing on its own", () => {
    h.pathname = HOME;
    const html = render();
    // DISC-NAV-P0-02.5: one closed line until the person opens it.
    expect(html).toMatch(/<details class="group"><summary/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Prepare prospects (2)");
    expect(html).toContain("Week Plan");
    expect(html).toContain("Melissa G");
    expect(html.match(/type="checkbox"/g)?.length).toBe(2);
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Prepare<\/button>/);
    expect(html).toContain("about three AI calls");
    expect(action).not.toHaveBeenCalled();
  });

  it("shows nothing on the other tabs while no run is going (DISC-NAV-P0-02.3)", () => {
    for (const tab of ["", "/performance", "/prospects/x1", "/prospects/discover"]) {
      h.pathname = `/b/discovery/offerings/p1${tab}`;
      expect(render()).toBe("");
    }
  });

  it("shows nothing when there is nothing to prepare", () => {
    h.pathname = HOME;
    expect(renderToStaticMarkup(<PrepRunner candidates={[]} prepareAction={action} homePath={HOME} />)).toBe("");
  });
});

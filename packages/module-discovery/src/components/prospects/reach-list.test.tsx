/** DISC-NAV-P0-01.13: the Reach list as a to-do list, in the Next line's words and order. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReachList } from "./reach-list";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";

const channel = (id: string, stage: string, nextAction: string | null, extra: Partial<ProspectWithPipeline> = {}) =>
  ({ id, company_name: `Channel ${id}`, kind: "channel", channel_type: null, audience_size: 2741, fit_score: null, stage, nextAction, isStuck: false, status: "new", outcome: "open", ...extra }) as unknown as ProspectWithPipeline;

const noop = async () => {};
const render = (prospects: ProspectWithPipeline[]) =>
  renderToStaticMarkup(<ReachList prospects={prospects} basePath="/b/o/p/prospects" channels bulkResearchAction={noop} bulkScoreAction={noop} />);

describe("ReachList", () => {
  const html = render([
    channel("a", "researched", "Score"),
    channel("b", "scored", "Generate strategy", { fit_score: 40 }),
    channel("c", "scored", "Generate strategy", { fit_score: 72 }),
    channel("d", "researched", "Score"),
  ]);

  it("puts the next task first, under the Next line's words", () => {
    expect(html.indexOf("Write to 2 channels")).toBeGreaterThan(-1);
    expect(html.indexOf("Write to 2 channels")).toBeLessThan(html.indexOf("Score 2 channels"));
    expect(html).toContain('id="reach-write"');
  });

  it("gives a bulk step one button for its whole group, and none to the rest", () => {
    expect(html.match(/Score all/g)?.length).toBe(1);
    expect(html).not.toContain("Research all");
    expect(html.match(/name="ids"/g)?.length).toBe(2);
  });

  it("has no checkboxes, filters or status pills, and opens each card at its step", () => {
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Advanced");
    expect(html).not.toMatch(/>new</);
    expect(html).toContain('href="/b/o/p/prospects/b#strategy"');
    expect(html).toContain('href="/b/o/p/prospects/a#score"');
  });

  it("shows fit only once scored, and a search box only for long lists", () => {
    expect(html.match(/title="Fit score"/g)?.length).toBe(2);
    expect(html).not.toContain('type="search"');
    expect(render(Array.from({ length: 11 }, (_, i) => channel(`x${i}`, "new", "Research")))).toContain('type="search"');
  });

  it("says where to find prospects when none are picked", () => {
    expect(render([])).toContain("Find them on the Find tab");
  });
});

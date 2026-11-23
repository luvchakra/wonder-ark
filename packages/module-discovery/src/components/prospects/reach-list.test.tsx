/** DISC-NAV-P0-01.13: the Reach list as a to-do list, in the Next line's words and order. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReachList } from "./reach-list";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";

const channel = (id: string, stage: string, nextAction: string | null, extra: Partial<ProspectWithPipeline> = {}) =>
  ({ id, company_name: `Channel ${id}`, kind: "channel", channel_type: null, audience_size: 2741, fit_score: null, stage, nextAction, isStuck: false, status: "new", outcome: "open", ...extra }) as unknown as ProspectWithPipeline;

const render = (prospects: ProspectWithPipeline[]) =>
  renderToStaticMarkup(<ReachList prospects={prospects} basePath="/b/o/p/prospects" channels />);

describe("ReachList", () => {
  const html = render([
    channel("a", "researched", "Score"),
    channel("b", "scored", "Generate strategy", { fit_score: 40 }),
    channel("c", "messaged", "Review message", { fit_score: 72 }),
    channel("d", "new", "Research"),
  ]);

  // DISC-NAV-P0-02.1
  it("puts the person's group first, then what WonderArk is preparing", () => {
    expect(html.indexOf("Send 1 ready email")).toBeGreaterThan(-1);
    expect(html.indexOf("Send 1 ready email")).toBeLessThan(html.indexOf("To prepare (3)"));
    expect(html).toContain('id="reach-preparing"');
  });

  it("has no buttons, checkboxes, filters or status pills, and opens each card at its step", () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Advanced");
    expect(html).not.toMatch(/>new</);
    expect(html).toContain('href="/b/o/p/prospects/c#messages"');
    expect(html).toContain('href="/b/o/p/prospects/a#score"');
  });

  it("shows fit only once scored, and a search box only for long lists", () => {
    expect(html.match(/title="Fit score"/g)?.length).toBe(2);
    expect(html).not.toContain('type="search"');
    expect(render(Array.from({ length: 11 }, (_, i) => channel(`x${i}`, "new", "Research")))).toContain('type="search"');
  });

  it("says where new prospects come from when none are approved", () => {
    expect(render([])).toContain("appear on To do");
  });
});

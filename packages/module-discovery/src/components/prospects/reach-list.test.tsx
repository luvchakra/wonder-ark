/** DISC-NAV-P0-01.13: the Reach list as a to-do list, in the Next line's words and order. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReachList } from "./reach-list";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";

const channel = (id: string, stage: string, nextAction: string | null, extra: Partial<ProspectWithPipeline> = {}) =>
  ({ id, company_name: `Channel ${id}`, kind: "channel", channel_type: null, audience_size: 2741, fit_score: null, stage, nextAction, isStuck: false, status: "new", outcome: "open", ...extra }) as unknown as ProspectWithPipeline;

const render = (prospects: ProspectWithPipeline[]) =>
  renderToStaticMarkup(<ReachList prospects={prospects} basePath="/b/o/p/prospects" channels />);

const dm = (text: string) => ({
  text,
  platform: "Instagram",
  profileLink: "https://www.instagram.com/weekview/",
  markSentAction: async () => {},
  editAction: async () => null,
  rewriteAction: async () => null,
});

describe("ReachList", () => {
  const html = render([
    channel("a", "researched", "Score"),
    channel("b", "scored", "Generate strategy", { fit_score: 40 }),
    channel("c", "messaged", "Review message", { fit_score: 72 }),
    channel("d", "new", "Research"),
  ]);

  // DISC-NAV-P0-02.1
  it("puts the person's group first, then what is still to prepare", () => {
    expect(html.indexOf("Send 1 ready email")).toBeGreaterThan(-1);
    expect(html.indexOf("Send 1 ready email")).toBeLessThan(html.indexOf("To prepare (3)"));
    expect(html).toContain('id="reach-preparing"');
  });

  // DISC-NAV-P0-02.5
  it("names the one action on the person's cards and keeps the rest as closed lines", () => {
    expect(html).toMatch(/href="\/b\/o\/p\/prospects\/c#messages"[\s\S]*?Review and send/);
    expect(html).toMatch(/<details id="reach-preparing"/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).not.toContain("Nothing needs you right now.");
  });

  it("has no checkboxes, filters or status pills, and opens each card at its step", () => {
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Advanced");
    expect(html).not.toMatch(/>new</);
    expect(html).toContain('href="/b/o/p/prospects/a#score"');
  });

  it("shows fit once scored on the cards that carry no action, and a search box only for long lists", () => {
    expect(html.match(/title="Fit score"/g)?.length).toBe(1);
    expect(html).not.toContain('type="search"');
    expect(render(Array.from({ length: 11 }, (_, i) => channel(`x${i}`, "new", "Research")))).toContain('type="search"');
  });

  it("shows a direct message as its card: copy and open, mark as sent, edit (DISC-NAV-P0-02.5)", () => {
    const withDm = renderToStaticMarkup(
      <ReachList
        prospects={[channel("m", "messaged", "Review message", { reach: "instagram" } as never)]}
        basePath="/b/o/p/prospects"
        channels
        directMessages={{ m: dm("Hi! Love your weekly planning posts.") }}
      />,
    );
    expect(withDm).toContain("Message 1 on Instagram");
    expect(withDm).toContain("Hi! Love your weekly planning posts.");
    expect(withDm).toContain("Copy and open Instagram");
    expect(withDm).toContain("Mark as sent");
    expect(withDm).toMatch(/>\s*Edit\s*</);
  });

  it("says so when nothing needs the person, and where new prospects come from when none are approved", () => {
    expect(render([channel("d", "new", "Research")])).toContain("Nothing needs you right now.");
    expect(render([])).toContain("approve some on Search");
  });
});

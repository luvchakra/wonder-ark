/** DISC-DATA-P0-03.4: one box beside "To review (N)" ticks or clears every suggestion. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SuggestionReviewList } from "./suggestion-review-list";

const suggestion = (id: string) =>
  ({ id, company_name: `Company ${id}`, kind: "company", website: null, industry: null, location: null, source: "worksLake", source_ref: null, payload: {}, reason: null }) as never;

const render = (ids: string[]) =>
  renderToStaticMarkup(<SuggestionReviewList suggestions={ids.map(suggestion)} approveAction={async () => {}} discardAction={async () => {}} />);

describe("SuggestionReviewList select all", () => {
  it("offers Select all beside the heading, starting ticked like the rows", () => {
    const html = render(["a", "b"]);
    expect(html).toContain('aria-label="Select all to review"');
    expect(html).toContain("Clear all");
    expect(html).toContain('id="to-review-form"');
    expect(html.match(/name="ids"/g)?.length).toBe(2);
    expect(html.indexOf("Select all to review")).toBeLessThan(html.indexOf('id="to-review-form"'));
  });

  it("has no select-all box for a single suggestion, or none", () => {
    expect(render(["a"])).not.toContain("Select all to review");
    expect(render([])).not.toContain("Select all to review");
  });
});

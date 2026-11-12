/**
 * DISC-DATA-P0-05.1: what the weekly search renders on Find. Pins that the line shows
 * only stored values (last run, what it did or why it failed, next run), that a paused
 * search says so and shows no next run, and the control counts (CLAUDE.md "Minimal UI"):
 * one control on the line, one in a result, none when this search is already weekly.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SavedSearchSummary } from "../../lib/data-sources/types";
import { RunWeeklyButton, WeeklySearchLine } from "./weekly-search";

function controls(html: string): number {
  const all = html.match(/<(input|select|textarea|button|a|summary)\b/g) ?? [];
  const hidden = html.match(/<input[^>]*type="hidden"/g) ?? [];
  return all.length - hidden.length;
}
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/ ([.,])/g, "$1")
    .trim();

const search: SavedSearchSummary = {
  what: "electrician",
  where: "Pune",
  sourceId: "stored",
  enabled: true,
  lastRunAt: "2026-11-12T06:00:00.000Z",
  nextRunAt: "2026-11-19T05:50:00.000Z",
  lastResult: { status: "completed", found: 25, added: 3 },
};
const line = (overrides: Partial<SavedSearchSummary> = {}, sourceLabel: string | null = "WorksLake business data") =>
  renderToStaticMarkup(<WeeklySearchLine search={{ ...search, ...overrides }} sourceLabel={sourceLabel} toggleAction={async () => {}} />);
const noop = async () => null;

describe("WeeklySearchLine", () => {
  it("shows the search, its last run, its next run and one control", () => {
    const html = line();
    expect(text(html)).toBe(
      'Weekly search: "electrician" in Pune, WorksLake business data. Last run 12 Nov 2026: 25 results, 3 new to review. Next run 19 Nov 2026. Pause',
    );
    expect(controls(html)).toBe(1);
  });

  it("says a search has not run yet rather than showing a count", () => {
    expect(text(line({ lastRunAt: null, lastResult: null }))).toContain("It hasn't run yet. Next run 19 Nov 2026.");
  });

  it("shows a failed run as failed, with its reason, never as a result", () => {
    const html = text(line({ lastResult: { status: "failed", message: "Unavailable: WorksLake didn't answer." } }));
    expect(html).toContain("Last run 12 Nov 2026 failed: Unavailable: WorksLake didn't answer.");
    expect(html).not.toMatch(/results|new to review/);
  });

  it("says a paused search won't run, shows no next run, and offers Resume", () => {
    const html = line({ enabled: false, nextRunAt: null });
    expect(text(html)).toContain("Paused: it won't run until you resume it.");
    expect(text(html)).not.toContain("Next run");
    expect(text(html)).toMatch(/Resume$/);
    expect(controls(html)).toBe(1);
  });

  it("renders what was typed as text", () => {
    const html = line({ what: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img");
  });
});

describe("RunWeeklyButton", () => {
  const request = { sourceId: "stored", what: "electrician", where: "Pune" };

  it("is one button that posts the search back as it ran", () => {
    const html = renderToStaticMarkup(<RunWeeklyButton search={{ ...request, hasWebsite: true }} action={noop} current={null} />);
    expect(text(html)).toBe("Run this weekly");
    expect(controls(html)).toBe(1);
    expect(html).toContain('name="sourceId" value="stored"');
    expect(html).toContain('name="what" value="electrician"');
    expect(html).toContain('name="hasWebsite"');
    expect(html).not.toContain('name="replace"');
  });

  it("offers nothing when this search already runs weekly", () => {
    expect(renderToStaticMarkup(<RunWeeklyButton search={request} action={noop} current={search} />)).toBe("");
  });

  it("is offered again for a different search, or when the same one is paused", () => {
    expect(text(renderToStaticMarkup(<RunWeeklyButton search={{ ...request, what: "plumber" }} action={noop} current={search} />))).toBe("Run this weekly");
    expect(text(renderToStaticMarkup(<RunWeeklyButton search={request} action={noop} current={{ ...search, enabled: false }} />))).toBe("Run this weekly");
  });
});

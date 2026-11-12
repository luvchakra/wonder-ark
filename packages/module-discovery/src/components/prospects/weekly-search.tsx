"use client";

import { useActionState } from "react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  SAVED_SEARCH_INTERVAL_DAYS,
  type FindOutcome,
  type SaveWeeklySearchState,
  type SavedSearchSummary,
} from "../../lib/data-sources/types";

type WeeklyRequest = NonNullable<Extract<FindOutcome, { status: "completed" }>["weekly"]>;

/** Dates are shown in UTC so the server's render and the browser's agree. */
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function day(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DAY.format(date);
}

/** "electrician" in Pune -- the search in the person's own words, as text. */
export function describeSearch(search: { what: string; where: string }): string {
  return search.where ? `"${search.what}" in ${search.where}` : `"${search.what}"`;
}

function sameSearch(a: WeeklyRequest, b: SavedSearchSummary | null): boolean {
  return b !== null && a.sourceId === b.sourceId && a.what === b.what && a.where === b.where;
}

/**
 * DISC-DATA-P0-05.1: "Run this weekly", offered in the result of a search that just ran
 * on a free source. One button. It posts the search back exactly as it ran; the server
 * decides whether it may be saved.
 *
 * An offering has one weekly search. If it already has a different one, the first press
 * changes nothing and the button becomes "Replace it", naming what would be replaced:
 * that second press is the confirmation. If this very search is already the weekly one,
 * nothing is offered.
 */
export function RunWeeklyButton({
  search,
  action,
  current,
}: {
  search: WeeklyRequest;
  action: (prevState: SaveWeeklySearchState, formData: FormData) => Promise<SaveWeeklySearchState>;
  current: SavedSearchSummary | null;
}) {
  const [state, formAction] = useActionState<SaveWeeklySearchState, FormData>(action, null);

  if (state?.status === "saved") {
    return (
      <p role="status" className="text-muted-foreground">
        Saved. This search runs every {SAVED_SEARCH_INTERVAL_DAYS} days, on free sources only; what it finds waits in To review.
      </p>
    );
  }
  if (sameSearch(search, current) && current?.enabled) return null;

  const replacing = state?.status === "exists";
  return (
    <form action={formAction} className="flex flex-col gap-1.5 pt-1">
      <input type="hidden" name="sourceId" value={search.sourceId} />
      <input type="hidden" name="what" value={search.what} />
      <input type="hidden" name="where" value={search.where} />
      {search.companySize ? <input type="hidden" name="companySize" value={search.companySize} /> : null}
      {search.hasWebsite ? <input type="hidden" name="hasWebsite" value="on" /> : null}
      {replacing ? <input type="hidden" name="replace" value="on" /> : null}
      {replacing ? (
        <p role="status">
          This offering already runs {current ? describeSearch(current) : "another search"} weekly. An offering has one
          weekly search; replacing it stops the old one.
        </p>
      ) : null}
      {state?.status === "refused" || state?.status === "failed" ? (
        <p role="alert" className="text-destructive">
          {state.message}
        </p>
      ) : null}
      <SubmitButton variant="outline" size="sm" pendingText="Saving..." className="self-start">
        {replacing ? "Replace it" : "Run this weekly"}
      </SubmitButton>
    </form>
  );
}

function lastRunText(search: SavedSearchSummary): string {
  const when = day(search.lastRunAt);
  if (!when || !search.lastResult) return "It hasn't run yet.";
  if (search.lastResult.status === "failed") return `Last run ${when} failed: ${search.lastResult.message}`;
  const { found, added } = search.lastResult;
  return `Last run ${when}: ${found} ${found === 1 ? "result" : "results"}, ${added} new to review.`;
}

/**
 * DISC-DATA-P0-05.1: the one line that describes the offering's weekly search: what it
 * looks for and where, when it last ran and what that run did (or that it failed, and
 * why), when it runs next, and one control, Pause or Resume. Every value is the stored
 * one; a search that has not run yet says so.
 */
export function WeeklySearchLine({
  search,
  sourceLabel,
  toggleAction,
}: {
  search: SavedSearchSummary;
  /** The source's label from the gateway's current list, or null if it no longer lists it. */
  sourceLabel: string | null;
  toggleAction: () => void | Promise<void>;
}) {
  const next = day(search.nextRunAt);
  return (
    <form action={toggleAction} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm">
      <p>
        <span className="font-medium">Weekly search:</span> {describeSearch(search)}
        {sourceLabel ? `, ${sourceLabel}` : ""}.{" "}
        <span className="text-muted-foreground">
          {lastRunText(search)} {search.enabled ? (next ? `Next run ${next}.` : "") : "Paused: it won't run until you resume it."}
        </span>
      </p>
      <SubmitButton variant="outline" size="sm" pendingText={search.enabled ? "Pausing..." : "Resuming..."}>
        {search.enabled ? "Pause" : "Resume"}
      </SubmitButton>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { ChevronDown } from "lucide-react";
import { isAiProviderFailure } from "@cofounderai/core/ai-providers/is-provider-failure";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AiErrorOptions } from "../errors/ai-error-options";
import {
  DATA_SOURCE_STATUS_LABEL,
  WEB_SEARCH_SOURCE_ID,
  type DataSource,
  type DataSourceQuota,
  type FindOutcome,
  type FindState,
} from "../../lib/data-sources/types";

/**
 * DISC-DATA-P0-03.1: the Find form. Four controls and a fold, in this order: what,
 * where, source, the Find button, and "More filters".
 *
 * What and where arrive prefilled from the approved ICP, so the common search is one
 * click. Choosing a hiring-signal source swaps the "what" prefill to the ICP's buying
 * signals and tools, unless the person has already typed something of their own.
 *
 * The source list is the server's: the gateway's own sources plus the AI web search. A
 * source that is not active is listed, with its status, and cannot be chosen.
 */
export function FindForm({
  action,
  sources,
  defaultSourceId,
  quota,
  note,
  defaults,
  primary,
}: {
  action: (prevState: FindState, formData: FormData) => Promise<FindState>;
  sources: DataSource[];
  defaultSourceId: string;
  quota: DataSourceQuota | null;
  /** One line under the form: the quota, or why the gateway can't be searched. */
  note: string | null;
  defaults: { what: string; where: string; hiringKeywords: string };
  /** Find is the page's primary action unless suggestions are waiting for review. */
  primary: boolean;
}) {
  const [state, formAction] = useActionState<FindState, FormData>(action, null);
  const [sourceId, setSourceId] = useState(defaultSourceId);
  const [what, setWhat] = useState(defaults.what);
  const [whatEdited, setWhatEdited] = useState(false);

  const source = sources.find((entry) => entry.id === sourceId) ?? null;
  const signals = source?.action === "signals";
  const webSearch = source?.id === WEB_SEARCH_SOURCE_ID;
  const paidLeft = source?.paid && quota ? quota.paid.remaining : null;
  const outOfPaid = paidLeft !== null && paidLeft <= 0;

  function chooseSource(nextId: string) {
    setSourceId(nextId);
    if (whatEdited) return;
    const next = sources.find((entry) => entry.id === nextId);
    setWhat(next?.action === "signals" ? defaults.hiringKeywords : defaults.what);
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_auto] md:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="find-what">{signals ? "Hiring for" : "What"}</Label>
            <Input
              id="find-what"
              name="what"
              value={what}
              onChange={(event) => {
                setWhat(event.target.value);
                setWhatEdited(true);
              }}
              placeholder={signals ? "Job title keywords" : "Keywords or categories"}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="find-where">Where</Label>
            <Input
              id="find-where"
              name="where"
              defaultValue={defaults.where}
              placeholder="City, region or country"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="find-source">Source</Label>
            <NativeSelect
              id="find-source"
              name="sourceId"
              value={sourceId}
              onChange={(event) => chooseSource(event.target.value)}
            >
              {sources.map((entry) => (
                <option key={entry.id} value={entry.id} disabled={entry.status !== "active"}>
                  {entry.action === "signals" ? `Companies hiring for… (${entry.label})` : entry.label}
                  {entry.status === "active" ? "" : ` — ${DATA_SOURCE_STATUS_LABEL[entry.status]}`}
                </option>
              ))}
            </NativeSelect>
          </div>
          <SubmitButton
            variant={primary ? "default" : "outline"}
            pendingText="Searching..."
            disabled={!source || source.status !== "active" || outOfPaid}
            className="md:self-end"
          >
            {paidLeft === null ? "Find" : `Find (uses paid lookups · ${paidLeft} left)`}
          </SubmitButton>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            More filters
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              {signals ? null : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="find-company-size">Company size</Label>
                  <Input id="find-company-size" name="companySize" placeholder="e.g. 11-50" autoComplete="off" />
                </div>
              )}
              {webSearch ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="find-also">Also look for</Label>
                  <Input id="find-also" name="alsoLookFor" placeholder="e.g. recently raised funding" autoComplete="off" />
                </div>
              ) : null}
              {!webSearch && !signals ? (
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" name="hasWebsite" className="size-4" />
                  Only with a website
                </label>
              ) : null}
              {signals ? (
                <p className="text-sm text-muted-foreground">No extra filters for this source.</p>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </form>

      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {state ? <FindOutcomeMessage outcome={state} /> : null}
    </div>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What the last run did, in full: how many came back, how many were added, and every
 * reason something was left out. A failed run is an alert, never dressed as a result. */
function FindOutcomeMessage({ outcome }: { outcome: FindOutcome }) {
  if (outcome.status === "failed") {
    return (
      <div className="flex max-w-xl flex-col gap-2">
        <p role="alert" className="text-sm text-destructive">
          {outcome.message}
        </p>
        {outcome.reason === "error" && isAiProviderFailure(outcome.message) ? <AiErrorOptions /> : null}
      </div>
    );
  }

  const { skipped } = outcome;
  const left = [
    skipped.alreadyProspect > 0 ? `${skipped.alreadyProspect} already in your prospects` : null,
    skipped.alreadyInReview > 0 ? `${skipped.alreadyInReview} already waiting for review` : null,
    skipped.icp > 0 ? `${skipped.icp} outside your ICP (${skipped.icpReasons.join(", ")})` : null,
    skipped.unreadable > 0 ? `${skipped.unreadable} that couldn't be read` : null,
  ].filter((part): part is string => part !== null);

  return (
    <div role="status" className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm">
      <p>
        {outcome.sourceLabel} returned {plural(outcome.found, "result", "results")}.{" "}
        {outcome.added > 0
          ? `${plural(outcome.added, "was", "were")} added to review below.`
          : "Nothing new was added to review."}
      </p>
      {left.length > 0 ? <p className="text-muted-foreground">Left out: {left.join("; ")}.</p> : null}
      {outcome.unitsSpent ? (
        <p className="text-muted-foreground">Used {plural(outcome.unitsSpent, "paid lookup", "paid lookups")}.</p>
      ) : null}
      {outcome.providerIssues.map((issue) => (
        <p key={issue.id} className="text-muted-foreground">
          {issue.id}:{" "}
          {issue.status === "needs_setup"
            ? "Needs setup"
            : issue.status === "quota"
              ? "Lookup limit reached"
              : "Unavailable"}
        </p>
      ))}
    </div>
  );
}

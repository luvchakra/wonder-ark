"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { cn } from "@cofounderai/core/lib/utils";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";
import { NEXT_ACTION_ANCHOR, PROSPECT_STAGE_LABEL, PROSPECT_STAGES } from "../../lib/prospects/pipeline";
import { ScoreRagDot } from "./rag-badge";
import { channelTypeLabel, formatAudience } from "../../lib/data-sources/channels";

/** DISC-CONS-P0-05.1: the three middle columns, for a company or a channel. A channel
 * shows its type and audience where a company shows its industry and size. */
function middleColumns(p: ProspectWithPipeline): [string, string | null][] {
  if (p.kind === "channel") {
    return [
      ["Type", channelTypeLabel(p.channel_type)],
      ["Audience", formatAudience(p.audience_size)],
      ["Location", p.location],
    ];
  }
  return [
    ["Industry", p.industry],
    ["Size", p.company_size],
    ["Location", p.location],
  ];
}

/**
 * Each card/row is a "stretched link" (a transparent, absolutely-positioned Link
 * filling the card via the `relative` wrapper it's a descendant of, Bootstrap's
 * stretched-link pattern) rather than a JS onClick+router.push -- a real anchor keeps
 * it keyboard-focusable and works with screen readers for free. The checkbox and the
 * "next action" link both sit at a higher z-index so they keep intercepting clicks
 * over the card/row-wide link beneath them.
 *
 * Two renderings of the same grouped-by-stage data, one shown at a time via Tailwind's
 * responsive `hidden`/`lg:hidden` rather than two separate components: a compact-card
 * grid below the `lg` breakpoint (small screens have no room for tabular columns) and a
 * real `<table>` at `lg` and up (per the platform's own "table on larger screens,
 * compact cards on smaller ones" design principle -- docs/DESIGN.md). Cards show each
 * attribute as its own small labeled chip in a `flex-wrap` row -- multiple attributes
 * share a row when the text width allows, wrapping to the next row otherwise -- instead
 * of the previous single truncated "industry · size · location" line, which silently
 * dropped whichever field didn't fit. Both views share the same select-all/bulk-action
 * state and the same per-stage grouping ("Select all" and the bulk action bar still
 * operate on the full flattened list across every group, in either view).
 */
export function ProspectsCards({
  prospects,
  basePath,
  bulkResearchAction,
  bulkScoreAction,
  channels = false,
}: {
  prospects: ProspectWithPipeline[];
  basePath: string;
  /** DISC-CONS-P0-05.1: the list holds channels, so the headings name their columns. */
  channels?: boolean;
  bulkResearchAction: (formData: FormData) => void | Promise<void>;
  bulkScoreAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === prospects.length ? new Set() : new Set(prospects.map((p) => p.id)),
    );
  }

  const allSelected = prospects.length > 0 && selected.size === prospects.length;

  const groups = PROSPECT_STAGES.map((stage) => ({
    stage,
    prospects: prospects.filter((p) => p.stage === stage),
  })).filter((g) => g.prospects.length > 0);

  return (
    <form action={bulkResearchAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all prospects"
            className="size-4"
          />
          Select all
        </label>
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <SubmitButton size="sm" variant="outline" pendingText="Researching...">
              Research selected
            </SubmitButton>
            <SubmitButton size="sm" variant="outline" pendingText="Scoring..." formAction={bulkScoreAction}>
              Score selected
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        ) : null}
      </div>

      {groups.map((group) => (
        <div key={group.stage} className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {PROSPECT_STAGE_LABEL[group.stage]} ({group.prospects.length})
          </p>

          {/* Compact cards -- below `lg`. */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {group.prospects.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                basePath={basePath}
                selected={selected.has(p.id)}
                onToggle={() => toggle(p.id)}
              />
            ))}
          </ul>

          {/* Table -- `lg` and up. */}
          <div className="hidden overflow-hidden rounded-lg border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Select</span>
                  </TableHead>
                  <TableHead>{channels ? "Channel" : "Company"}</TableHead>
                  <TableHead>{channels ? "Type" : "Industry"}</TableHead>
                  <TableHead>{channels ? "Audience" : "Size"}</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Fit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.prospects.map((p) => (
                  <TableRow key={p.id} className="relative">
                    <TableCell>
                      <input
                        type="checkbox"
                        name="ids"
                        value={p.id}
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        aria-label={`Select ${p.company_name}`}
                        className="relative z-10 size-4"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`${basePath}/${p.id}`} className="absolute inset-0 z-0" aria-label={p.company_name} />
                      <span className="relative">{p.company_name}</span>
                    </TableCell>
                    {middleColumns(p).map(([label, value]) => (
                      <TableCell key={label} className="text-muted-foreground">
                        {value || "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <ScoreRagDot score={p.fit_score} />
                        {p.fit_score ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={p.status} />
                      {p.isStuck ? (
                        <span
                          title={`No activity since ${new Date(p.lastActivityAt).toLocaleDateString()}`}
                          className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                        >
                          Needs next step
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {p.nextAction ? (
                        <Link
                          href={`${basePath}/${p.id}#${NEXT_ACTION_ANCHOR[p.nextAction] ?? ""}`}
                          className="relative z-10 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                        >
                          {p.nextAction}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </form>
  );
}

function StatusPill({ status }: { status: ProspectWithPipeline["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        status === "qualified" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

/** One labeled attribute chip. The parent's `flex-wrap` lets several chips share a row
 * when the card is wide enough, or drop to their own row otherwise -- but a chip's own
 * *value* still needs to wrap onto a second line rather than force the whole chip
 * (and the card, and the page) wider than the screen, which is exactly what a long
 * compound value (a multi-clause Industry string is the common case) did when this
 * was `whitespace-nowrap`. `max-w-full` plus `break-words` lets a long value wrap
 * inside the chip instead. */
function AttributeChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
      <span className="shrink-0 font-medium text-foreground/70">{label}:</span>
      <span className="break-words">{value}</span>
    </span>
  );
}

function ProspectCard({
  prospect: p,
  basePath,
  selected,
  onToggle,
}: {
  prospect: ProspectWithPipeline;
  basePath: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const attributes = middleColumns(p).filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <li className="relative flex min-w-0 flex-col gap-2 rounded-lg border p-3 text-sm transition-colors hover:border-primary hover:bg-accent/40">
      <Link href={`${basePath}/${p.id}`} className="absolute inset-0 z-0" aria-label={p.company_name} />

      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            name="ids"
            value={p.id}
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${p.company_name}`}
            className="relative z-10 mt-0.5 size-4 shrink-0"
          />
          <span className="truncate font-medium">{p.company_name}</span>
        </div>
        <span className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">Fit:</span>
          <ScoreRagDot score={p.fit_score} />
          {p.fit_score ?? "—"}
        </span>
      </div>

      {attributes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pl-6">
          {attributes.map(([label, value]) => (
            <AttributeChip key={label} label={label} value={value} />
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pl-6">
        <StatusPill status={p.status} />
        {p.isStuck ? (
          <span
            title={`No activity since ${new Date(p.lastActivityAt).toLocaleDateString()}`}
            className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
          >
            Needs next step
          </span>
        ) : null}
      </div>

      {p.nextAction ? (
        <Link
          href={`${basePath}/${p.id}#${NEXT_ACTION_ANCHOR[p.nextAction] ?? ""}`}
          className="relative z-10 mt-1 self-start rounded-md border bg-background px-2 py-1 pl-6 text-xs font-medium hover:bg-accent"
        >
          {p.nextAction}
        </Link>
      ) : null}
    </li>
  );
}

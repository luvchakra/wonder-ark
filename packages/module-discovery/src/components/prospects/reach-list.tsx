"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";
import { NEXT_ACTION_ANCHOR } from "../../lib/prospects/pipeline";
import { reachGroups } from "../../lib/journey/next-step";
import { channelTypeLabel, formatAudience } from "../../lib/data-sources/channels";
import { ScoreRagDot } from "./rag-badge";

/** Above this many, a search box helps find one by name. */
const SEARCH_FROM = 10;

/**
 * DISC-NAV-P0-01.13: the Reach list as a to-do list. Picked prospects are grouped by what to
 * do next, under the same words and in the same order as the Next line above it (answer,
 * follow up, send, write, score, research; then waiting for a reply, then closed). A card
 * opens the prospect at that step. Research and Score, which run in bulk, have one button
 * for the whole group. No checkboxes, filters or status pills: the group says it all.
 */
export function ReachList({
  prospects,
  basePath,
  channels = false,
  bulkResearchAction,
  bulkScoreAction,
}: {
  prospects: ProspectWithPipeline[];
  basePath: string;
  channels?: boolean;
  bulkResearchAction: (formData: FormData) => void | Promise<void>;
  bulkScoreAction: (formData: FormData) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reachGroups(q ? prospects.filter((p) => p.company_name.toLowerCase().includes(q)) : prospects);
  }, [prospects, query]);

  if (prospects.length === 0) {
    return (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        No {channels ? "channels" : "prospects"} picked yet. Find them on the Find tab.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {prospects.length > SEARCH_FROM ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={channels ? "Search by channel name..." : "Search by company name..."}
            aria-label="Search"
            className="pl-8"
          />
        </div>
      ) : null}

      {groups.length === 0 ? <p className="text-sm text-muted-foreground">None match.</p> : null}

      {groups.map((group) => {
        const bulk = group.id === "research" ? bulkResearchAction : group.id === "score" ? bulkScoreAction : null;
        return (
          <section key={group.id} id={`reach-${group.id}`} aria-labelledby={`reach-${group.id}-title`} className="flex scroll-mt-4 flex-col gap-2">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <h2 id={`reach-${group.id}-title`} className="text-sm font-semibold">
                {group.title}
              </h2>
              {bulk && group.prospects.length > 1 ? (
                <form action={bulk}>
                  {group.prospects.map((p) => (
                    <input key={p.id} type="hidden" name="ids" value={p.id} />
                  ))}
                  <SubmitButton size="sm" pendingText={group.id === "research" ? "Researching..." : "Scoring..."}>
                    {group.id === "research" ? "Research all" : "Score all"}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.prospects.map((p) => (
                <ReachCard key={p.id} prospect={p} basePath={basePath} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ReachCard({ prospect: p, basePath }: { prospect: ProspectWithPipeline; basePath: string }) {
  const anchor = p.nextAction ? NEXT_ACTION_ANCHOR[p.nextAction] : undefined;
  const details =
    p.kind === "channel"
      ? [channelTypeLabel(p.channel_type), p.audience_size ? `${formatAudience(p.audience_size)} audience` : null]
      : [p.industry, p.location];
  const line = details.filter(Boolean).join(" · ");
  return (
    <li>
      <Link
        href={`${basePath}/${p.id}${anchor ? `#${anchor}` : ""}`}
        className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary hover:bg-accent/40"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{p.company_name}</span>
          {line ? <span className="block truncate text-xs text-muted-foreground">{line}</span> : null}
        </span>
        {p.fit_score !== null && p.fit_score !== undefined ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Fit score">
            <ScoreRagDot score={p.fit_score} />
            {p.fit_score}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

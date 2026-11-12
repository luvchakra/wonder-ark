"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { ProspectFilters } from "./prospect-filters";
import { ProspectsCards } from "./prospects-cards";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";

/**
 * Owns both the live search query (typing filters `prospects` -- already server-filtered
 * by status/stage/industry/sort -- instantly, client-side, no round trip) and the
 * Advanced panel's open state. The panel renders as its own full-width row below the
 * search box rather than sharing its flex row: nesting a flex-wrap filter grid inside a
 * flex-1 sibling of the search input made both fight over width every time it opened.
 */
export function ProspectsBoard({
  prospects,
  basePath,
  initialSearch,
  status,
  stage,
  industry,
  sort,
  industries,
  defaultAdvancedOpen,
  hasActiveFilters,
  bulkResearchAction,
  bulkScoreAction,
  channels = false,
  list,
}: {
  prospects: ProspectWithPipeline[];
  basePath: string;
  initialSearch: string;
  status: string;
  stage: string;
  industry: string;
  sort: string;
  industries: string[];
  defaultAdvancedOpen: boolean;
  hasActiveFilters: boolean;
  bulkResearchAction: (formData: FormData) => void | Promise<void>;
  bulkScoreAction: (formData: FormData) => void | Promise<void>;
  /** DISC-CONS-P0-05.1: the list is the offering's channels. */
  channels?: boolean;
  /** The list's name in the URL, kept by the filters. */
  list?: string;
}) {
  const [query, setQuery] = useState(initialSearch);
  const [advancedOpen, setAdvancedOpen] = useState(defaultAdvancedOpen);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prospects;
    return prospects.filter((p) => p.company_name.toLowerCase().includes(q));
  }, [prospects, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={channels ? "Search by channel name..." : "Search by company name..."}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="shrink-0 gap-1.5"
        >
          Advanced
          <ChevronDown
            className={cn("size-4 transition-transform duration-150", advancedOpen && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
      </div>

      <ProspectFilters
        basePath={basePath}
        status={status}
        stage={stage}
        industry={industry}
        sort={sort}
        industries={industries}
        open={advancedOpen}
        hasActiveFilters={hasActiveFilters}
        list={list}
      />

      {filtered.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          {query || hasActiveFilters
            ? `No ${channels ? "channels" : "prospects"} match these filters.`
            : channels
              ? "No channels yet. Find them on the Find tab."
              : "No prospects yet."}
        </p>
      ) : (
        <ProspectsCards
          prospects={filtered}
          basePath={basePath}
          bulkResearchAction={bulkResearchAction}
          bulkScoreAction={bulkScoreAction}
          channels={channels}
        />
      )}
    </div>
  );
}

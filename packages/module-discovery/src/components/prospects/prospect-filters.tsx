import Link from "next/link";
import { cn } from "@cofounderai/core/lib/utils";
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import type { ProspectStatus } from "../../lib/prospects/types";
import { PROSPECT_STAGES, PROSPECT_STAGE_LABEL } from "../../lib/prospects/pipeline";

const STATUS_OPTIONS: ProspectStatus[] = ["new", "qualified", "disqualified"];

/**
 * Advanced filters panel -- status/stage/industry/sort, submitted via a GET form (these
 * need a fresh server sort/filter, unlike the plain search box which filters the
 * already-loaded list client-side in ProspectsBoard). Rendered as its own full-width
 * block below the search row (see ProspectsBoard, which owns `open`) rather than sharing
 * that row's flex layout -- nesting a flex-wrap panel inside the search row's flex item
 * fought the search box for width every time it opened.
 */
export function ProspectFilters({
  basePath,
  status,
  stage,
  industry,
  sort,
  industries,
  open,
  hasActiveFilters,
  list,
}: {
  basePath: string;
  status: string;
  stage: string;
  industry: string;
  sort: string;
  industries: string[];
  open: boolean;
  hasActiveFilters: boolean;
  /** DISC-CONS-P0-05.1: the list being filtered (companies or channels), kept on submit. */
  list?: string;
}) {
  return (
    <form
      method="get"
      className={cn("flex flex-wrap items-end gap-3 rounded-md border p-3", !open && "hidden")}
    >
      {list ? <input type="hidden" name="list" value={list} /> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <NativeSelect id="status" name="status" defaultValue={status}>
          <option value="">Any</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="stage">Stage</Label>
        <NativeSelect id="stage" name="stage" defaultValue={stage}>
          <option value="">Any</option>
          {PROSPECT_STAGES.map((s) => (
            <option key={s} value={s}>
              {PROSPECT_STAGE_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {industries.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="industry">Industry</Label>
          <NativeSelect id="industry" name="industry" defaultValue={industry}>
            <option value="">Any</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sort">Sort</Label>
        <NativeSelect id="sort" name="sort" defaultValue={sort}>
          <option value="recent">Most recent</option>
          <option value="stage">Pipeline stage</option>
          <option value="priority">Priority (highest fit, needs action)</option>
        </NativeSelect>
      </div>
      <Button type="submit" size="sm" variant="outline">
        Filter
      </Button>
      {hasActiveFilters ? (
        <Button asChild size="sm" variant="ghost">
          <Link href={basePath}>Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}

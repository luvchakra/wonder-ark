import Link from "next/link";
import { Button } from "@cofounderai/core/ui/button";
import type { TodayRow } from "../../lib/prospects/today";

/**
 * DISC-NAV-P0-01.2: the Today list at the top of Prospects. One line per thing that is
 * waiting, each with the single action that opens it; when nothing is waiting, one line
 * says so. The rows are built by `buildTodayList` from the offering's own prospects and
 * suggestions -- nothing here is estimated or sampled.
 *
 * Layout: the person's task on Prospects is to work the list below, so this stays a
 * short, quiet block above it: text on the left, the action on the right, the same on a
 * phone (the text wraps; the action keeps its place).
 */
export function TodayList({ rows }: { rows: TodayRow[] }) {
  return (
    <section aria-labelledby="today-heading" className="rounded-lg border bg-card">
      <h2 id="today-heading" className="border-b px-4 py-2 text-sm font-medium">
        Today
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nothing is waiting for you today.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="min-w-0">{row.text}</span>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={row.href}>{row.action}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

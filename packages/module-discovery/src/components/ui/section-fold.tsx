import { ChevronDown } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";

/**
 * DISC-NAV-P0-01.4: one section of an offering's tab page, closed until it is wanted: a
 * title and a one-line summary, with the detail opening in place behind a chevron (the
 * same pattern as WonderWorks' Fold). A native <details>, so it needs no client code and
 * works before the page's script loads.
 *
 * A page shown inside a section (Import inside Find, Watchlist inside Prospects) keeps its
 * own heading and one-line description for when it is opened at its own address; inside
 * a section the section's title says the same, so that heading and the line after it are
 * hidden here. A section's own heading at its top (alone, or beside its action) is hidden
 * the same way, and its action stays.
 */
export function SectionFold({
  id,
  title,
  hint,
  open = false,
  className,
  children,
}: {
  id?: string;
  title: string;
  hint?: string | null;
  open?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details id={id} open={open} className={cn("group scroll-mt-4 rounded-lg border border-border bg-card px-4 md:px-5", className)}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          {hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-border pt-4 pb-4 md:pb-5 [&_h1]:hidden [&_h1+p]:hidden [&>h2:first-child]:hidden [&>div:first-child>h2:first-child]:hidden">{children}</div>
    </details>
  );
}

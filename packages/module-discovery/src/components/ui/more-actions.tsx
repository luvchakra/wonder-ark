import { ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";

/**
 * DISC-NAV-P0-01.9: the actions used now and then, folded behind one "More" so a stage
 * shows its main action and little else (CLAUDE.md, "Minimal UI"). A native <details>:
 * it holds forms and server actions as they are, needs no client code, and works before
 * the page's script loads. Open, its actions sit in a row under the summary.
 *
 * DISC-NAV-P0-02.3: `compact` is the same fold as a three-dot icon button, for a row that
 * already holds something else (a tab page's list chips); its actions open as a small
 * panel under it, so the row keeps its height.
 */
export function MoreActions({
  label = "More",
  compact = false,
  className,
  children,
}: {
  label?: string;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (compact) {
    return (
      <details className={cn("group relative", className)}>
        <summary
          aria-label={label}
          className="grid size-8 cursor-pointer list-none place-items-center rounded-md border border-input hover:bg-accent [&::-webkit-details-marker]:hidden"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </summary>
        <div className="absolute right-0 z-20 mt-1 flex w-max max-w-[80vw] flex-wrap items-center gap-2 rounded-md border bg-card p-2 shadow-md">{children}</div>
      </details>
    );
  }
  return (
    <details className={cn("group", className)}>
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="size-3.5 opacity-60 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
    </details>
  );
}

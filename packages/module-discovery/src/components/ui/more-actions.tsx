import { ChevronDown } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";

/**
 * DISC-NAV-P0-01.9: the actions used now and then, folded behind one "More" so a stage
 * shows its main action and little else (CLAUDE.md, "Minimal UI"). A native <details>:
 * it holds forms and server actions as they are, needs no client code, and works before
 * the page's script loads. Open, its actions sit in a row under the summary.
 */
export function MoreActions({
  label = "More",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
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

import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Platform-wide "no items yet" placeholder for a list/table (UI-UX-UNIFORMITY.md §1c).
 * 26 call sites across inventory/fsm/crm hand-rolled one of two byte-identical Tailwind
 * patterns before this existed -- `panel` (icon + rounded-2xl/p-12, full list/table
 * pages) and `inline` (text-only rounded-lg/p-8, tabs/sub-sections within a page).
 * Dashboard-widget empty states (already borderless-by-design inside a `Card`) are a
 * different convention on purpose, not covered here.
 */
export function EmptyState({
  icon: Icon,
  message,
  variant = "panel",
  className,
}: {
  icon?: LucideIcon;
  message: string;
  variant?: "panel" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <p
        className={cn(
          "rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {message}
      </p>
    );
  }

  // The panel reads as a friendly welcome rather than a gap (docs/DESIGN.md,
  // "Approachable look"): the icon sits in a soft blue circle and the message is in
  // body text, not muted.
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-7" aria-hidden="true" />
        </span>
      ) : null}
      <p className="max-w-sm text-sm font-medium text-balance text-foreground">{message}</p>
    </div>
  );
}

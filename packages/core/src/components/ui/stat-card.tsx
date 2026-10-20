import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

export type StatTone = "primary" | "success" | "warning" | "destructive";

/** Static class strings per tone — Tailwind can't see classes built by interpolation. */
const TONE_CHIP: Record<StatTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success-subtle",
  warning: "bg-warning/15 text-warning-subtle",
  destructive: "bg-destructive/10 text-destructive-subtle",
};

/**
 * The platform's KPI tile (docs/DESIGN.md): a big number, its label, an optional
 * period-over-period trend, and an optional tinted icon chip. Every module dashboard
 * hand-rolled its own near-identical version of this before it existed, which is what
 * made the same metric read differently from one module to the next.
 *
 * `href` makes the whole tile a link (to wherever that number is explained or acted on).
 * The chevron is what signals that at rest — a bordered box alone doesn't read as
 * tappable, especially on touch where hover cues never show.
 */
export function StatCard({
  label,
  value,
  detail,
  trend,
  icon: Icon,
  tone = "primary",
  href,
  className,
}: {
  label: string;
  value: string | number;
  detail?: string;
  /** `direction` drives both the arrow and its color: up reads as good, down as bad. */
  trend?: { direction: "up" | "down"; value: string; label?: string };
  icon?: LucideIcon;
  tone?: StatTone;
  href?: string;
  className?: string;
}) {
  const TrendIcon = trend?.direction === "down" ? ArrowDownRight : ArrowUpRight;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {/* Wraps rather than truncates: at a phone width these tiles sit two to a row,
              where "Meetings Booked" would otherwise clip to "Meetings B…". */}
          <p className="mt-1 text-sm text-balance text-muted-foreground">{label}</p>
        </div>
        {Icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              TONE_CHIP[tone],
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
        ) : href ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
      </div>
      {trend || detail ? (
        <div className="mt-3 flex min-w-0 items-center gap-2 text-xs">
          {trend ? (
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 font-medium",
                trend.direction === "down" ? "text-destructive-subtle" : "text-success-subtle",
              )}
            >
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {trend.value}
              {trend.label ? <span className="sr-only"> {trend.label}</span> : null}
            </span>
          ) : null}
          {detail ? <span className="truncate text-muted-foreground">{detail}</span> : null}
        </div>
      ) : null}
    </>
  );

  const base = "rounded-xl border border-border bg-card p-5 shadow-sm";
  if (!href) return <div className={cn(base, className)}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        base,
        "block transition-all hover:border-primary/40 hover:shadow-md active:bg-accent/40",
        className,
      )}
    >
      {body}
    </Link>
  );
}

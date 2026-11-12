"use client";

import type { ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { Button, type buttonVariants } from "./button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";
import { cn } from "../../lib/utils";

/**
 * PLATFORM-NAV-P0-02.x -- one button that opens what a screen needs only now and then:
 * its filters, a create form, an explanation (CLAUDE.md, "Minimal UI": fold settings, rare
 * options and explanations). Closed, the page shows one control instead of the row of
 * them inside.
 *
 * `count` is how many of the folded choices are in effect ("Filters · 2"), so a filtered
 * list never looks unfiltered; pass `defaultOpen` for the same case so the choices that
 * shape the list are on screen. The content is not rendered while closed.
 */
export function Fold({
  label,
  count,
  icon,
  defaultOpen = false,
  variant = "outline",
  className,
  contentClassName,
  children,
}: {
  label: string;
  count?: number;
  icon?: ReactNode;
  defaultOpen?: boolean;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("flex flex-col gap-3", className)}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant={variant} size="sm" className="group w-fit gap-1.5">
          {icon}
          {label}
          {count ? <span className="tabular-nums">· {count}</span> : null}
          <ChevronDown
            className="size-3.5 opacity-60 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={contentClassName}>{children}</CollapsibleContent>
    </Collapsible>
  );
}

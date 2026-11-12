"use client";

import type { ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

/**
 * PLATFORM-NAV-P0-02.x -- the one "More" control (CLAUDE.md, "Minimal UI"). A screen keeps
 * its primary action as a button; the actions used now and then go in here, one click
 * away, so they stop competing with it.
 *
 * - `variant="button"` (default) is for a page or section header: an outline button
 *   labelled "More".
 * - `variant="row"` is for a list item that would otherwise carry several actions: one
 *   icon button, named by `label` for screen readers (pass what the row is, e.g.
 *   "More for Acme").
 *
 * Children are `MoreMenuItem`s. An item is a button (`onSelect`) or, with `asChild`, a link.
 */
export function MoreMenu({
  label = "More",
  variant = "button",
  align = "end",
  disabled,
  children,
}: {
  label?: string;
  variant?: "button" | "row";
  align?: "start" | "end";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        {variant === "row" ? (
          <Button variant="ghost" size="icon" aria-label={label} className="size-8 shrink-0">
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
            {label}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const MoreMenuItem = DropdownMenuItem;

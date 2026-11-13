"use client";

import { MoreHorizontal } from "lucide-react";
import { useSidebar } from "./sidebar-context";

/**
 * PLATFORM-NAV-P0-04.1: the round menu button at the bottom right, within thumb's reach,
 * the same as WonderWorks' (its MobileNav). It opens and closes the sidebar drawer, as
 * the topbar's hamburger does. Only below `lg`, where the sidebar is a drawer; from `lg`
 * the sidebar is always on screen and this is not shown.
 */
export function SidebarFab() {
  const { open, setOpen } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
    >
      <MoreHorizontal className="size-6" aria-hidden="true" />
    </button>
  );
}

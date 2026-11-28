"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, Pin, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { readPinnedBusinessIds, writePinnedBusinessIds } from "../../lib/pinned-businesses";
import type { ShellBusiness } from "./types";
import { ENVIRONMENT_COLOR } from "./environment-badge";
import { ENVIRONMENT_LABEL } from "../../lib/org-address";

/**
 * Topbar business switcher -- ported from co-founder-ai's
 * header BusinessSelector
 * (components/tenancy/business-selector.tsx, per its "Header & Business Selector
 * Enhancement" doc: always reachable from anywhere in the dashboard, not just pages with
 * a business in the URL, and "+ Create New Business" always last, separated by a
 * divider). Rebuilt on the shell's own DropdownMenu primitives rather than
 * co-founder-ai's hand-rolled popover, so it picks
 * up the platform's own light/blue design system per docs/DESIGN.md instead of
 * co-founder-ai's dark-violet one (CLAUDE.md non-negotiable #7). The rail keeps the
 * module navigation; this is the quick "which business am I in" control that stays
 * visible in the topbar from every page.
 */
/** A business's own logo where it has one, the generic icon where it doesn't -- the two
 * are the same size and shape so a switcher row doesn't reflow depending on whether a
 * logo has been uploaded yet. */
function BusinessLogo({
  business,
  className,
}: {
  business: Pick<ShellBusiness, "name" | "logoUrl"> | null;
  className?: string;
}) {
  if (business?.logoUrl) {
    return (
      // A Supabase Storage public URL, not a build-time-known domain next/image is
      // configured for.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={business.logoUrl}
        alt=""
        className="size-5 shrink-0 rounded-sm object-contain"
      />
    );
  }
  return <Building2 className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
}

export function BusinessSwitcher({
  businesses,
  activeBusinessId,
  businessHref,
}: {
  businesses: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref: (businessId: string) => string;
}) {
  const activeBusiness = businesses.find((b) => b.id === activeBusinessId) ?? null;
  // PLATFORM-P1-10.5: the active organization's environments the user belongs to, linked
  // by organization (never guessed from the environment's rank).
  const activeOrganizationId = activeBusiness ? (activeBusiness.organizationId ?? activeBusiness.id) : null;
  const siblings = activeOrganizationId
    ? businesses.filter((b) => (b.organizationId ?? b.id) === activeOrganizationId)
    : [];
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    setPinnedIds(readPinnedBusinessIds());
  }, []);

  function togglePin(businessId: string) {
    setPinnedIds((prev) => {
      const next = prev.includes(businessId) ? prev.filter((id) => id !== businessId) : [...prev, businessId];
      writePinnedBusinessIds(next);
      return next;
    });
  }

  // Pinned businesses float to the top (stable within each group -- neither group is
  // re-sorted beyond that) rather than an exclusive lock like the sidebar's module pin:
  // any number of businesses can be pinned, and pinning one never blocks switching to an
  // unpinned one.
  const orderedBusinesses = [...businesses].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id);
    const bPinned = pinnedIds.includes(b.id);
    return aPinned === bPinned ? 0 : aPinned ? -1 : 1;
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* PLATFORM-NAV-P0-03.5 (owner, 2026-11-29): the whole business name is visible in the
            top bar. The trigger takes all the room the bar leaves (no fixed max width) and
            has no border of its own on a phone, and a name that still doesn't fit wraps onto
            a second, slightly smaller line instead of being cut with an ellipsis. */}
        <button
          type="button"
          title={activeBusiness?.name}
          className={cn(
            "flex min-h-9 min-w-0 max-w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm font-medium transition-colors sm:max-w-[24rem] sm:border sm:px-3",
            activeBusiness
              ? "border-border bg-card text-foreground hover:bg-accent/50 sm:hover:border-primary/40"
              : "border-primary/25 bg-primary/5 text-primary hover:bg-primary/10",
          )}
        >
          <BusinessLogo
            business={activeBusiness}
            className={activeBusiness ? "text-muted-foreground" : "text-primary"}
          />
          <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-tight break-words sm:text-sm">
            {activeBusiness?.name ?? "Select a business"}
          </span>
          {activeBusiness ? (
            <span
              className={cn("size-2 shrink-0 rounded-full", ENVIRONMENT_COLOR[activeBusiness.environment ?? "production"].dot)}
              title={ENVIRONMENT_LABEL[activeBusiness.environment ?? "production"]}
              aria-label={`${ENVIRONMENT_LABEL[activeBusiness.environment ?? "production"]} environment`}
            />
          ) : null}
          <ChevronDown
            className={cn("size-4 shrink-0", activeBusiness ? "text-muted-foreground" : "text-primary")}
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      {/* PLATFORM-NAV-P0-03.4 (owner, 2026-11-29): wide enough for a business's whole name, up
          to the screen's width on a phone; a longer name wraps rather than being cut. */}
      <DropdownMenuContent align="start" className="w-[min(24rem,calc(100vw-1.5rem))]">
        {siblings.length > 1 ? (
          <>
            <div className="flex flex-wrap gap-1.5 px-2 py-1.5">
              {siblings.map((b) => {
                const env = b.environment ?? "production";
                return (
                  <Link
                    key={b.id}
                    href={businessHref(b.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
                      b.id === activeBusinessId ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", ENVIRONMENT_COLOR[env].dot)} aria-hidden="true" />
                    {ENVIRONMENT_LABEL[env]}
                  </Link>
                );
              })}
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {businesses.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No businesses yet.</p>
        ) : (
          orderedBusinesses.map((business) => {
            const isPinned = pinnedIds.includes(business.id);
            return (
              <DropdownMenuItem key={business.id} asChild>
                <Link
                  href={businessHref(business.id)}
                  className={cn(
                    "flex items-center justify-between gap-2",
                    business.id === activeBusinessId && "font-medium",
                  )}
                >
                  <BusinessLogo business={business} className="text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{business.name}</span>
                    {business.description ? (
                      <span className="block truncate text-xs font-normal text-muted-foreground">{business.description}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {business.roleName ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{business.roleName}</span>
                    ) : null}
                    {business.id === activeBusinessId ? (
                      <Check className="size-4 text-primary" aria-hidden="true" />
                    ) : null}
                    <button
                      type="button"
                      aria-label={isPinned ? `Unpin ${business.name}` : `Pin ${business.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePin(business.id);
                      }}
                      className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pin className={cn("size-3.5", isPinned && "fill-current text-primary")} aria-hidden="true" />
                    </button>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-primary">
          <Link href="/dashboard/organizations">
            <Settings2 className="size-4" aria-hidden="true" />
            Manage organizations
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

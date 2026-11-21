"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { WonderArkLogo } from "@cofounderai/core/shell/wonderark-logo";
import { Badge } from "@cofounderai/core/ui/badge";
import { cn } from "@cofounderai/core/lib/utils";
import { PLATFORM_NAV_GROUPS } from "./platform-nav";
import { signOut } from "../(auth)/actions";

/**
 * PLATFORM-P0-19.1 ("Dedicated Admin Layout", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §33) -- the real sidebar shell the doc's own §33 mockup asks for, replacing
 * the one-line `NAV_LINKS` text strip `platform/layout.tsx` carried since PLATFORM-P0-01
 * (that file's own comment always flagged it as a stopgap ahead of this story). Split out
 * of `layout.tsx` into its own client component because active-route highlighting needs
 * `usePathname()` and the mobile drawer needs local toggle state -- `layout.tsx` itself
 * stays a server component so `requireSuperadmin()`/`createClient()` (the actual
 * authorization boundary) are completely untouched, just handed down as props instead of
 * rendered inline.
 *
 * Desktop (`md:` and up): a fixed-width left sidebar, grouped headings, always expanded
 * (10 groups covering all ~18 routes -- collapsing them buys nothing at this size per
 * CLAUDE.md development principle #1, "prefer the simplest implementation that works").
 * Mobile (below `md:`): the sidebar becomes a slide-in drawer behind a hamburger button in
 * the header, closed by default, closing on backdrop click or link click -- same "compact
 * navigation on small screens" spirit as CLAUDE.md principle #12 applies to tables, and
 * PLATFORM-P0-19.4's own "stacked cards and progressive disclosure on smaller screens".
 *
 * PLATFORM-P0-19.5 ("Professional Layout Rule", §33) -- verified 2026-09-26: the rule is a
 * standing, generic WonderArk development rule, not a per-page feature. It lives in
 * `docs/design/claude-ui-design-rules.md` (plan the hierarchy first, intentional borders,
 * deliberate action placement, editable rows, tables on desktop / cards on mobile) and is
 * made mandatory for every page by CLAUDE.md development principles #12 and #13 -- exactly
 * the "add it to the project's permanent generic development rules" the story asks for.
 * This shell and every /platform page are built to it.
 */
export function PlatformShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {/* The one shell that carried no mark at all. The header is dark in both
              themes, so the artwork is pinned to its light-fill variant rather than
              following the theme. */}
          <WonderArkLogo variant="mark-dark" size="md" decorative />
          <span className="text-sm font-semibold tracking-wide">{BRAND_NAME} Platform Administration</span>
          <Badge variant="destructive">SUPERADMIN</Badge>
        </div>
        {/* PLATFORM-P1-10.16: the console had no way out. A platform admin who signs in on
            the main address lands here, so their own business and sign-out are one tap away. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {userEmail ? <span className="text-zinc-400">{userEmail}</span> : null}
          {/* /go is a route that redirects to another address, not a page to render in place. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/go?to=business" className="font-medium text-zinc-200 underline-offset-4 hover:text-white hover:underline">
            Your business
          </a>
          <form action={signOut}>
            <button type="submit" className="font-medium text-zinc-200 underline-offset-4 hover:text-white hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop: a normal-flow, sticky sidebar -- never rendered below `md`, so it never
            needs to reason about the mobile drawer's open/closed state at all. */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 px-3 py-4 md:flex">
          <PlatformNav pathname={pathname} />
        </aside>

        {/* Mobile: an independent fixed-position drawer + backdrop, `md:hidden` so it never
            renders (regardless of transform state) once the desktop sidebar takes over --
            deliberately full viewport height (covers the header too) rather than trying to
            start exactly below the header's own rendered height, which varies by content
            and wrapping. */}
        {mobileNavOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
          />
        ) : null}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto border-r border-zinc-800 bg-zinc-900 px-3 py-4",
            "transition-transform duration-200 ease-out md:hidden",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <PlatformNav pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function matchesLink(pathname: string, href: string): boolean {
  if (href === "/platform") {
    return pathname === "/platform";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Only the most specific matching link is active, so "/platform/billing" (Overview)
 * doesn't also light up while a nested "/platform/billing/payments" is open. */
function isLinkActive(pathname: string, href: string): boolean {
  if (!matchesLink(pathname, href)) return false;
  return !PLATFORM_NAV_GROUPS.some((group) =>
    group.links.some((other) => other.href.length > href.length && matchesLink(pathname, other.href)),
  );
}

function PlatformNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5 text-sm">
      {PLATFORM_NAV_GROUPS.map((group) => (
        <div key={group.label ?? "root"} className="flex flex-col gap-1">
          {group.label ? (
            <span className="px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</span>
          ) : null}
          {group.links.map((link) => {
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1.5 transition-colors",
                  active
                    ? "bg-zinc-800 font-medium text-zinc-50"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

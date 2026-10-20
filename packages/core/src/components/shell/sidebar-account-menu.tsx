"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronsUpDown, CreditCard, LifeBuoy, LogOut, Shield, ShieldCheck, SunMoon, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, avatarToneClass } from "../ui/avatar";
import { SubmitButton } from "../ui/submit-button";
import { useDismiss } from "../../hooks/use-dismiss";
import { cn } from "../../lib/utils";
import type { ShellUser } from "./types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Account switcher pinned to the very bottom of the drawer -- ported from co-founder-ai's
 * components/tenancy/sidebar-account-menu.tsx (docs/PORT-PROVENANCE.md). The menu opens
 * upward above its own trigger row since there's no room below it. Links go to the
 * platform's own already-ported settings routes (apps/web/app/(dashboard)/dashboard/
 * settings/*), not co-founder-ai's.
 */
export function SidebarAccountMenu({
  user,
  onSignOut,
  onNavigate,
}: {
  user: ShellUser;
  onSignOut?: () => void;
  /** Also closes the drawer itself when a menu item navigates. */
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismiss(containerRef, open, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative border-t border-sidebar-border">
      {open ? (
        <div
          role="menu"
          className="absolute inset-x-2 bottom-full mb-2 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>

          <div className="my-1 border-t" />

          <Link
            href="/dashboard/settings/profile"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <User className="size-4 text-muted-foreground" aria-hidden="true" />
            Profile
          </Link>

          <Link
            href="/dashboard/settings/usage"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <BarChart3 className="size-4 text-muted-foreground" aria-hidden="true" />
            Usage
          </Link>

          <Link
            href="/dashboard/settings/billing"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
            Billing
          </Link>

          <Link
            href="/dashboard/settings/appearance"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <SunMoon className="size-4 text-muted-foreground" aria-hidden="true" />
            Appearance
          </Link>

          {/* Admin (the cross-business configuration list at /dashboard/settings) lives
              here rather than in the rail: it is account-level, not one of the
              per-business modules the rail navigates. */}
          <Link
            href="/dashboard/settings"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <Shield className="size-4 text-muted-foreground" aria-hidden="true" />
            Admin
          </Link>

          {/* Labelled for what it actually is rather than "Admin" a second time -- this
              is the env-gated platform tool at /dashboard/admin, whose own page is
              titled "Demo data", not the Admin row above it. */}
          {user.isPlatformAdmin ? (
            <Link
              href="/dashboard/admin"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
              className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
            >
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
              Demo data
            </Link>
          ) : null}

          <div className="my-1 border-t" />

          {/* Help sits below the divider with sign-out rather than among the settings
              rows: it is not a thing you configure, and someone hunting for it is
              usually stuck, so it reads faster on its own. */}
          <Link
            href="/help"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <LifeBuoy className="size-4 text-muted-foreground" aria-hidden="true" />
            Get Help
          </Link>

          <div className="my-1 border-t" />

          <form action={onSignOut ? async () => onSignOut() : undefined}>
            <SubmitButton
              variant="ghost"
              pendingText="Signing out..."
              className="w-full justify-start gap-2 px-3 font-normal"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Log Out
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-sidebar-accent"
      >
        <Avatar className="size-8">
          <AvatarImage src={user.avatarUrl} alt="" />
          <AvatarFallback className={cn("text-xs", avatarToneClass(user.email || user.name))}>
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">
            {user.name}
          </span>
          <span className="block truncate text-[11px] text-sidebar-muted">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-sidebar-muted" aria-hidden="true" />
      </button>
    </div>
  );
}

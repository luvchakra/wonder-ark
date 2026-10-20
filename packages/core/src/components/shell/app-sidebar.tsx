"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppPathname } from "./org-address-context";
import { ChevronDown, Lock, Plus, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { BRAND_NAME } from "../../lib/brand";
import { isPromiseLike } from "../../lib/promise-like";
import {
  isNavGroupExpanded,
  navGroupKey,
  readNavGroupFolds,
  toggleNavGroup,
  writeNavGroupFolds,
} from "../../lib/nav-group-folds";
import type { NavGroupFolds } from "../../lib/nav-group-folds";
import { SELECTED_MODULE_STORAGE_KEY as MODULE_STORAGE_KEY } from "../../lib/module-selection";
import { buildDiscoveryNav, offeringIdFromPath } from "../../lib/discovery-nav";
import { readOfferingFocus, writeOfferingFocus, type OfferingFocus } from "../../lib/offering-focus";
import { useSidebar } from "./sidebar-context";
import { SidebarAccountMenu } from "./sidebar-account-menu";
import { WonderArkLogo } from "./wonderark-logo";
import { ModuleAppIcon, ModuleIcon } from "./module-icon";
import type { ShellBusiness, ShellNavModule, ShellProduct, ShellUser } from "./types";

/**
 * Infers the active module from the URL for the routes that unambiguously indicate one
 * (/[businessSlug]/inventory/... and /[businessSlug]/finance/...) -- everything else
 * (bare business page, discovery's own /discovery/... routes, non-module pages like
 * settings) returns null so the caller falls back to the last explicitly opened section.
 * Written locally rather than reusing module-discovery's `getActiveIdsFromPath` since
 * `packages/core` cannot depend on any module (lint:boundaries).
 *
 * The bare account-level /dashboard and /platform control-plane paths are excluded up
 * front: unlike the business-scoped shape below, they have no module section as their
 * *second* segment at all -- without this guard, "/dashboard" itself would parse as
 * segment[0]="dashboard" with no section, which the empty-section branch below would
 * misread as "discovery" (the same shape a bare business page like "/acme-hvac" has).
 */
export function inferModuleFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/platform")) return null;
  const match = pathname.match(/^\/[^/]+(?:\/([^/]+))?/);
  if (!match) return null;
  const section = match[1];
  if (section === "inventory") return "inventory";
  // E2E-DEF-009: Service and CRM were missing here, so their pages never opened their
  // own section from the URL. "fsm" is Service's historical URL segment.
  if (section === "service" || section === "fsm") return "fsm";
  if (section === "crm") return "crm";
  // "finance" is the current URL segment; "compliance" and "gst" are the two historical
  // spellings the proxy still redirects from, recognised here so the rail highlights the
  // right module during that redirect rather than flickering to the default.
  if (section === "finance" || section === "compliance" || section === "gst") return "gst";
  if (!section || section === "discovery" || section === "business") return "discovery";
  return null;
}

function readStoredModule(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(MODULE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredModule(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODULE_STORAGE_KEY, key);
  } catch {
    // Storage unavailable (private browsing, quota) -- selection just won't persist.
  }
}

/** A leaf row in the rail: the module sub-items, and the account-level shortcuts under
 * them. Indented under its module header, muted until it's the current page. */
function NavLink({
  href,
  label,
  icon,
  isActive,
  onNavigate,
  indent,
}: {
  href: string;
  label: string;
  icon?: string;
  isActive: boolean;
  onNavigate: () => void;
  indent?: boolean;
}) {
  // A deep link can open a section far down the rail (Funding's items sit below three
  // other sections); bring the current page's row into view so the founder sees where
  // they are without scrolling the rail themselves (spec §3.5).
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [isActive]);
  return (
    <Link
      ref={ref}
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 truncate rounded-lg px-3 py-2 text-sm transition-colors",
        indent && "ml-5.5 border-l border-sidebar-border pl-4",
        isActive
          ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      {icon ? <ModuleIcon name={icon} className="size-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

/** The AI-credits meter at the foot of the rail. Its number needs two queries nothing
 * else in the shell needs (this month's ai_runs, and whether a BYOK key is connected),
 * so the layout hands it over as a promise and this resolves it behind its own Suspense
 * boundary -- the rail paints and is usable before it lands. A plain number is still
 * accepted for callers that already have one. */
function CreditsMeter({
  credits,
  onNavigate,
}: {
  credits: number | Promise<number | undefined> | undefined;
  onNavigate: () => void;
}) {
  const percent = isPromiseLike(credits) ? use(credits) : credits;
  if (percent === undefined) return null;
  return (
    <Link
      href="/dashboard/settings/usage"
      onClick={onNavigate}
      className="mx-3 mb-3 flex flex-col gap-1.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-sidebar-accent"
    >
      <div className="flex items-center justify-between text-xs text-sidebar-muted">
        <span>AI Usage</span>
        <span className="font-medium text-sidebar-foreground">{percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-accent">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            percent >= 100 ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </Link>
  );
}

/** A titled section inside an expanded module ("Overview", "Catalog & Inventory",
 * "Sales"...), on the same rules as the module rows above it: click the heading to open
 * or shut it, and the choice persists.
 *
 * Sections start shut. Inventory alone is five sections and ~15 links, so opening a
 * module with everything unfolded fills more than a phone screen and pushes the modules
 * below it out of reach -- the founder opens the one section they want instead.
 *
 * A group with no heading has nothing to click, so it renders its items bare. */
function NavGroup({
  heading,
  collapsed,
  onToggle,
  children,
}: {
  heading?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!heading) return <div className="flex flex-col gap-0.5">{children}</div>;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="mt-2 ml-8 flex items-center gap-1 rounded-md py-1 text-left text-xs font-medium text-sidebar-muted transition-colors hover:text-sidebar-foreground"
      >
        <ChevronDown
          className={cn("size-3 shrink-0 transition-transform", collapsed && "-rotate-90")}
          aria-hidden="true"
        />
        <span className="min-w-0 truncate">{heading}</span>
      </button>
      {collapsed ? null : children}
    </div>
  );
}

/** The expanded module's own sub-navigation. Discovery is the one module whose real
 * content is live data (this business's offerings) rather than a static manifest tree,
 * so it renders its own shape; every other module renders its manifest nav groups. */
function ModuleNav({
  module,
  pathname,
  businessId,
  businessHref,
  productsByBusiness,
  rememberedOfferingId,
  onCreateBusiness,
  onNavigate,
  hasBusinesses,
  isGroupExpanded,
  onToggleGroup,
}: {
  module: ShellNavModule;
  pathname: string | null;
  businessId: string | null;
  businessHref: (businessId: string) => string;
  productsByBusiness?: Record<string, ShellProduct[]>;
  /** DISC-OFFER-P0-03.1: the offering this business was last worked in. */
  rememberedOfferingId?: string;
  onCreateBusiness?: () => void;
  onNavigate: () => void;
  hasBusinesses: boolean;
  /** `holdsActive` is the default for a section the founder has never touched: open
   * when it holds the page they're on, folded otherwise -- see lib/nav-group-folds.ts. */
  isGroupExpanded: (heading: string, holdsActive: boolean) => boolean;
  onToggleGroup: (heading: string, holdsActive: boolean) => void;
}) {
  if (!hasBusinesses || !businessId) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <p className="text-sm text-sidebar-muted">No businesses yet.</p>
        <button
          type="button"
          onClick={onCreateBusiness}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Create a business
        </button>
      </div>
    );
  }

  const base = businessHref(businessId);

  if (module.key === "discovery") {
    // DISC-NAV-01..05: Overview, Business, then the four expandable sections -- see
    // lib/discovery-nav.ts for the tree and its active-route rules. Each section uses the
    // same fold mechanism (and storage) as every other module's sections (§3.4).
    const tree = buildDiscoveryNav(base, productsByBusiness?.[businessId] ?? [], pathname, rememberedOfferingId);
    return (
      <div className="flex flex-col gap-0.5">
        {tree.top.map((link) => (
          <NavLink
            key={link.id}
            href={link.href}
            label={link.label}
            icon={link.icon}
            isActive={link.active}
            onNavigate={onNavigate}
            indent
          />
        ))}
        {tree.groups.map((group) => (
          <NavGroup
            key={group.id}
            heading={group.heading}
            collapsed={!isGroupExpanded(group.id, group.holdsActive)}
            onToggle={() => onToggleGroup(group.id, group.holdsActive)}
          >
            {group.items.length === 0 ? (
              <p className="ml-7 py-1.5 text-sm text-sidebar-muted">{group.emptyMessage}</p>
            ) : (
              group.items.map((link) => (
                <NavLink
                  key={link.id}
                  href={link.href}
                  label={link.label}
                  isActive={link.active}
                  onNavigate={onNavigate}
                  indent
                />
              ))
            )}
          </NavGroup>
        ))}
      </div>
    );
  }

  if (module.nav.length === 0) {
    return <p className="px-3 py-2.5 text-sm text-sidebar-muted">Not available yet.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {module.nav.map((group, groupIndex) => {
        const items = group.items.map((item) => ({
          ...item,
          href: item.slug ? `${base}${module.routePrefix}/${item.slug}` : `${base}${module.routePrefix}`,
        }));
        // Folding the section that holds the page you're on would hide where you are, so
        // that one starts open (until the founder folds it themselves).
        const holdsActive = items.some((item) => item.href === pathname);
        return (
          <NavGroup
            key={group.heading ?? groupIndex}
            heading={group.heading}
            collapsed={group.heading ? !isGroupExpanded(group.heading, holdsActive) : false}
            onToggle={() => group.heading && onToggleGroup(group.heading, holdsActive)}
          >
            {items.map((item) => (
              <NavLink
                key={item.slug || "root"}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={pathname === item.href}
                onNavigate={onNavigate}
                indent
              />
            ))}
          </NavGroup>
        );
      })}
    </div>
  );
}

/**
 * The platform's primary navigation: a persistent dark rail on desktop, the same rail as
 * a slide-over drawer below `lg` (docs/DESIGN.md). Every module the account can see is
 * listed at once, with the current one expanded to its own sub-navigation -- so the
 * founder can always tell both where they are and what else the platform does, which the
 * previous one-module-at-a-time drawer could not show.
 *
 * Unlicensed modules stay listed (with a lock) rather than disappearing: clicking one
 * routes to that business's not-licensed page, which is where a founder can actually
 * activate it, instead of the module silently not existing at all.
 */
export function AppSidebar({
  modules,
  businesses,
  activeBusinessId,
  businessHref,
  productsByBusiness,
  creditsUsedPercent,
  onCreateBusiness,
  user,
  onSignOut,
}: {
  modules: ShellNavModule[];
  businesses: ShellBusiness[];
  activeBusinessId?: string | null;
  businessHref: (businessId: string) => string;
  /** This business's discovery products, keyed by business id -- shown under the
   * Discovery section for whichever business is currently active. */
  productsByBusiness?: Record<string, ShellProduct[]>;
  /** % of AI credits used this month, blended across every workspace on the account --
   * or a promise of it, resolved behind the meter's own Suspense boundary so the rail
   * never waits on the usage queries. */
  creditsUsedPercent?: number | Promise<number | undefined>;
  onCreateBusiness?: () => void;
  user: ShellUser;
  onSignOut?: () => void;
}) {
  const { open, setOpen } = useSidebar();
  const router = useRouter();
  const pathname = useAppPathname();

  // Navigations inside the rail are client-side transitions (<Link>): the shell stays
  // mounted and only the page segment is fetched, which is what makes a click feel
  // instant. A full reload (new tab, refresh, a bookmark) still remounts this component,
  // so which section is open is derived from two sources, preferred in order: what the
  // URL itself indicates (most reliable, since it's exactly where the founder ended up),
  // then the last section they opened by hand, stashed in localStorage for pages whose
  // URL doesn't indicate a module (bare /dashboard, settings, etc).
  //
  // E2E-DEF-009: the initializer must not read localStorage -- the server can't, so a
  // stored choice made the first client render differ from the server HTML and React
  // threw the whole dashboard tree away (hydration error #418) on every page whose URL
  // doesn't name a module. The stored choice is applied on mount instead, below, the same
  // way groupFolds already is.
  const [expandedModule, setExpandedModule] = useState<string | null>(() => {
    const fromUrl = inferModuleFromPath(pathname);
    if (fromUrl && modules.some((m) => m.key === fromUrl && m.licensed)) return fromUrl;
    return modules.find((m) => m.licensed)?.key ?? null;
  });
  useEffect(() => {
    if (inferModuleFromPath(pathname)) return; // the URL already decided
    const stored = readStoredModule();
    if (stored && modules.some((m) => m.key === stored && m.licensed)) setExpandedModule(stored);
    // Mount only: later navigations are handled by the pathname effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side navigations (e.g. a <Link> elsewhere on the page) don't remount this
  // component, so re-derive from the URL whenever it changes too -- keeps the open
  // section in sync without waiting for the next full reload.
  useEffect(() => {
    const fromUrl = inferModuleFromPath(pathname);
    if (fromUrl && modules.some((m) => m.key === fromUrl && m.licensed)) {
      setExpandedModule(fromUrl);
      writeStoredModule(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Read on mount rather than in a useState initializer: the rail renders on the server
  // too, where localStorage doesn't exist, and seeding from it during the first client
  // render would hydrate a different tree than the server sent. Starting empty is the
  // correct first paint either way: with no stored choices every section falls back to
  // its default, which derives from the URL and so is identical on both sides.
  const [groupFolds, setGroupFolds] = useState<NavGroupFolds>({});
  useEffect(() => {
    setGroupFolds(readNavGroupFolds());
  }, []);

  function isGroupExpanded(moduleKey: string, heading: string, holdsActive: boolean) {
    return isNavGroupExpanded(groupFolds, navGroupKey(moduleKey, heading), holdsActive);
  }

  function toggleGroup(moduleKey: string, heading: string, holdsActive: boolean) {
    setGroupFolds((prev) => {
      const next = toggleNavGroup(prev, navGroupKey(moduleKey, heading), holdsActive);
      writeNavGroupFolds(next);
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  // "Selected in the switcher" with a fallback to the first business, per the explicit
  // ask -- the rail's module content always has *a* business to work from as long as one
  // exists, even before the founder has navigated into any business yet.
  const effectiveBusinessId = activeBusinessId ?? businesses[0]?.id ?? null;
  const closeDrawer = () => setOpen(false);

  // DISC-OFFER-P0-03.1: remember the offering last worked in, per business, so Customer
  // Acquisition stays on it from pages that name no offering. Read on mount for the same
  // hydration reason as the folds above; written whenever the URL names an offering.
  const [offeringFocus, setOfferingFocus] = useState<OfferingFocus>({});
  useEffect(() => {
    setOfferingFocus(readOfferingFocus());
  }, []);
  useEffect(() => {
    if (!effectiveBusinessId) return;
    const offeringId = offeringIdFromPath(businessHref(effectiveBusinessId), pathname);
    if (!offeringId || !productsByBusiness?.[effectiveBusinessId]?.some((p) => p.id === offeringId)) return;
    setOfferingFocus((prev) => {
      if (prev[effectiveBusinessId] === offeringId) return prev;
      const next = { ...readOfferingFocus(), ...prev, [effectiveBusinessId]: offeringId };
      writeOfferingFocus(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, effectiveBusinessId]);

  function handleModuleClick(module: ShellNavModule) {
    // Every module is listed regardless of entitlement -- an unlicensed one routes
    // straight to that business's own not-licensed page (the same one the proxy's route
    // guard already rewrites direct URL access to) rather than expanding to nav it can't
    // actually open, so clicking a module the business doesn't have surfaces "activate
    // this" instead of either not existing or silently doing nothing.
    if (!module.licensed) {
      if (effectiveBusinessId) {
        setOpen(false);
        router.push(`${businessHref(effectiveBusinessId)}/not-licensed?module=${module.key}`);
      }
      return;
    }
    const next = expandedModule === module.key ? null : module.key;
    setExpandedModule(next);
    if (next) writeStoredModule(next);
  }

  const isExecutiveActive = pathname === "/dashboard";

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      ) : null}

      <nav
        aria-label="Main"
        className={cn(
          // `invisible` (not just the off-screen transform) when the drawer is closed:
          // a translated-but-visible rail keeps its links in the tab order and the
          // accessibility tree, so a keyboard or screen-reader user would traverse a
          // whole navigation they can't see. The `lg:` variants win over both, so from
          // `lg` up the rail is simply always on screen.
          // `lg:top-…`: the install banner (apps/web, BRAND-13) sets --install-banner-offset
          // while it is on screen, so the permanent rail starts below it, never over it.
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:visible lg:top-[var(--install-banner-offset,0px)] lg:translate-x-0 print:hidden",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close sidebar"
          className="absolute top-3 right-3 z-10 rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-90 lg:hidden"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <Link
          href="/dashboard"
          onClick={closeDrawer}
          aria-label={BRAND_NAME}
          className="flex shrink-0 items-center gap-2.5 px-5 py-5"
        >
          {/* The rail is brand navy in both themes, so the mark is the one from the board's
              "Logo on dark" panel rather than following the theme. Beside it the name is live
              text -- the application-shell treatment the branding QA corrections (§3, §9)
              specify: "Wonder" white, "Ark" brand blue, in the brand typeface. */}
          <WonderArkLogo variant="mark-dark" size="md" decorative priority />
          <span className="min-w-0 truncate text-lg font-bold tracking-tight text-white">
            {BRAND_NAME === "WonderArk" ? (
              <>
                Wonder<span className="text-brand-blue">Ark</span>
              </>
            ) : (
              BRAND_NAME
            )}
          </span>
        </Link>

        {/* The account-wide view, above the per-business modules and deliberately not
            styled like them: it is the one destination in the rail that isn't scoped to
            the business selected in the topbar, so it reads as a bordered row of its own
            rather than another item in the module list. */}
        <Link
          href="/dashboard"
          onClick={closeDrawer}
          aria-current={isExecutiveActive ? "page" : undefined}
          className={cn(
            "mx-3 mb-2 flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
            isExecutiveActive
              ? "border-transparent bg-sidebar-primary text-sidebar-primary-foreground"
              : "border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/60",
          )}
        >
          <ModuleIcon name="LayoutGrid" className="size-4.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Executive Dashboard</span>
        </Link>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {modules.map((module) => {
            const isExpanded = module.licensed && expandedModule === module.key;
            return (
              <div key={module.key} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => handleModuleClick(module)}
                  aria-expanded={module.licensed ? isExpanded : undefined}
                  title={module.licensed ? undefined : `${module.name} isn't licensed for this business`}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    isExpanded
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <ModuleAppIcon
                    moduleKey={module.key}
                    name={module.icon}
                    className={module.licensed ? undefined : "opacity-40 grayscale"}
                  />
                  <span className="min-w-0 flex-1 truncate">{module.name}</span>
                  {!module.licensed ? (
                    <Lock className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  ) : (
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        isExpanded ? "rotate-0" : "-rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </button>
                {isExpanded ? (
                  <ModuleNav
                    module={module}
                    pathname={pathname}
                    businessId={effectiveBusinessId}
                    businessHref={businessHref}
                    productsByBusiness={productsByBusiness}
                    rememberedOfferingId={effectiveBusinessId ? offeringFocus[effectiveBusinessId] : undefined}
                    onCreateBusiness={onCreateBusiness}
                    onNavigate={closeDrawer}
                    hasBusinesses={businesses.length > 0}
                    isGroupExpanded={(heading, holdsActive) =>
                      isGroupExpanded(module.key, heading, holdsActive)
                    }
                    onToggleGroup={(heading, holdsActive) =>
                      toggleGroup(module.key, heading, holdsActive)
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <Suspense fallback={null}>
          <CreditsMeter credits={creditsUsedPercent} onNavigate={closeDrawer} />
        </Suspense>

        <SidebarAccountMenu user={user} onSignOut={onSignOut} onNavigate={closeDrawer} />
      </nav>
    </>
  );
}

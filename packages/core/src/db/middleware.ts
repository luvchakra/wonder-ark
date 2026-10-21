import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { helpReturnPath, isHelpPath } from "../help/access";
import { moduleRegistry } from "@cofounderai/module-registry";
import { MODULE_VIEW_PERMISSION } from "../rbac/module-permissions";
import {
  APP_TOP_SEGMENTS,
  baseAppHost,
  orgAddressRequired,
  orgInternalPath,
  orgUrl,
  orgVisiblePath,
  parseHost,
} from "../lib/org-address";
import { lookUpOrgHost } from "./org-host-lookup";

/** PLATFORM-P1-10.3: the last organization address a signed-in person used, shared across
 * the base domain (it holds only a slug) so the main address can send them back to it. */
export const LAST_ORG_COOKIE_NAME = "wa_last_org";

/** Every static path the app owns at the top level -- a business's own slug
 * (core.business_settings.slug) can never collide with one of these, since this is
 * exactly how a business-scoped route is told apart from a static one below: not by a
 * fixed prefix (there is no more "/dashboard/businesses/" marking one), but by whether
 * the URL's first segment is anything OTHER than one of these. Mirrors the CHECK
 * constraint on core.business_settings.slug (supabase/migrations/20260913740000_*) and
 * packages/core/src/businesses/slug.ts's RESERVED_BUSINESS_SLUGS -- kept in sync by hand
 * (three call sites, not worth a shared runtime import across a migration/an edge
 * middleware/a server-only module for one small constant list). */
const RESERVED_TOP_SEGMENTS = new Set([
  "dashboard",
  "platform",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "onboarding",
  "auth",
  "api",
  "p",
  "help",
  // The public legal and pricing pages (reserved as business slugs too, in
  // supabase/migrations/20260926090000), and the two crawler files a search engine
  // fetches before anything else. Neither file name can ever be a slug -- the slug format
  // allows no dots -- so they need no database counterpart; they are here only so an
  // anonymous crawler is served them instead of being sent to /login.
  "terms",
  "privacy",
  "pricing",
  // RBAC-27: invitation acceptance (apps/web/app/invite/[token]) -- self-gated, since a
  // brand-new invitee arrives signed out.
  "invite",
  // PLATFORM-P1-09.4: the policy acceptance prompt (apps/web/app/legal/accept) -- self-gated.
  "legal",
  // PLATFORM-P1-13.1: the public Careers pages (apps/web/app/(site)/careers), reserved as a
  // business slug in 20261021100000. Main address only -- not in org-address.ts's
  // APP_TOP_SEGMENTS, so an organization's own address never serves them.
  "careers",
  "robots.txt",
  "sitemap.xml",
  // BRAND-06: the web app manifest (apps/web/app/manifest.ts). Browsers fetch it without
  // credentials, so it must never bounce to /login.
  "manifest.webmanifest",
  // PLATFORM-P1-10.1/10.3: the main address's hand-off to an organization's address, and the
  // pages an address answers with when nothing (or nothing reachable) lives there.
  "go",
  "organization-not-found",
  "organization-paused",
  "service-unavailable",
]);
const AUTH_PATHS = new Set(["/login", "/signup"]);

/** `/dashboard` is the account-level customer app (Executive Dashboard, settings,
 * the env-var-gated admin tool) and `/platform` (PLATFORM-P0-01.2, "every /platform/*
 * route... must independently verify authenticated user AND platform-level
 * authorization") is the WonderArk control plane -- both are always protected,
 * regardless of what follows. Every other path is protected exactly when its first
 * segment isn't one of the app's own static top-level routes (`RESERVED_TOP_SEGMENTS`)
 * -- i.e. it's presumed to be a business's own slug
 * (apps/web/app/(dashboard)/[businessSlug]/...), which is always behind auth. `/login`,
 * `/signup`, `/onboarding`, `/auth/callback`, `/api/*`, the public `/p/*` portal, the
 * public `/terms`, `/privacy` and `/pricing` pages are each self-gated at the page/route level (see e.g.
 * apps/web/app/onboarding/page.tsx's own redirect) rather than here, same as before this
 * function grew a business-slug case at all.
 *
 * `/help` is signed-in only (2026-10-16): the guides describe the product to its users,
 * and a signed-out visitor is sent to sign-in and brought back (core/help/access.ts). The
 * pages check the session themselves too. "help" stays in RESERVED_TOP_SEGMENTS so it is
 * never read as a business slug. */
export function isProtectedPath(pathname: string): boolean {
  if (pathname === "/") return false;
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/platform")) return true;
  if (isHelpPath(pathname)) return true;
  const firstSegment = pathname.split("/")[1];
  if (!firstSegment || RESERVED_TOP_SEGMENTS.has(firstSegment)) return false;
  return true;
}

/** The legacy /dashboard/businesses/[id]/... shape, kept recognizable (not deleted
 * outright) so every bookmark, saved link, or stale in-app href built before this
 * routing change keeps working: `updateSession()` below 308-redirects it to the
 * equivalent /[businessSlug]/... URL rather than 404ing on it. Captures the id and
 * everything after it separately so the redirect can preserve the rest of the path
 * (module, sub-page, etc.) unchanged. */
const LEGACY_BUSINESS_PATH = /^\/dashboard\/businesses\/([^/]+)((?:\/.*)?)$/;

/** DISC-OFFER: the discovery module's offering routes moved from /[businessSlug]/
 * products/... to /[businessSlug]/discovery/offerings/..., alongside its module
 * dashboard moving from the bare /[businessSlug] to /[businessSlug]/discovery/dashboard
 * (matching every other module's own "<module>/dashboard" shape). Both are pure path
 * rewrites -- no id/slug lookup needed, unlike `LEGACY_BUSINESS_PATH` above -- so they're
 * handled with plain string replacement in `updateSession()` rather than a DB round trip. */
const LEGACY_PRODUCTS_PATH = /^\/([^/]+)\/products(\/.*)?$/;

/** FSM's own route prefix moved from /[businessSlug]/fsm/... to /[businessSlug]/service/...
 * (the module key/schema/package stay "fsm" -- ADR/CLAUDE.md non-negotiables, only the
 * URL segment changes, matching `name: "Service"` the module already used everywhere
 * else). Same pure-rewrite shape as `LEGACY_PRODUCTS_PATH` above: no id/slug lookup
 * needed, just the segment swap, so any link or bookmark still carrying /fsm/ keeps
 * working instead of 404ing. */
const LEGACY_FSM_PATH = /^\/([^/]+)\/fsm(\/.*)?$/;

/** This module's route prefix has moved twice: /[businessSlug]/gst/... became
 * /compliance/..., which is now /finance/... -- same reasoning and same pure-rewrite
 * shape as `LEGACY_FSM_PATH` right above. The module key, schema and package all stay
 * "gst" (CLAUDE.md non-negotiables); only the URL segment and the display name change,
 * the latter now `name: "Finance"` in module-registry. Both old spellings are kept so
 * every bookmark, saved link and stale in-app href still resolves. */
const LEGACY_GST_PATH = /^\/([^/]+)\/gst(\/.*)?$/;
const LEGACY_COMPLIANCE_PATH = /^\/([^/]+)\/compliance(\/.*)?$/;

/** Business slug embedded in the URL -- the first path segment, once `isProtectedPath`
 * has already ruled out every static top-level route it could otherwise be. Kept as its
 * own function (rather than inlined into the business-scoped regex below) for the same
 * reason it always was: testable in isolation, and every call site updates in one place
 * if the shape ever changes again. */
export function activeBusinessSlugFromPath(pathname: string): string | null {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/platform")) return null;
  const firstSegment = pathname.match(/^\/([^/]+)/)?.[1];
  if (!firstSegment || RESERVED_TOP_SEGMENTS.has(firstSegment)) return null;
  return firstSegment;
}

/**
 * The current URL for a pre-rename module path -- `/<slug>/products/...` (now
 * discovery/offerings), `/<slug>/fsm/...` (now service), `/<slug>/gst/...` and
 * `/<slug>/compliance/...` (now finance) -- or null when `pathname` isn't one.
 *
 * E2E-DEF-004: only a business-scoped path qualifies. The patterns used to be matched
 * against any first segment, so `/platform/compliance` (the Platform Admin compliance
 * registry, PLATFORM-P0-12) was 308'd to a nonexistent `/platform/finance` and 404'd for
 * every superadmin -- "platform" read as if it were a business slug.
 */
export function legacyModuleRedirectPath(pathname: string): string | null {
  if (!activeBusinessSlugFromPath(pathname)) return null;
  const products = pathname.match(LEGACY_PRODUCTS_PATH);
  if (products) return `/${products[1]}/discovery/offerings${products[2] ?? ""}`;
  const fsm = pathname.match(LEGACY_FSM_PATH);
  if (fsm) return `/${fsm[1]}/service${fsm[2] ?? ""}`;
  const gst = pathname.match(LEGACY_GST_PATH) ?? pathname.match(LEGACY_COMPLIANCE_PATH);
  if (gst) return `/${gst[1]}/finance${gst[2] ?? ""}`;
  return null;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Which module (if any) `pathname` belongs to -- independent of licensing or the
 * platform-wide kill switch, just route-shape matching against the real
 * /[businessSlug]/<prefix>/... shape (module-registry's own routePrefix docstring's
 * target, now the only shape that exists -- the legacy /dashboard/businesses/[id]/...
 * shape never reaches this function, since `updateSession()` redirects it to the new
 * shape first). Factored out of `findUnlicensedModuleForRoute()` (PLATFORM-P0-07.2) so
 * `findPlatformDisabledModuleForRoute()` below can share the exact same route-matching
 * logic instead of re-deriving it. */
function moduleForRoute(pathname: string): (typeof moduleRegistry)[number] | null {
  for (const module of moduleRegistry) {
    const prefix = escapeForRegex(module.routePrefix);
    const businessScoped = new RegExp(`^/[^/]+${prefix}(?:/|$)`);
    if (businessScoped.test(pathname)) return module;
  }
  return null;
}

/**
 * The key of the module `pathname` belongs to, if the active business hasn't licensed
 * it -- null otherwise. CLAUDE.md's architecture section lists this route guard as one
 * of licensing's four required enforcement layers (RLS, this, requireModule(), UI
 * filtered by entitlements).
 *
 * Returns the module key (not just a boolean) since 2026-09-09 -- the caller renders an
 * informative "not licensed" page naming the module and the reason, rather than a bare
 * 404 (docs/testing/test-cases/menu-smoke.md's TC-MENU-LIC-001/002, refined to spec this
 * exact page instead of the "undefined behavior" this route guard previously left it at).
 */
export function findUnlicensedModuleForRoute(pathname: string, licensedModules: Set<string>): string | null {
  const module = moduleForRoute(pathname);
  if (module && !licensedModules.has(module.key)) return module.key;
  return null;
}

/** Back-compat boolean form of `findUnlicensedModuleForRoute()` -- kept for
 * `middleware.test.ts`'s existing cases and any other caller that only needs the
 * yes/no answer, not which module. */
export function isUnlicensedModuleRoute(pathname: string, licensedModules: Set<string>): boolean {
  return findUnlicensedModuleForRoute(pathname, licensedModules) !== null;
}

/**
 * PLATFORM-P0-07.2/07.3 -- the key of the module `pathname` belongs to, if a superadmin
 * has fully blocked it platform-wide (`platform.modules.status` is `disabled` OR
 * `maintenance` -- PLATFORM-P0-07.3 decision #3: the exact same full block, so both
 * populate `disabledModules` identically here) -- null otherwise. Deliberately
 * business-independent (unlike `findUnlicensedModuleForRoute()` above): a platform-wide
 * full block applies to every business regardless of that business's own license status,
 * so this check is not gated on the caller having any particular license at all. A
 * platform-wide `read_only` status is deliberately NOT included here (decision #2 --
 * mirrors a license's own grace period, which likewise never blocks the route itself,
 * only writes); it takes no route-guard action at all, the same way grace-period licenses
 * don't. Checked first in `updateSession()` below -- a platform-disabled module takes
 * priority over an ordinary licensing reason, since it is the more universal fact. */
export function findPlatformDisabledModuleForRoute(pathname: string, disabledModules: Set<string>): string | null {
  const module = moduleForRoute(pathname);
  if (module && disabledModules.has(module.key)) return module.key;
  return null;
}

/**
 * Refreshes the Supabase auth session cookie on every request and enforces the
 * authenticated/unauthenticated route boundary. Called from apps/web/proxy.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run any logic between createServerClient and getClaims() -- it is what
  // refreshes an expiring session cookie, and must not be skipped.
  //
  // getClaims() rather than getUser(): it verifies the access token's signature locally
  // against the project's public signing key (this project signs with ES256; the key set
  // is fetched once and cached for ten minutes per instance), where getUser() is a round
  // trip to the Auth server on *every* request -- ~200 ms from a function region on the
  // other side of the planet from the database, paid before a single byte of page
  // renders, for the anonymous marketing visitor too. The trade: a revoked session's
  // token stays valid until it expires (an hour at most) instead of dying on the next
  // request. Supabase's own guidance for server-side auth is this call, for this reason.
  //
  // PLATFORM-P1-10.1: on an organization's address, whether a business lives there is looked
  // up alongside (cached per label, existence only -- see org-host-lookup.ts).
  const base = baseAppHost();
  const host = parseHost(request.headers.get("host"), base);
  const [{ data: claims }, hostLookup] = await Promise.all([
    supabase.auth.getClaims(),
    host.kind === "organization" ? lookUpOrgHost(host.label) : Promise.resolve(null),
  ]);
  const user = claims?.claims ?? null;

  const { pathname } = request.nextUrl;

  // PLATFORM-P1-10.1: an address with no business answers 404, a failed lookup 503 -- never a
  // fallback to some other business. The host never authorizes: membership still does.
  let orgSlug: string | null = null;
  if (host.kind === "invalid" || host.kind === "organization") {
    if (host.kind === "invalid" || hostLookup !== "found") {
      const unavailable = hostLookup === "error";
      const status = unavailable ? 503 : 404;
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: unavailable ? "ORGANIZATION_LOOKUP_UNAVAILABLE" : "ORGANIZATION_NOT_FOUND" },
          { status },
        );
      }
      if (pathname.startsWith("/_next/") || pathname === "/organization-not-found" || pathname === "/service-unavailable") {
        return supabaseResponse;
      }
      const url = request.nextUrl.clone();
      url.pathname = unavailable ? "/service-unavailable" : "/organization-not-found";
      url.search = "";
      return NextResponse.rewrite(url, { status });
    }
    orgSlug = host.label;
    // The vendor console lives on the main address only.
    if (base && (pathname === "/platform" || pathname.startsWith("/platform/"))) {
      return NextResponse.redirect(new URL(`${request.nextUrl.protocol}//${base}${portSuffix(request)}${pathname}${request.nextUrl.search}`));
    }
    // Links built the path way (/acme/discovery) lead to the address-root form (/discovery).
    const visible = orgVisiblePath(pathname, orgSlug);
    if (visible) {
      const url = request.nextUrl.clone();
      url.pathname = visible;
      return NextResponse.redirect(url, 308);
    }
  }

  // PLATFORM-P1-10.3: with ORG_ADDRESS_REQUIRED the main address is the landing page only. An
  // organization's page asked for here goes to that organization's own address; a signed-in
  // person arriving at the front door is handed to /go, which picks their organization.
  const landingOnly = host.kind === "base" && orgAddressRequired();
  if (landingOnly && base) {
    const first = pathname.split("/")[1] ?? "";
    if (first && !APP_TOP_SEGMENTS.has(first) && !first.includes(".")) {
      const target = orgUrl(first, base, request.nextUrl.protocol.replace(":", ""), request.nextUrl.port || undefined);
      if (target) return NextResponse.redirect(new URL(`${target}${pathname.slice(first.length + 1) || "/"}${request.nextUrl.search}`), 307);
    }
  }

  const effectivePath = orgSlug ? (orgInternalPath(pathname, orgSlug) ?? pathname) : pathname;
  const isProtected = isProtectedPath(effectivePath);
  const isAuthPath = AUTH_PATHS.has(pathname);

  // Serve an organization's page from its internal route, keeping the refreshed session
  // cookies, and remember the address for the main address's hand-off.
  const respond = () => {
    let response = supabaseResponse;
    if (effectivePath !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = effectivePath;
      response = NextResponse.rewrite(url, { request: { headers: request.headers } });
      supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    }
    if (orgSlug && user && base) {
      response.cookies.set(LAST_ORG_COOKIE_NAME, orgSlug, {
        domain: `.${base}`,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  };

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // A help page comes back after sign-in; other pages keep the existing landing.
    const back = helpReturnPath(effectivePath);
    if (back) url.search = `?next=${encodeURIComponent(back)}`;
    return NextResponse.redirect(url);
  }

  // Signed in already and sent to sign-in on the way to a help page: go straight there.
  const helpBack = user && isAuthPath ? helpReturnPath(request.nextUrl.searchParams.get("next")) : null;
  if (helpBack) {
    const url = request.nextUrl.clone();
    url.pathname = helpBack;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A signed-in visitor skips the marketing page for their dashboard, same as on the
  // auth pages. Decided here rather than in the page itself so "/" has nothing left to
  // read at request time and prerenders as a static page served from the CDN -- the
  // one URL every first-time visitor hits, and previously a 2-3 s cold render.
  // On an organization's address its own home is the destination; on the landing-only main
  // address, /go picks the organization.
  if (user && (isAuthPath || (pathname === "/" && !orgSlug) || (landingOnly && pathname === "/dashboard"))) {
    const url = request.nextUrl.clone();
    url.pathname = orgSlug ? "/" : landingOnly ? "/go" : "/dashboard";
    return NextResponse.redirect(url);
  }

  if (!user) {
    return respond();
  }

  // A read-only client for the two lookups below -- session cookie refresh is already
  // fully owned by `supabase` above; this must not also try to write cookies. Built once
  // and reused for both the legacy-URL redirect and the current-shape license gate,
  // rather than one per branch.
  const coreClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "core" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    },
  );

  // Every bookmark, saved link, or stale in-app href built before business-scoped URLs
  // moved off /dashboard/businesses/[id]/... still resolves: redirect it to the same
  // page's new /[businessSlug]/... address rather than 404ing on a folder that no longer
  // exists. A business the caller can't resolve (bogus id, or a real id RLS hides
  // because they're not a member) falls through unredirected -- Next.js 404s on it
  // naturally, same as it already does for a bogus id under the current page-level
  // notFound() checks.
  const legacyMatch = effectivePath.match(LEGACY_BUSINESS_PATH);
  if (legacyMatch) {
    const [, legacyBusinessId, rest] = legacyMatch;
    const { data } = await coreClient
      .from("business_settings")
      .select("slug")
      .eq("business_id", legacyBusinessId)
      .maybeSingle();
    if (data?.slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/${data.slug}${rest}`;
      return NextResponse.redirect(url, 308);
    }
    return respond();
  }

  // Same idea for the module route prefixes that have since been renamed (offerings,
  // service, finance) -- pure path rewrites, so no DB lookup is needed here the way the
  // legacy business-id redirect above requires one. See legacyModuleRedirectPath().
  const legacyModulePath = legacyModuleRedirectPath(effectivePath);
  if (legacyModulePath) {
    const url = request.nextUrl.clone();
    url.pathname = legacyModulePath;
    return NextResponse.redirect(url, 308);
  }

  // Business/entitlement resolution: only meaningful once there's a signed-in user on a
  // protected, business-scoped route. Loaded once here (a single query) rather than
  // leaving every module route to resolve its own licensed-module set.
  if (isProtected) {
    const businessSlug = activeBusinessSlugFromPath(effectivePath);
    if (businessSlug) {
      const { data: settings } = await coreClient
        .from("business_settings")
        .select("business_id")
        .eq("slug", businessSlug)
        .maybeSingle();
      const businessId = settings?.business_id as string | undefined;
      if (businessId) {
        const platformClient = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          {
            db: { schema: "platform" },
            cookies: {
              getAll() {
                return request.cookies.getAll();
              },
              setAll() {},
            },
          },
        );
        const [{ data: licenses }, { data: platformModules }] = await Promise.all([
          coreClient.from("licenses").select("module_key, status, grace_ends_at").eq("business_id", businessId),
          // PLATFORM-P0-07.2/07.3: platform.modules' own SELECT policy is open to any
          // authenticated user (see that migration's own docstring), so this read works for
          // an ordinary business member's session, not just a superadmin's. `status` (not
          // the old boolean `enabled`, which PLATFORM-P0-07.3's reconciliation made a
          // derived, database-generated column) is the source of truth from here on.
          platformClient.from("modules").select("module_key, status, customer_facing_message"),
        ]);
        const licensedModules = new Set(
          (licenses ?? []).filter((l) => l.status === "active" || l.status === "grace").map((l) => l.module_key as string),
        );
        const platformStatusByKey = new Map(
          (platformModules ?? []).map((m) => [
            m.module_key as string,
            { status: m.status as string, message: m.customer_facing_message as string | null },
          ]),
        );
        // PLATFORM-P0-07.3 decision #3: `maintenance` and `disabled` are the exact same
        // full block -- both populate this set identically. A platform-wide `read_only`
        // status (decision #2) deliberately does NOT block the route, mirroring how a
        // license's own grace period never blocks the route either -- only writes.
        const platformDisabledModules = new Set(
          [...platformStatusByKey.entries()]
            .filter(([, v]) => v.status === "disabled" || v.status === "maintenance")
            .map(([key]) => key),
        );

        // Platform-wide full block checked first -- it blocks every business regardless of
        // that business's own license status, so it is the more universal fact when both
        // would otherwise apply.
        const platformDisabledKey = findPlatformDisabledModuleForRoute(effectivePath, platformDisabledModules);
        if (platformDisabledKey) {
          const info = platformStatusByKey.get(platformDisabledKey);
          const url = request.nextUrl.clone();
          url.pathname = `/${businessSlug}/not-licensed`;
          url.search = "";
          url.searchParams.set("module", platformDisabledKey);
          url.searchParams.set("reason", "platform_disabled");
          url.searchParams.set("platformStatus", info?.status ?? "disabled");
          if (info?.message) url.searchParams.set("message", info.message);
          return NextResponse.rewrite(url);
        }

        const blockedModuleKey = findUnlicensedModuleForRoute(effectivePath, licensedModules);
        if (blockedModuleKey) {
          const license = (licenses ?? []).find((l) => l.module_key === blockedModuleKey);
          const url = request.nextUrl.clone();
          url.pathname = `/${businessSlug}/not-licensed`;
          url.search = "";
          url.searchParams.set("module", blockedModuleKey);
          url.searchParams.set("reason", license?.status ?? "none");
          if (license?.status === "grace" && license.grace_ends_at) {
            url.searchParams.set("graceEndsAt", license.grace_ends_at as string);
          }
          return NextResponse.rewrite(url);
        }

        // RBAC-20 / §29-§31: licensed is not enough -- the user's role in this business
        // must also open the module. Checked after the licence so the two messages stay
        // distinct ("not in your plan" vs "no permission").
        const routeModule = moduleForRoute(effectivePath);
        const viewPermission = routeModule ? MODULE_VIEW_PERMISSION[routeModule.key] : undefined;
        if (routeModule && viewPermission) {
          const { data: allowed } = await coreClient.rpc("has_permission", { p_business_id: businessId, p_key: viewPermission });
          if (allowed === false) {
            const url = request.nextUrl.clone();
            url.pathname = `/${businessSlug}/not-licensed`;
            url.search = "";
            url.searchParams.set("module", routeModule.key);
            url.searchParams.set("reason", "no_permission");
            return NextResponse.rewrite(url);
          }
        }
      }
    }
  }

  return respond();
}

function portSuffix(request: NextRequest): string {
  return request.nextUrl.port ? `:${request.nextUrl.port}` : "";
}

/**
 * PLATFORM-P1-10.1 (Organization Address), PLATFORM-P1-10.3 (Main Address Landing) and
 * PLATFORM-P1-10.4 (Environments), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40. Pure:
 * no I/O, safe for the proxy, server code and client components alike.
 *
 * An organization (a business) is served at `<slug>.<BASE_APP_HOST>`. The address only picks
 * which business a request is for; membership still decides what anyone may see. With
 * BASE_APP_HOST unset (local, preview), addresses are off and nothing here changes routing.
 */

export type OrgEnvironment = "production" | "development" | "test" | "staging" | "sandbox";

/** The environments an owner or the console can add. Sandbox exists for the vendor only. */
export const ORGANIZATION_ENVIRONMENTS = ["production", "development", "test", "staging"] as const;

export const ENVIRONMENT_LABEL: Record<OrgEnvironment, string> = {
  production: "Production",
  development: "Development",
  test: "Test",
  staging: "Staging",
  sandbox: "Sandbox",
};

const ENVIRONMENT_SUFFIX: Record<Exclude<OrgEnvironment, "sandbox">, string> = {
  production: "",
  development: "-dev",
  test: "-test",
  staging: "-staging",
};

export const PREFIX_MIN = 3;
export const PREFIX_MAX = 32;

/** Mirrors core.business_slug_problem()'s list (migrations 20261013100000, 20261021100000): keep in step. */
export const RESERVED_PREFIXES = new Set([
  "dashboard", "platform", "login", "signup", "forgot-password", "reset-password", "onboarding",
  "auth", "api", "p", "help", "terms", "privacy", "pricing", "invite", "legal", "careers",
  "www", "app", "admin", "administrator", "platform-admin", "signin", "sign-in", "sign-up",
  "sso", "oauth", "mail", "email", "smtp", "static", "assets", "cdn", "media", "files",
  "status", "docs", "support", "billing", "wonderark", "wonderapps", "root", "system",
  "internal", "test", "demo", "dev", "staging", "prod", "production", "localhost",
  "security", "account", "accounts", "console", "organizations", "no-access", "not-found",
  "service-unavailable", "go", "organization-not-found", "organization-paused",
]);

/** Why `slug` can't be an address, in words, or null when it can. Same rules and wording as
 * core.business_slug_problem(). */
export function slugProblem(slug: string): string | null {
  if (slug !== slug.toLowerCase()) return "Use lowercase letters.";
  if (slug.length < PREFIX_MIN || slug.length > PREFIX_MAX) return "Use 3 to 32 characters.";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) return "Use letters, digits and hyphens, starting and ending with a letter or digit.";
  if (slug.includes("--")) return "No double hyphens.";
  if (RESERVED_PREFIXES.has(slug)) return "That address is reserved.";
  return null;
}

/** A prefix suggested from an organization's name; it follows the name until edited. */
export function suggestedPrefix(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PREFIX_MAX)
    .replace(/-+$/g, "");
  return slug.length >= PREFIX_MIN ? slug : "";
}

/** The address of an environment of the organization at `prefix`: production sits at the bare
 * prefix, others get -dev / -test / -staging, and an existing suffix is replaced, never stacked
 * (WonderID's acme-dev-staging bug). Same rule as platform.create_business_environment(). */
export function environmentSlug(prefix: string, environment: Exclude<OrgEnvironment, "sandbox">): string {
  return prefix.trim().toLowerCase().replace(/-(dev|test|staging)$/, "") + ENVIRONMENT_SUFFIX[environment];
}

type Env = Record<string, string | undefined>;

/** BASE_APP_HOST, normalized (no scheme, port or leading dot), or null when addresses are off. */
export function baseAppHost(env: Env = process.env): string | null {
  const raw = env.BASE_APP_HOST?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^\.+/, "");
  return raw ? raw : null;
}

/** The main domain is the landing page only. Never on without a base host. */
export function orgAddressRequired(env: Env = process.env): boolean {
  return env.ORG_ADDRESS_REQUIRED?.trim().toLowerCase() === "true" && baseAppHost(env) !== null;
}

export type HostTarget =
  | { kind: "none" }
  | { kind: "base" }
  | { kind: "organization"; label: string }
  | { kind: "invalid"; reason: string };

/** What a Host header points at. Hosts outside the base (vercel.app previews, localhost
 * without BASE_APP_HOST=localhost) are "none": addresses don't apply there. */
export function parseHost(hostHeader: string | null | undefined, base: string | null): HostTarget {
  if (!base || !hostHeader) return { kind: "none" };
  const host = hostHeader.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (host === base || host === `www.${base}`) return { kind: "base" };
  if (!host.endsWith(`.${base}`)) return { kind: "none" };
  const label = host.slice(0, -(base.length + 1));
  if (label.includes(".")) return { kind: "invalid", reason: "nested subdomain" };
  if (slugProblem(label)) return { kind: "invalid", reason: "not an organization address" };
  return { kind: "organization", label };
}

/** The URL of an organization's address, or null when addresses are off. */
export function orgUrl(slug: string, base: string | null, protocol = "https", port?: string): string | null {
  if (!base || !slug) return null;
  return `${protocol}://${slug}.${base}${port ? `:${port}` : ""}`;
}

/** Top-level paths that are the app's own on every host, never an organization's page:
 * the auth flow, the API, the account area, the console, public pages and assets. On an
 * organization's address everything else is that organization's page. Keep in step with
 * packages/core/src/db/middleware.ts RESERVED_TOP_SEGMENTS. */
export const APP_TOP_SEGMENTS = new Set([
  "dashboard", "platform", "login", "signup", "forgot-password", "reset-password", "onboarding",
  "auth", "api", "p", "help", "terms", "privacy", "pricing", "invite", "legal", "go",
  "organization-not-found", "organization-paused", "service-unavailable",
  "robots.txt", "sitemap.xml", "manifest.webmanifest", "_next",
]);

/** On an organization's address, the internal route for a visible path: `/discovery` is
 * served by `/<slug>/discovery`. Returns null when the path is the app's own (not rewritten). */
export function orgInternalPath(pathname: string, slug: string): string | null {
  const first = pathname.split("/")[1] ?? "";
  if (first === "" ) return `/${slug}`;
  if (APP_TOP_SEGMENTS.has(first) || first.includes(".")) return null;
  return `/${slug}${pathname}`;
}

/** The route-shaped path (`/<slug>/...`) for what the browser shows, on an organization's
 * address or not (hostSlug null). Pure, so components that sit above the OrgAddressProvider
 * (the dashboard chrome itself) can use it too. */
export function appPathname(pathname: string, hostSlug: string | null | undefined): string {
  if (!hostSlug || pathname === `/${hostSlug}` || pathname.startsWith(`/${hostSlug}/`)) return pathname;
  return orgInternalPath(pathname, hostSlug) ?? pathname;
}

/** On an organization's address, a link that still carries the slug (`/acme/discovery`, built
 * the path-routing way) is redirected to the visible path (`/discovery`). Null otherwise. */
export function orgVisiblePath(pathname: string, slug: string): string | null {
  if (pathname === `/${slug}`) return "/";
  if (pathname.startsWith(`/${slug}/`)) return pathname.slice(slug.length + 1);
  return null;
}

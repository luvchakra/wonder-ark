import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@cofounderai/core/rbac/platform-admin";
import { createClient } from "@cofounderai/core/db/server";
import { PlatformShell } from "./platform-shell";

/** Signed-in pages are never indexed or followed by any crawler (AI or search). */
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true, noimageindex: true } };

// Every /platform/* page is a per-request, authenticated control-plane view (session +
// cross-tenant admin queries) -- never a candidate for static prerendering. Forced here
// rather than relying on Next's dynamic-API auto-detection, since PLATFORM-P0-02's
// service-role queries (packages/core/src/admin/platform-dashboard-queries.ts) run before
// any cookies()/headers() call would otherwise trip that heuristic during the build's
// prerender pass, which fails hard in any environment without live Supabase env vars.
export const dynamic = "force-dynamic";

/**
 * PLATFORM-P0-01's control-plane shell -- a new top-level `apps/web/app/platform/`
 * segment, not nested inside `(dashboard)`, so it shares none of the customer app's
 * sidebar/topbar chrome (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §3: "must not be
 * implemented as a normal customer/business account with elevated UI permissions").
 *
 * `requireSuperadmin()` here is the real authorization boundary for every `/platform/*`
 * page (PLATFORM-P0-01.2: "every /platform/* route... must independently verify...
 * Never rely only on hiding navigation") -- redirecting a non-superadmin back to the
 * customer dashboard, same pattern `/dashboard/admin`'s own page already uses for its
 * narrower env-var-only gate. The header below is PLATFORM-P0-01.3's own requirement:
 * "the UI must clearly indicate Platform Administration / SUPERADMIN."
 *
 * PLATFORM-P0-19.1 ("Dedicated Admin Layout", §33) replaces the one-line nav strip this
 * file carried since PLATFORM-P0-03.1 with a real grouped sidebar (`platform-shell.tsx`
 * + `platform-nav.ts`) -- this file now only does the authorization/session work and
 * hands off rendering. Every route the old flat strip listed is still reachable, just
 * grouped; see `platform-nav.ts`'s own docstring for the grouping rationale.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  try {
    await requireSuperadmin();
  } catch {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PlatformShell userEmail={user?.email ?? null}>{children}</PlatformShell>;
}

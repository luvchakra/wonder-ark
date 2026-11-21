import { createClient } from "../db/server";
import { isPlatformAdminEmail } from "./platform-admin-emails";

/**
 * Gate for the platform-admin tools under /dashboard/admin (currently just the demo
 * seed-data page). Deliberately separate from core.business_members' own role column --
 * those roles are scoped to a single business, while /admin can act across every
 * business on the platform, so it needs its own, narrower gate. Ported from
 * stockpilot-ai-ops's lib/admin-auth.ts.
 *
 * Access is controlled purely by the server-side PLATFORM_ADMIN_EMAILS env var (comma-
 * separated emails, matched case-insensitively). No DB table, no role to manage --
 * matches the original's own reasoning for keeping this a pure env-var check.
 */
export { isPlatformAdminEmail };

/** The actual security boundary -- every admin server action calls this first, so a
 * non-admin can't reach the seeding/deletion endpoints no matter what the client
 * renders. */
export async function requirePlatformAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isPlatformAdminEmail(user?.email)) {
    throw new Error("Forbidden: this account does not have platform admin access.");
  }
}

/**
 * PLATFORM-P0-01's real, DB-backed SUPERADMIN role (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §5) -- the authorization boundary for every `/platform/*` route and mutation. Checks
 * the `PLATFORM_ADMIN_EMAILS` bootstrap list first (so the very first SUPERADMIN can
 * always get in before any `platform.admins` row exists, and an empty/misconfigured
 * table is never a lockout), then `platform.is_superadmin()` -- a SECURITY DEFINER SQL
 * function mirroring `core.has_permission()`'s exact shape, RLS-backed rather than just
 * an application-code check. Deliberately separate from `requirePlatformAdmin()` above
 * (a different, already-shipped feature -- the `/dashboard/admin` demo-data tool -- not
 * this story's to refactor), even though they currently share the same bootstrap list.
 *
 * PLATFORM-P0-18.3 ("Least Privilege", §32) -- verified 2026-09-26, no new code needed: P0
 * requires only SUPERADMIN, and nothing hard-codes it as the only role there can be.
 * `platform.admins.role` is a plain text column behind a CHECK constraint
 * (20260911004400_platform_superadmin.sql), one row per grant with its own
 * granted/revoked audit fields, and `platform.is_superadmin()` asks for `role =
 * 'superadmin'` specifically. Adding PLATFORM_ADMIN / BILLING_ADMIN / SUPPORT_ADMIN /
 * OPERATIONS_ADMIN / SECURITY_ADMIN later is a constraint widening plus a role-aware
 * `requirePlatformRole()` beside this function -- no table or architecture change, which
 * is what the story (and the P1 acceptance criterion "additional platform roles can be
 * introduced without architectural changes") asks the P0 design to guarantee.
 */
export async function isSuperadmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  if (isPlatformAdminEmail(user.email)) return true;

  const platform = await createClient({ schema: "platform" });
  const { data, error } = await platform.rpc("is_superadmin");
  if (error) throw error;
  return Boolean(data);
}

/** Non-throwing `isSuperadmin()` isn't enough for a server action or page that must
 * actually refuse a non-superadmin, not just skip rendering for one -- same
 * hasPermission()/requirePermission() split `rbac/require-permission.ts` already
 * establishes for business-scoped permissions. */
export async function requireSuperadmin(): Promise<void> {
  if (!(await isSuperadmin())) {
    throw new Error("Forbidden: this account does not have SUPERADMIN access.");
  }
}

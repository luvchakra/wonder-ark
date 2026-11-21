/**
 * PLATFORM-P1-10.17: the two environment-controlled lists of who administers WonderArk
 * itself, on their own so the request proxy (`db/middleware.ts`) can read them without
 * importing the server-only session client that `platform-admin.ts` needs.
 *
 * - `PLATFORM_ADMIN_EMAILS`: the Platform Administration portal (`/platform`), WonderArk's
 *   own console. The bootstrap list beside `platform.admins`.
 * - `BUSINESS_ADMIN_EMAILS`: the account tools at `/dashboard/admin` (demo data), which act
 *   on any business account. It opens nothing in the portal and no business's own data.
 *
 * A platform admin may use the account tools too, so one variable is enough for the owner.
 * Both are comma-separated emails, matched case-insensitively. Empty means nobody.
 */
function emailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function listed(value: string | undefined, email: string | null | undefined): boolean {
  if (!email) return false;
  const list = emailList(value);
  return list.length > 0 && list.includes(email.toLowerCase());
}

/** Pure, side-effect-free check -- for a caller that already has the user's email on
 * hand (e.g. the dashboard layout's own auth.getUser() call) and just needs to decide
 * whether to render the Platform admin link. Not itself a security boundary. */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  return listed(process.env.PLATFORM_ADMIN_EMAILS, email);
}

/** Who may use the account tools at /dashboard/admin: the business-admin list, or a
 * platform admin. Pure, like `isPlatformAdminEmail`; `requireBusinessAdmin()` is the gate. */
export function isBusinessAdminEmail(email: string | null | undefined): boolean {
  return listed(process.env.BUSINESS_ADMIN_EMAILS, email) || isPlatformAdminEmail(email);
}

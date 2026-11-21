/**
 * The `PLATFORM_ADMIN_EMAILS` bootstrap list, on its own so the request proxy
 * (`db/middleware.ts`) can read it without importing the server-only session client that
 * `platform-admin.ts` needs.
 */
function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Pure, side-effect-free check -- for a caller that already has the user's email on
 * hand (e.g. the dashboard layout's own auth.getUser() call) and just needs to decide
 * whether to render the admin nav link. Not itself a security boundary. */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  const admins = platformAdminEmails();
  return Boolean(email) && admins.length > 0 && admins.includes(email!.toLowerCase());
}

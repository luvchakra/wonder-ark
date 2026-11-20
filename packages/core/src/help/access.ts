/**
 * The help documentation is for signed-in users only (docs/user-guides/README.md, "Who can
 * read the guides"). Every help page checks the
 * session on the server, the proxy sends a signed-out visitor to sign-in, and sign-in
 * brings them back to the help page they asked for.
 *
 * The way back is limited to help pages on purpose: `next` arrives on the URL, so it is
 * attacker-controllable, and a fixed shape (`/help` or `/help/<guide-slug>`) can never
 * name another host or an arbitrary page.
 */

const HELP_PATH = /^\/help(?:\/[a-z0-9-]+)?\/?$/;

/** `/help` and everything under it. */
export function isHelpPath(pathname: string): boolean {
  return pathname === "/help" || pathname.startsWith("/help/");
}

/** The help page to return to after sign-in, or null when `next` isn't one. */
export function helpReturnPath(next: string | null | undefined): string | null {
  if (!next || !HELP_PATH.test(next)) return null;
  return next.length > 5 && next.endsWith("/") ? next.slice(0, -1) : next;
}

/**
 * PLATFORM-P1-10.15: where sign-in may return to. A help page (above), or one fixed page of
 * an organization's own address: `/business`, where a business just created from its
 * website is reviewed. Signing in on a new organization's address is the first thing its
 * founder does there (session cookies belong to one address), so creating a business sends
 * them to `<new address>/login?next=/business`. Still a fixed list: `next` can never name
 * another host or an arbitrary page.
 */
const ORG_RETURN_PAGES = new Set(["/business"]);

export function signInReturnPath(next: string | null | undefined): string | null {
  return helpReturnPath(next) ?? (next && ORG_RETURN_PAGES.has(next) ? next : null);
}

/** `/login?next=<help page>` for a signed-out visitor who asked for `pathname`. */
export function signInUrlFor(pathname: string): string {
  const next = helpReturnPath(pathname);
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

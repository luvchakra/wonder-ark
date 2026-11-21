/**
 * DISC-OFFER-P0-09.2's own "Respect access/robots restrictions." A minimal, standards-
 * enough robots.txt reader -- no new dependency (CLAUDE.md dev principle #2): one
 * user-agent group's Allow and Disallow rules, with RFC 9309's matching (`*`, `$`, longest
 * match wins, Allow wins ties). Crawl-delay and sitemap directives are out of scope for a
 * same-domain crawl bounded to a handful of pages.
 *
 * Parsing itself (parseRobotsTxt/isPathAllowed) is pure and deterministic (dev principle
 * #4); fetchRobotsRules is the one network-touching, best-effort wrapper around it.
 */

const AGENT_TOKEN = "cofounderai";

/**
 * DISC-OFFER-P0-09.4: one group's rules, Allow as well as Disallow. The first reader kept
 * only Disallow lines, so a site that blocks everything except its front page
 * (`Allow: /$` then `Disallow: /`, a common shape that lets link previews and search see
 * the homepage) read as blocked outright, and "Let AI Auto-Populate Info" refused a site
 * that allows exactly the page it reads first.
 */
export type RobotsRules = { allow: string[]; disallow: string[] };

/**
 * Parses robots.txt into the rules for our own agent (RFC 9309): the groups that name our
 * token, merged, or else the wildcard `User-agent: *` groups, merged. Consecutive
 * `User-agent:` lines share the rules that follow them.
 */
export function parseRobotsTxt(text: string, agentToken: string = AGENT_TOKEN): RobotsRules {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim());

  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!current || current.allow.length > 0 || current.disallow.length > 0) {
        current = { agents: [value.toLowerCase()], allow: [], disallow: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    } else if (key === "allow" && current) {
      if (value) current.allow.push(value);
    }
  }

  const token = agentToken.toLowerCase();
  const merge = (picked: Group[]): RobotsRules => ({
    allow: picked.flatMap((g) => g.allow),
    disallow: picked.flatMap((g) => g.disallow),
  });
  const named = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  if (named.length > 0) return merge(named);
  return merge(groups.filter((g) => g.agents.includes("*")));
}

/** How much of `path` a rule matches, or -1: `*` matches any run of characters and a
 * trailing `$` anchors the end, as RFC 9309 defines. The length is the rule's own, which
 * is how the most specific rule is chosen. */
function matchLength(rule: string, path: string): number {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path) ? rule.length : -1;
}

/** RFC 9309: the matching rule with the longest path wins, and an Allow wins a tie. No
 * matching rule allows. `/robots.txt` itself is always allowed. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  if (path === "/robots.txt") return true;
  let allowAt = -1;
  for (const rule of rules.allow) allowAt = Math.max(allowAt, matchLength(rule, path));
  let disallowAt = -1;
  for (const rule of rules.disallow) disallowAt = Math.max(disallowAt, matchLength(rule, path));
  return disallowAt < 0 || allowAt >= disallowAt;
}

/**
 * Best-effort robots.txt fetch for one origin. Absent, unreachable, or non-2xx is treated
 * as "no restrictions" -- the same permissive default most real crawlers use for a missing
 * robots.txt, and consistent with this feature's own bias (09.1) toward a direct fetch
 * failing open rather than blocking the whole run over a secondary concern.
 */
export async function fetchRobotsRules(origin: string): Promise<RobotsRules> {
  try {
    const response = await fetch(new URL("/robots.txt", origin).toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CofounderAI-Onboarding/1.0)" },
    });
    if (!response.ok) return { allow: [], disallow: [] };
    return parseRobotsTxt(await response.text());
  } catch {
    return { allow: [], disallow: [] };
  }
}

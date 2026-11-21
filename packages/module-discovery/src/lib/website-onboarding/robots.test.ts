import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobotsTxt } from "./robots";

describe("parseRobotsTxt", () => {
  it("returns no restrictions for an empty file", () => {
    expect(parseRobotsTxt("")).toEqual({ allow: [], disallow: [] });
  });

  it("reads the wildcard group's Disallow lines", () => {
    const text = `User-agent: *\nDisallow: /admin\nDisallow: /internal\n`;
    expect(parseRobotsTxt(text)).toEqual({ allow: [], disallow: ["/admin", "/internal"] });
  });

  it("ignores comments and blank lines", () => {
    const text = `# comment\nUser-agent: *\n\n# another\nDisallow: /admin\n`;
    expect(parseRobotsTxt(text)).toEqual({ allow: [], disallow: ["/admin"] });
  });

  it("prefers a group naming our own agent over the wildcard group", () => {
    const text = `User-agent: *\nDisallow: /everything\n\nUser-agent: cofounderai\nDisallow: /only-this\n`;
    expect(parseRobotsTxt(text)).toEqual({ allow: [], disallow: ["/only-this"] });
  });

  it("falls back to the wildcard group when no group names our agent", () => {
    const text = `User-agent: Googlebot\nDisallow: /google-only\n\nUser-agent: *\nDisallow: /admin\n`;
    expect(parseRobotsTxt(text)).toEqual({ allow: [], disallow: ["/admin"] });
  });

  it("treats an empty Disallow value as no restriction", () => {
    const text = `User-agent: *\nDisallow:\n`;
    expect(parseRobotsTxt(text)).toEqual({ allow: [], disallow: [] });
  });

  it("groups multiple User-agent lines that share one rule block", () => {
    const text = `User-agent: Googlebot\nUser-agent: *\nDisallow: /admin\n`;
    expect(parseRobotsTxt(text)).toEqual({ allow: [], disallow: ["/admin"] });
  });
});

describe("isPathAllowed", () => {
  it("allows everything when there are no rules", () => {
    expect(isPathAllowed({ allow: [], disallow: [] }, "/anything")).toBe(true);
  });

  it("disallows a path matching a disallowed prefix", () => {
    expect(isPathAllowed({ allow: [], disallow: ["/admin"] }, "/admin/settings")).toBe(false);
  });

  it("allows a path that doesn't match any disallowed prefix", () => {
    expect(isPathAllowed({ allow: [], disallow: ["/admin"] }, "/about")).toBe(true);
  });

  it("disallows everything when the rule is a bare slash", () => {
    expect(isPathAllowed({ allow: [], disallow: ["/"] }, "/about")).toBe(false);
  });
});

// DISC-OFFER-P0-09.4: Allow lines and RFC 9309 matching. The site that showed the bug
// (a product's own marketing site) blocks everything except its front page and a few
// public pages, for every crawler.
const FRONT_PAGE_ONLY = `
User-Agent: GPTBot
User-Agent: ClaudeBot
Disallow: /

User-Agent: *
Allow: /$
Allow: /legal$
Allow: /careers$
Allow: /careers/
Allow: /og.png
Disallow: /
Disallow: /careers/status
`;

describe("robots.txt with Allow lines (RFC 9309)", () => {
  const rules = parseRobotsTxt(FRONT_PAGE_ONLY);

  it("reads the wildcard group's Allow lines too", () => {
    expect(rules.allow).toEqual(["/$", "/legal$", "/careers$", "/careers/", "/og.png"]);
    expect(rules.disallow).toEqual(["/", "/careers/status"]);
  });

  it("allows the front page that the site allows, though everything else is blocked", () => {
    expect(isPathAllowed(rules, "/")).toBe(true);
    expect(isPathAllowed(rules, "/legal")).toBe(true);
    expect(isPathAllowed(rules, "/careers/engineer")).toBe(true);
  });

  it("still refuses every page the site did not allow", () => {
    for (const path of ["/about", "/pricing", "/legal/terms", "/app", "/careers/status", "/careers/status/1"]) {
      expect(isPathAllowed(rules, path), path).toBe(false);
    }
  });

  it("lets the longest matching rule win, and Allow win a tie", () => {
    const r = { allow: ["/shop/public"], disallow: ["/shop"] };
    expect(isPathAllowed(r, "/shop/public/item")).toBe(true);
    expect(isPathAllowed(r, "/shop/private")).toBe(false);
    expect(isPathAllowed({ allow: ["/page"], disallow: ["/page"] }, "/page")).toBe(true);
    expect(isPathAllowed({ allow: ["/p"], disallow: ["/page"] }, "/page")).toBe(false);
  });

  it("understands * and $ in a rule", () => {
    const r = { allow: [], disallow: ["/*.pdf$", "/private*/drafts"] };
    expect(isPathAllowed(r, "/files/report.pdf")).toBe(false);
    expect(isPathAllowed(r, "/files/report.pdf.html")).toBe(true);
    expect(isPathAllowed(r, "/private-area/drafts/1")).toBe(false);
    expect(isPathAllowed(r, "/public/drafts")).toBe(true);
  });

  it("treats a rule's special characters as plain text", () => {
    expect(isPathAllowed({ allow: [], disallow: ["/a.b"] }, "/axb")).toBe(true);
    expect(isPathAllowed({ allow: [], disallow: ["/a(b"] }, "/a(b/c")).toBe(false);
  });

  it("merges every group that names our agent", () => {
    const text = `User-agent: cofounderai\nDisallow: /a\n\nUser-agent: *\nDisallow: /\n\nUser-agent: cofounderai\nAllow: /a/ok\n`;
    expect(parseRobotsTxt(text)).toEqual({ allow: ["/a/ok"], disallow: ["/a"] });
  });

  it("does not let a group naming another crawler apply to us", () => {
    expect(parseRobotsTxt(`User-agent: ClaudeBot\nDisallow: /\n`)).toEqual({ allow: [], disallow: [] });
  });
});

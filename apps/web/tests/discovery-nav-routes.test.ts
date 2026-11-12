import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDiscoveryNav, businessNavLink } from "@cofounderai/core/lib/discovery-nav";

// DISC-NAV-01..05. Same idea as menu-routes.test.ts, for Discovery's own tree (which the
// registry test skips because its offerings are live data): every link the sidebar can
// render must land on a page that exists. Uses a placeholder offering id so the
// offering-scoped Customer Acquisition links resolve to their [productId] routes.
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "app", "(dashboard)", "[businessSlug]");

function pagePath(href: string): string {
  const rest = href
    .replace(/^\/acme/, "")
    .replace("/discovery/offerings/p1", "/discovery/offerings/[productId]");
  return join(ROOT, rest, "page.tsx");
}

describe("every Discovery sidebar link resolves to a real page", () => {
  const links = [
    ...buildDiscoveryNav("/acme", [{ id: "p1", name: "Offering" }], "/acme/discovery/dashboard"),
    { label: "Business", href: businessNavLink("/acme", null).href },
  ];
  for (const link of links) {
    it(`${link.label} → ${link.href}`, () => {
      expect(existsSync(pagePath(link.href)), `Expected ${pagePath(link.href)}`).toBe(true);
    });
  }
});

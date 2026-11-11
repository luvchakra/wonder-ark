/**
 * DISC-DATA-P0-02.1 (B8, "No provider access"): WonderArk has exactly one prospect-data
 * connector, the WorksLake gateway. It holds no data-provider key and calls no data
 * provider. This test fails if the environment example or any product source file names
 * a provider's key or API host (Apollo, Hunter, Google Places, YouTube, Podcast Index,
 * data.gov.in), if the data-source layer hard-codes any host at all, or if product code
 * imports the test fixtures that stand in for the gateway.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url));
const DATA_SOURCES_DIR = join(ROOT, "packages", "module-discovery", "src", "lib", "data-sources");

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage", "test-results", "playwright-report"]);
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || path.split(sep).some((part) => part === "__tests__" || part === "e2e");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE_FILE.test(entry)) out.push(path);
  }
  return out;
}

/** Every product source file: the app, every package, and the scripts. No tests. */
const productFiles = [
  ...walk(join(ROOT, "apps", "web")),
  ...walk(join(ROOT, "packages")),
  ...walk(join(ROOT, "scripts")),
].filter((path) => !isTestFile(path));

/** A provider's API host. Listing a provider by name (a source label, an attribution
 * line the gateway returned) is not access; an address to call is. */
const PROVIDER_HOSTS = [
  /apollo\.io/i,
  /hunter\.io/i,
  /places\.googleapis\.com/i,
  /maps\.googleapis\.com/i,
  /youtube\.googleapis\.com/i,
  /googleapis\.com\/youtube/i,
  /podcastindex\.org/i,
  /data\.gov\.in/i,
];

/** An environment variable that would hold a provider's key. */
const PROVIDER_KEYS = [
  /\bAPOLLO_[A-Z0-9_]+/,
  /\bHUNTER_[A-Z0-9_]+/,
  /\bGOOGLE_(PLACES|MAPS)_[A-Z0-9_]+/,
  /\bYOUTUBE_[A-Z0-9_]*(KEY|TOKEN|SECRET)\b/,
  /\bPODCAST_?INDEX_[A-Z0-9_]+/,
  /\bDATA_GOV(_IN)?_[A-Z0-9_]+/,
];

function offences(text: string, patterns: RegExp[]): string[] {
  return patterns.flatMap((pattern) => text.match(pattern)?.[0] ?? []);
}

describe("no provider access", () => {
  it("scans a real set of product files", () => {
    expect(productFiles.length).toBeGreaterThan(500);
    expect(productFiles.some((path) => path.endsWith(join("data-sources", "workslake-client.ts")))).toBe(true);
    expect(productFiles.some(isTestFile)).toBe(false);
  });

  it("the environment example names the gateway's two settings and no provider key", () => {
    const example = readFileSync(join(ROOT, "apps", "web", ".env.example"), "utf8");

    expect(example).toMatch(/^WORKSLAKE_GATEWAY_URL=$/m);
    expect(example).toMatch(/^WORKSLAKE_GATEWAY_API_KEY=$/m);
    expect(offences(example, PROVIDER_KEYS)).toEqual([]);
    expect(offences(example, PROVIDER_HOSTS)).toEqual([]);
  });

  it("no product source file names a provider's key or API host", () => {
    const found = productFiles.flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return [...offences(text, PROVIDER_KEYS), ...offences(text, PROVIDER_HOSTS)].map(
        (match) => `${relative(ROOT, path)}: ${match}`,
      );
    });

    expect(found).toEqual([]);
  });

  it("the patterns do catch a provider key and a provider host", () => {
    expect(offences("APOLLO_API_KEY=abc", PROVIDER_KEYS)).toEqual(["APOLLO_API_KEY"]);
    expect(offences("GOOGLE_PLACES_API_KEY=abc", PROVIDER_KEYS)).toEqual(["GOOGLE_PLACES_API_KEY"]);
    expect(offences('fetch("https://api.hunter.io/v2/domain-search")', PROVIDER_HOSTS)).toEqual(["hunter.io"]);
    expect(offences('"https://api.data.gov.in/resource"', PROVIDER_HOSTS)).toEqual(["data.gov.in"]);
  });

  it("the data-source layer reaches one host, taken from the gateway setting, and hard-codes none", () => {
    const files = walk(DATA_SOURCES_DIR).filter((path) => !isTestFile(path));
    expect(files.length).toBeGreaterThan(0);

    const hardCoded = files.flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/https?:\/\/[a-z0-9]/gi)].map((match) => `${relative(ROOT, path)}: ${match[0]}`),
    );
    expect(hardCoded).toEqual([]);

    // Exactly one file in the layer makes a request, and it is the gateway client.
    const callers = files.filter((path) => /\bfetch\(/.test(readFileSync(path, "utf8")));
    expect(callers.map((path) => relative(DATA_SOURCES_DIR, path))).toEqual(["workslake-client.ts"]);
  });

  it("only the gateway client reads the gateway's settings", () => {
    const readers = productFiles.filter((path) => /WORKSLAKE_GATEWAY_(URL|API_KEY)/.test(readFileSync(path, "utf8")));

    expect(readers.map((path) => relative(ROOT, path))).toEqual([
      join("packages", "module-discovery", "src", "lib", "data-sources", "workslake-client.ts"),
    ]);
  });

  it("no client component imports the gateway client's code", () => {
    const offenders = productFiles.filter((path) => {
      const text = readFileSync(path, "utf8");
      if (!/^\s*["']use client["']/m.test(text)) return false;
      return /import\s+(?!type\b)[^;]*from\s+["'][^"']*workslake-client["']/.test(text);
    });

    expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
  });

  it("no product code imports the test fixtures that stand in for the gateway", () => {
    const offenders = productFiles.filter((path) => /from\s+["'][^"']*__tests__\//.test(readFileSync(path, "utf8")));

    expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
  });
});

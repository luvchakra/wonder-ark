import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";
import {
  BRAND_HEX,
  BRAND_METADATA_ICONS,
  BRAND_THEME_COLOR,
  BRAND_TITLE,
  BRAND_TITLE_TEMPLATE,
} from "@cofounderai/core/brand/identity";

/** BRAND-06 / BRAND-07 (§32): favicon metadata, manifest icon paths, theme colour, page
 * titles -- checked against the files the build actually wrote. */
const PUBLIC = join(__dirname, "..", "public");
const served = (url: string) => existsSync(join(PUBLIC, url));

describe("WonderArk browser metadata", () => {
  it("uses the canonical title and the {Page} | WonderArk pattern", () => {
    expect(BRAND_TITLE).toBe("WonderArk — Business in One Place");
    expect(BRAND_TITLE_TEMPLATE.replace("%s", "Discovery")).toBe("Discovery | WonderArk");
  });

  it("sets the brand navy theme colour", () => {
    expect(BRAND_THEME_COLOR).toBe("#0B1F3B");
    expect(manifest().theme_color).toBe("#0B1F3B");
    expect(BRAND_HEX.blue).toBe("#007BFF");
  });

  it("lists every favicon size (16/32/48/64) and the Apple icon, all served", () => {
    const sizes = BRAND_METADATA_ICONS.icon.map((i) => i.sizes);
    expect(sizes).toEqual(["16x16", "32x32", "48x48", "64x64"]);
    for (const icon of [...BRAND_METADATA_ICONS.icon, ...BRAND_METADATA_ICONS.apple]) {
      expect(served(icon.url), icon.url).toBe(true);
    }
  });

  it("gives the manifest 192/512 icons, all served", () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    for (const icon of icons) expect(served(icon.src), icon.src).toBe(true);
    expect(manifest().name).toBe(BRAND_TITLE);
  });

  it("BRAND-13: the manifest is complete for install and lists itself as a related app", () => {
    const m = manifest();
    expect(m).toMatchObject({ id: "/dashboard", start_url: "/dashboard", scope: "/", display: "standalone" });
    expect(m.short_name).toBeTruthy();
    expect(m.description).toBeTruthy();
    expect(m.background_color).toBeTruthy();
    expect(m.prefer_related_applications).toBe(false);
    const [related] = m.related_applications ?? [];
    expect(related.platform).toBe("webapp");
    // Absolute, and the manifest's own URL: what getInstalledRelatedApps() matches against.
    expect(new URL(related.url ?? "").pathname).toBe("/manifest.webmanifest");
  });

  it("BRAND-13: iOS Add to Home Screen metadata and the early install-prompt capture are in the root layout", () => {
    const layout = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");
    expect(layout).toContain('appleWebApp: { capable: true, title: BRAND_NAME, statusBarStyle: "default" }');
    expect(layout).toContain('"apple-mobile-web-app-capable": "yes"');
    expect(layout).toMatch(/<head>[\s\S]*<InstallPromptCaptureScript \/>[\s\S]*<\/head>/);
    expect(layout).toMatch(/<ThemeProvider>[\s\S]*?<InstallBanner \/>\s*\{children\}/);
  });

  it("module layouts name their page for the title template", () => {
    const base = join(__dirname, "..", "app", "(dashboard)", "[businessSlug]");
    for (const [dir, title] of [
      ["discovery", "Discovery"],
      ["discovery/marketing", "Marketing"],
      ["discovery/offerings", "Acquisition"],
      ["discovery/funding", "Funding"],
      ["inventory", "Inventory"],
      ["service", "Service"],
      ["crm", "CRM"],
      ["finance", "Finance"],
    ]) {
      expect(readFileSync(join(base, dir, "layout.tsx"), "utf8")).toContain(
        `export const metadata: Metadata = { title: { absolute: \`${title} | \${BRAND_NAME}\`, template: BRAND_TITLE_TEMPLATE } };`,
      );
    }
  });
});

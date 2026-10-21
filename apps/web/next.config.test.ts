/**
 * The workspace packages ship TypeScript/JSX source rather than a build step, so Next has
 * to transpile them — dropping one from this list breaks the build with an opaque parse
 * error in node_modules, which is worth one assertion.
 */
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config", () => {
  it("transpiles the workspace packages apps/web imports as source", () => {
    expect(nextConfig.transpilePackages).toEqual([
      "@cofounderai/core",
      "@cofounderai/module-registry",
    ]);
  });

  // Uploads (marketing assets, data-room documents) go through server actions; Next's
  // 1 MB default would refuse nearly every real file before our own checks run.
  it("lets server actions accept uploads up to Vercel's request ceiling", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("4.5mb");
  });

  // PLATFORM-P1-13.1: /careers/status?t=<token> must not leak the token as a referrer.
  it("sends no referrer and noindex from the application status page", async () => {
    const rules = await nextConfig.headers!();
    const status = rules.filter((r) => r.source === "/careers/status").flatMap((r) => r.headers);
    expect(status).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
    expect(status).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    // Later rules win in Next, so the page's own rule must come after the site-wide one.
    expect(rules.findIndex((r) => r.source === "/careers/status")).toBeGreaterThan(rules.findIndex((r) => r.source === "/:path*"));
  });
});

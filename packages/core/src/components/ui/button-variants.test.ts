import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button-variants";

/**
 * DISC-OFFER-P0-01.3: a server component that calls `buttonVariants()` imported from the
 * client module `ui/button` throws at render ("Attempted to call buttonVariants() from the
 * server"). Server files import it from `ui/button-variants` instead.
 */
const root = resolve(__dirname, "../../../../..");
const dirs = ["apps/web/app", "apps/web/components", "packages"].map((d) => join(root, d));

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

describe("buttonVariants", () => {
  it("gives the same classes as before", () => {
    expect(buttonVariants({ variant: "outline", size: "sm" })).toContain("border-input");
  });

  it("is never imported from the client module by a server file", () => {
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of files(dir)) {
        const text = readFileSync(file, "utf8");
        if (/^\s*["']use client["']/.test(text)) continue;
        if (/import\s*\{[^}]*\bbuttonVariants\b[^}]*\}\s*from\s*["'](@cofounderai\/core\/ui\/button|\.\/button|[./]*components\/ui\/button)["']/.test(text)) {
          offenders.push(file.slice(root.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

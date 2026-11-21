import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_ONLY_VARIABLES,
  PLATFORM_AI_KEY_ENV,
  PLATFORM_KEYS,
  platformKeyHint,
  platformKeyProblem,
  platformKeySpec,
} from "./platform-key-registry";

/** PLATFORM-P1-14.1: the registry of platform keys, and that product code reads them through it. */

const root = resolve(__dirname, "../../../..");
const spec = (name: string) => platformKeySpec(name)!;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "e2e" || name === "generated") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}
const productFiles = [...files(join(root, "apps/web")), ...files(join(root, "packages"))];

describe("the registry", () => {
  it("names each key once, in the shape the table accepts", () => {
    const names = PLATFORM_KEYS.map((key) => key.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^[A-Z][A-Z0-9_]{2,63}$/);
  });

  it("says in words what each key is for and where it comes from", () => {
    for (const key of PLATFORM_KEYS) {
      expect(key.label.length, key.name).toBeGreaterThan(3);
      expect(key.usedBy.length, key.name).toBeGreaterThan(20);
      expect(key.source.length, key.name).toBeGreaterThan(5);
    }
  });

  it("holds the values that were set in the deployment, and none that must stay there", () => {
    for (const name of ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "WORKSLAKE_GATEWAY_URL", "WORKSLAKE_GATEWAY_API_KEY"]) {
      expect(platformKeySpec(name), name).not.toBeNull();
    }
    const stays = new Set(DEPLOYMENT_ONLY_VARIABLES.map((variable) => variable.name));
    for (const key of PLATFORM_KEYS) expect(stays.has(key.name), key.name).toBe(false);
    // What reaches the database and decrypts it can never be stored in it.
    for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "API_KEY_ENCRYPTION_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "CRON_SECRET", "PLATFORM_ADMIN_EMAILS"]) {
      expect(stays.has(name), name).toBe(true);
      expect(platformKeySpec(name), name).toBeNull();
    }
    expect(platformKeySpec(PLATFORM_AI_KEY_ENV)).toBeNull();
  });
});

describe("platformKeyHint", () => {
  it("shows the last four characters of a secret, and nothing of a short one", () => {
    expect(platformKeyHint(spec("RESEND_API_KEY"), "re_1234567890abcd")).toBe("••••abcd");
    expect(platformKeyHint(spec("RESEND_API_KEY"), "short")).toBe("••••");
  });

  it("shows a value that is not secret in full", () => {
    expect(platformKeyHint(spec("WORKSLAKE_GATEWAY_URL"), "https://works.example")).toBe("https://works.example");
  });
});

describe("platformKeyProblem", () => {
  it("accepts ordinary values", () => {
    expect(platformKeyProblem(spec("RESEND_API_KEY"), "re_1234567890abcd")).toBeNull();
    expect(platformKeyProblem(spec("WORKSLAKE_GATEWAY_URL"), "https://works.example")).toBeNull();
    expect(platformKeyProblem(spec("RESEND_FROM_EMAIL"), "team@example.com")).toBeNull();
    expect(platformKeyProblem(spec("RESEND_FROM_EMAIL"), "WonderArk <team@example.com>")).toBeNull();
  });

  it.each([
    ["an empty value", "RESEND_API_KEY", ""],
    ["two lines", "RESEND_API_KEY", "re_123\nre_456"],
    ["a value too long to be a key", "RESEND_API_KEY", "x".repeat(5000)],
    ["a gateway address that is not https", "WORKSLAKE_GATEWAY_URL", "http://works.example"],
    ["a gateway address that is not an address", "WORKSLAKE_GATEWAY_URL", "works"],
    ["a From value with no address", "RESEND_FROM_EMAIL", "WonderArk"],
  ])("refuses %s", (_label, name, value) => {
    expect(platformKeyProblem(spec(name), value)).toEqual(expect.any(String));
  });
});

describe("product code", () => {
  const moved = PLATFORM_KEYS.map((key) => key.name).join("|");

  it("reads a moved key through platformKey(), never straight from the environment", () => {
    const direct = new RegExp(`process\\.env\\.(${moved})\\b`);
    const offenders = productFiles.filter((path) => direct.test(readFileSync(path, "utf8"))).map((path) => path.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });

  it("asks platformKey() only for names in the registry", () => {
    const unknown: string[] = [];
    for (const path of productFiles) {
      for (const match of readFileSync(path, "utf8").matchAll(/platformKey(?:Source)?\("([A-Z0-9_]+)"/g)) {
        if (!platformKeySpec(match[1]!)) unknown.push(`${path.slice(root.length + 1)}: ${match[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

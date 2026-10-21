import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests live next to what they cover (`app/**`, `lib/**`) as well as in `tests/`, so the
 * include is broad and the exclude is what does the real work.
 *
 * `e2e/**` is the reason this file exists. Vitest's default include also matched
 * `e2e/**\/*.spec.ts` -- Playwright specs, which import `@playwright/test` and fail at
 * collection under vitest. `npm run test` therefore reported ten failed files on every
 * single run, in every environment, for reasons that had nothing to do with the code: a
 * permanently red suite that a real failure could hide in indefinitely (an outage that
 * took every `(auth)` page down with a 500 did exactly that). They are run by
 * `npm run e2e` (playwright.config.ts), the only runner that can drive them.
 *
 * `server-only` is resolved by Next.js itself, not installed from npm, so it is aliased to
 * an empty module here (PLATFORM-P1-13.1).
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("../../packages/core/src/test-support/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});

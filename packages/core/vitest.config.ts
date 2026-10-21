import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `server-only` (PLATFORM-P1-13.1's careers client) is resolved by Next.js itself, not
 * installed from npm, so under Vitest it is aliased to an empty module.
 */
export default defineConfig({
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./src/test-support/server-only-stub.ts", import.meta.url)) },
  },
});

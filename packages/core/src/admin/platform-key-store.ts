import { createAdminClient } from "../db/admin";
import { decryptApiKey } from "../crypto/api-key";
import { PLATFORM_KEYS, type PlatformKeyName } from "./platform-key-registry";

/**
 * PLATFORM-P1-14.1 ("Platform Keys"): how the running application reads one of the
 * platform's own keys or settings.
 *
 * `platformKey("SMTP_HOST")` returns the value saved on the Platform Admin portal's
 * Keys page, or else the deployment's environment variable of the same name, or undefined.
 * The saved value wins for the same reason the AI Providers page's key wins over
 * `PLATFORM_AI_API_KEY` (`ai/platform-credential.ts`): it is the more deliberate act, and it
 * lets a key be replaced from the portal without a redeploy.
 *
 * Saved values are read with the service role (`platform.platform_keys` grants
 * `authenticated` nothing), all in one query, decrypted in memory and kept for at most a
 * minute per server instance, so a replaced key is in use everywhere within a minute and a
 * request that sends several emails reads the database at most once. Concurrent callers
 * share the read in flight.
 *
 * A read that fails (database unreachable, an encryption secret that no longer decrypts
 * what was stored) is logged without any value and keeps what was last read; the
 * deployment's variable still answers. Nothing here logs, returns to a client or throws a
 * decrypted value.
 *
 * Platform-wide configuration, never tenant data: there is nothing per business in here,
 * so the in-memory copy cannot leak one tenant's data to another.
 */

const TTL_MS = 60_000;
const NAMES = new Set<string>(PLATFORM_KEYS.map((spec) => spec.name));

let cache: { at: number; values: Record<string, string> } | null = null;
let inflight: Promise<void> | null = null;

async function read(now: number): Promise<void> {
  const values: Record<string, string> = {};
  // No database configured (a build step, a script): only the deployment's variables exist.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    cache = { at: now, values };
    return;
  }
  try {
    const supabase = createAdminClient({ schema: "platform" });
    const { data, error } = await supabase.from("platform_keys").select("name, encrypted_value");
    if (error) throw error;
    for (const row of (data ?? []) as { name: string; encrypted_value: string }[]) {
      if (!NAMES.has(row.name)) continue;
      const value = decryptApiKey(row.encrypted_value).trim();
      if (value) values[row.name] = value;
    }
    cache = { at: now, values };
  } catch (cause) {
    // The message only: never a row or a value.
    console.warn("[platform-keys] Could not read the platform's saved keys; using the deployment's variables.", cause instanceof Error ? cause.message : "unknown error");
    cache = { at: now, values: cache?.values ?? {} };
  }
}

/** Reads the saved values into memory, at most once a minute unless `force` is set. */
export function loadPlatformKeys(options: { force?: boolean; now?: number } = {}): Promise<void> {
  const now = options.now ?? Date.now();
  if (!options.force && cache && now - cache.at < TTL_MS) return Promise.resolve();
  // A forced read (right after a save) never reuses a read that began before the save.
  if (options.force) return read(now);
  if (!inflight) {
    inflight = read(now).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Forget what was read, so the next call reads again. After a save, and in tests. */
export function resetPlatformKeyCache(): void {
  cache = null;
  inflight = null;
}

/** One key or setting: the value saved on the platform, else the deployment's variable. */
export async function platformKey(name: PlatformKeyName, env: Record<string, string | undefined> = process.env): Promise<string | undefined> {
  await loadPlatformKeys();
  return cache?.values[name] ?? (env[name]?.trim() || undefined);
}

/** Where a key's value comes from right now, without the value. */
export async function platformKeySource(name: PlatformKeyName, env: Record<string, string | undefined> = process.env): Promise<"platform" | "deployment" | null> {
  await loadPlatformKeys();
  if (cache?.values[name]) return "platform";
  return env[name]?.trim() ? "deployment" : null;
}

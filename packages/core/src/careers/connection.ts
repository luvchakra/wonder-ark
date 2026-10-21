import "server-only";
import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { decryptApiKey, encryptApiKey } from "../crypto/api-key";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P1-13.2 -- the WonderJobs career-site key (wjcs_...), set by a superadmin on
 * /platform/careers without a redeploy. Stored encrypted (`platform.careers_connection`,
 * migration 20261021100000) and never read back to a browser: the console only ever sees
 * a mask built from the last four characters. Saves and clears go through superadmin-
 * checked SQL functions that record who and when in `platform.audit_log`, with the last
 * four characters only.
 *
 * `WONDERJOBS_CAREERS_KEY` is the fallback when the database has no key.
 */

export const CAREERS_KEY_ENV = "WONDERJOBS_CAREERS_KEY";

export function maskCareersKey(last4: string): string {
  return `wjcs_••••••••${last4}`;
}

export type CareersKeyStatus = {
  /** Where the key in use comes from: saved here, the environment fallback, or nowhere. */
  source: "saved" | "environment" | "none";
  masked: string | null;
  updatedAt: string | null;
};

function environmentKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env[CAREERS_KEY_ENV]?.trim();
  return key ? key : null;
}

export async function getCareersKeyStatus(): Promise<CareersKeyStatus> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.rpc("careers_connection_status");
  if (error) throw error;
  const row = (data as { key_last4: string; updated_at: string }[] | null)?.[0];
  if (row) return { source: "saved", masked: maskCareersKey(row.key_last4), updatedAt: row.updated_at };
  const env = environmentKey();
  if (env) return { source: "environment", masked: maskCareersKey(env.slice(-4)), updatedAt: null };
  return { source: "none", masked: null, updatedAt: null };
}

export const careersKeySchema = z
  .string()
  .trim()
  .regex(/^wjcs_[A-Za-z0-9_-]{8,250}$/, "Paste the whole career-site key. It starts with wjcs_.");

export type SaveResult = { ok: true; masked: string } | { ok: false; error: string };

export async function saveCareersKey(input: { key: string }): Promise<SaveResult> {
  await requireSuperadmin();
  const parsed = careersKeySchema.safeParse(input.key ?? "");
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid key." };
  const key = parsed.data;
  const last4 = key.slice(-4);

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_careers_key", { p_encrypted_key: encryptApiKey(key), p_key_last4: last4 });
  if (error) {
    // The RPC only ever saw ciphertext, so its error can't carry the key.
    return { ok: false, error: `The key couldn't be saved (${error.code ?? "database error"}).` };
  }
  return { ok: true, masked: maskCareersKey(last4) };
}

export async function clearCareersKey(): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("clear_careers_key");
  if (error) return { ok: false, error: `The key couldn't be cleared (${error.code ?? "database error"}).` };
  return { ok: true };
}

export type ResolvedCareersKey =
  | { state: "ok"; key: string; source: "saved" | "environment" }
  | { state: "missing" }
  /** A row exists but can't be used (read failed, or encrypted under a rotated secret). */
  | { state: "unreadable" };

/**
 * The key to call WonderJobs with, read with the service role immediately before the call.
 * Server-only; never returned to a page or an action's result.
 */
export async function resolveCareersKey(env: Record<string, string | undefined> = process.env): Promise<ResolvedCareersKey> {
  let encrypted: string | null;
  try {
    const admin = createAdminClient({ schema: "platform" });
    const { data, error } = await admin.from("careers_connection").select("encrypted_key").eq("id", true).maybeSingle();
    if (error) {
      console.error("careers: key lookup failed", { code: error.code ?? "unknown" });
      return { state: "unreadable" };
    }
    encrypted = (data as { encrypted_key: string } | null)?.encrypted_key ?? null;
  } catch {
    console.error("careers: key lookup failed", { code: "client" });
    return { state: "unreadable" };
  }

  if (encrypted) {
    try {
      return { state: "ok", key: decryptApiKey(encrypted), source: "saved" };
    } catch {
      console.error("careers: the saved key can't be decrypted");
      return { state: "unreadable" };
    }
  }

  const fallback = environmentKey(env);
  return fallback ? { state: "ok", key: fallback, source: "environment" } : { state: "missing" };
}

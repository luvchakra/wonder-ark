import "server-only";
import { createHash, createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@cofounderai/core/db/admin";

/**
 * PLATFORM-P1-13.1 -- per-address hourly limits for the public Careers forms (apply about
 * 10 an hour, status lookups and withdrawals 30). Visitors are signed out and Vercel runs
 * many instances, so the count lives in `platform.careers_rate_limits`
 * (migration 20261021100000) behind a service-role-only function.
 *
 * The address itself is never stored: only an HMAC of it, keyed with the server's
 * encryption secret so the hash can't be reversed by trying every IPv4 address.
 *
 * This throttles abuse; it is not an authorization check. If the counter can't be reached
 * the request goes through (WonderJobs applies its own limit and answers 429).
 */

export type CareersRateBucket = "apply" | "status";

/** The client's address as Vercel reports it: `x-real-ip`, else the first `x-forwarded-for` hop. */
export function clientAddress(h: Pick<Headers, "get">): string | null {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

export function hashClientAddress(address: string, secret: string | undefined = process.env.API_KEY_ENCRYPTION_SECRET): string {
  const input = `careers:${address}`;
  return secret ? createHmac("sha256", secret).update(input).digest("hex") : createHash("sha256").update(input).digest("hex");
}

/** True when this address has used up `limit` requests in `bucket` this hour. */
export async function careersRateLimited(bucket: CareersRateBucket, limit: number): Promise<boolean> {
  const address = clientAddress(await headers());
  if (!address) return false;
  try {
    const { data, error } = await createAdminClient({ schema: "platform" }).rpc("check_careers_rate_limit", {
      p_bucket: bucket,
      p_client_hash: hashClientAddress(address),
      p_limit: limit,
    });
    if (error) {
      console.error("careers: rate limit check failed", { bucket, code: error.code ?? "unknown" });
      return false;
    }
    return data === false;
  } catch {
    console.error("careers: rate limit check failed", { bucket, code: "client" });
    return false;
  }
}

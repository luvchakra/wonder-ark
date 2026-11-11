import { createClient } from "../db/server";
import { createAdminClient } from "../db/admin";
import { SITE_URL } from "../site";
import { createUnsubscribeToken, emailHash } from "./unsubscribe-token";

export type SuppressionReason = "unsubscribe" | "complaint" | "bounce" | "manual";

/** PRIV-1: whether `email` opted out of this business's email. Runs as the signed-in
 * user; `core.is_email_suppressed()` re-checks they belong to the business. */
export async function isEmailSuppressed(businessId: string, email: string): Promise<boolean> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("is_email_suppressed", { p_business_id: businessId, p_email: email });
  if (error) throw error;
  return data === true;
}

/** Records an opt-out from the public unsubscribe endpoint, where there is no session --
 * the verified token is the authorisation. Idempotent: a second click is a no-op. */
export async function recordUnsubscribe(businessId: string, hash: string, reason: SuppressionReason = "unsubscribe"): Promise<void> {
  const core = createAdminClient({ schema: "core" });
  const { error } = await core
    .from("communication_suppressions")
    .upsert({ business_id: businessId, email_hash: hash, reason }, { onConflict: "business_id,email_hash", ignoreDuplicates: true });
  // 23503: the business no longer exists, so nothing of theirs will be sent again anyway.
  if (error && (error as { code?: string }).code !== "23503") throw error;
}

/**
 * DISC-DATA-P0-04.3: a signed-in member adds an address to their business's own opt-out
 * list because the person asked not to be contacted. It is the list every outreach send
 * checks (`prepareOutreachEmail`), so no later email from this business reaches the
 * address, whoever drafts it. Runs as the caller: the table's insert policy requires a
 * member who may write for the business and `created_by = auth.uid()`. Only the hash is
 * stored. Idempotent: an address already on the list is left as it is.
 */
export async function suppressEmailOnRequest(businessId: string, email: string): Promise<void> {
  const supabase = await createClient({ schema: "core" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("communication_suppressions")
    .upsert(
      { business_id: businessId, email_hash: emailHash(email), reason: "manual", created_by: user.id },
      { onConflict: "business_id,email_hash", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export type OutreachCompliance =
  | { suppressed: true }
  | { suppressed: false; unsubscribeUrl: string; headers: Record<string, string> };

/**
 * What every outreach send needs before it goes out: whether the recipient opted out (in
 * which case it must not be sent), and otherwise the unsubscribe link for the footer and
 * the RFC 8058 headers that let mail clients offer one-click unsubscribe.
 */
export async function prepareOutreachEmail(businessId: string, to: string): Promise<OutreachCompliance> {
  if (await isEmailSuppressed(businessId, to)) return { suppressed: true };
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(businessId, emailHash(to)))}`;
  return {
    suppressed: false,
    unsubscribeUrl,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

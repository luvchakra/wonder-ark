import { createAdminClient } from "../db/admin";
import { getCreditPlan } from "./plans";
import { createRazorpayOrder } from "./razorpay";

/**
 * Order creation and payment-crediting both run through the admin client (bypasses RLS)
 * rather than the RLS-scoped one -- see core_ai_credit_purchases.sql's own comment for
 * why: there is deliberately no authenticated insert/update policy on either table, so a
 * founder's own browser session can never write a "paid" purchase or credit itself runs
 * directly. `createPendingCreditPurchase` still only ever writes the accountId its own
 * server action resolved from the caller's session (never a client-supplied one), so
 * using the admin client here doesn't open a cross-tenant write -- it's the same
 * authorization the RLS policy would have enforced, just checked in code instead of by
 * Postgres, because a service-role write path was already required for the (fully
 * unauthenticated) payment webhook regardless.
 */
function adminCoreClient() {
  return createAdminClient({ schema: "core" });
}

export type PendingCreditPurchase = {
  purchaseId: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amountInrPaise: number;
  planLabel: string;
};

/** Starts a purchase: creates the Razorpay order, then records it as 'created' so the
 * webhook (or the client-reported payment signature, whichever arrives first) has a row
 * to credit. Throws RazorpayNotConfiguredError when Razorpay has no keys (Billing →
 * Providers, else RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET) -- callers should surface that as
 * "buying credits isn't available yet", not a generic failure. */
export async function createPendingCreditPurchase(accountId: string, planKey: string): Promise<PendingCreditPurchase> {
  const plan = getCreditPlan(planKey);
  if (!plan) throw new Error(`Unknown credit plan "${planKey}".`);

  const supabase = adminCoreClient();
  const { data: purchase, error: insertError } = await supabase
    .from("ai_credit_purchases")
    .insert({
      account_id: accountId,
      plan_key: plan.key,
      credited_runs: plan.credited_runs,
      amount_inr_paise: plan.amount_inr_paise,
      razorpay_order_id: "pending", // placeholder, overwritten below -- the unique constraint needs *some* value first
      status: "created",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  try {
    const order = await createRazorpayOrder({
      amountInrPaise: plan.amount_inr_paise,
      receipt: purchase.id,
      notes: { account_id: accountId, plan_key: plan.key },
    });

    const { error: updateError } = await supabase
      .from("ai_credit_purchases")
      .update({ razorpay_order_id: order.id })
      .eq("id", purchase.id);
    if (updateError) throw updateError;

    return {
      purchaseId: purchase.id,
      razorpayOrderId: order.id,
      razorpayKeyId: order.keyId,
      amountInrPaise: plan.amount_inr_paise,
      planLabel: plan.label,
    };
  } catch (error) {
    // Order creation failed -- don't leave a dangling 'created' purchase with a fake
    // order id behind; mark it failed so it doesn't show as a stuck/pending purchase.
    await supabase.from("ai_credit_purchases").update({ status: "failed" }).eq("id", purchase.id);
    throw error;
  }
}

/** Marks a purchase paid and credits its runs -- delegates to the Postgres function
 * (core_ai_credit_purchases.sql) that does both atomically and idempotently, rather than
 * two separate application-level writes that could partially fail or double-credit on a
 * webhook retry. */
export async function markCreditPurchasePaid(purchaseId: string, paymentId: string, signature: string): Promise<void> {
  const supabase = adminCoreClient();
  const { error } = await supabase.rpc("credit_ai_purchase_paid", {
    p_purchase_id: purchaseId,
    p_payment_id: paymentId,
    p_signature: signature,
  });
  if (error) throw error;
}

/** Looks up a purchase by its Razorpay order id -- what both the webhook payload and the
 * client-reported payment success carry, not our own purchase id. */
export async function getCreditPurchaseByOrderId(
  razorpayOrderId: string,
): Promise<{ id: string; account_id: string } | null> {
  const supabase = adminCoreClient();
  const { data, error } = await supabase
    .from("ai_credit_purchases")
    .select("id, account_id")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

import { NextResponse } from "next/server";
import { createClient } from "@cofounderai/core/db/server";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { verifyRazorpayPaymentSignature } from "@cofounderai/core/billing/razorpay";
import { getCreditPurchaseByOrderId, markCreditPurchasePaid } from "@cofounderai/core/billing/mutations";

/**
 * Client-reported payment success (Checkout.js's own `handler` callback, right after the
 * founder completes payment) -- verifies the signature Razorpay hands back to the client
 * and, if it checks out, credits the purchase immediately so the Billing page can update
 * without waiting on the webhook (apps/web/app/api/webhooks/razorpay/route.ts), which is
 * the actual source of truth and will also credit it independently if this call never
 * happens (closed tab, network drop) -- markCreditPurchasePaid is idempotent either way.
 */
export async function POST(request: Request) {
  // E2E-DEF-003: authenticate before touching `core` -- the anonymous role has no usage
  // on that schema, so an unauthenticated call used to crash with a 500 (42501) here
  // instead of being refused with a 401.
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    purchaseId?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  } | null;

  if (!body?.purchaseId || !body.razorpayOrderId || !body.razorpayPaymentId || !body.razorpaySignature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const valid = await verifyRazorpayPaymentSignature(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature);
  if (!valid) return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });

  // The signature proves a payment against *this order* -- so the purchase credited is
  // the one that order belongs to, and only if it is the caller's own. The client's
  // purchaseId is a cross-check, never the thing credited: trusting it let one small
  // paid order mark a different, larger purchase paid.
  const purchase = await getCreditPurchaseByOrderId(body.razorpayOrderId);
  if (!purchase || purchase.account_id !== account.id || purchase.id !== body.purchaseId) {
    return NextResponse.json({ error: "Payment does not match this purchase" }, { status: 400 });
  }

  await markCreditPurchasePaid(purchase.id, body.razorpayPaymentId, body.razorpaySignature);
  return NextResponse.json({ ok: true });
}

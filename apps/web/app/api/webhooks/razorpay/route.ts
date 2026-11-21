import { NextResponse } from "next/server";
import { verifyRazorpayWebhookSignature } from "@cofounderai/core/billing/razorpay";
import { getCreditPurchaseByOrderId, markCreditPurchasePaid } from "@cofounderai/core/billing/mutations";

/**
 * Razorpay's own webhook -- point Razorpay's dashboard (Settings > Webhooks) at this URL
 * for the `payment.captured` event, and set RAZORPAY_WEBHOOK_SECRET to the signing secret
 * it gives you there. This is the source of truth for crediting a purchase: the
 * client-reported payment signature (verified by createPendingCreditPurchase's caller,
 * the Billing page's checkout handler) is a same-tab convenience so the UI can update
 * immediately, but a closed tab or a network hiccup right after payment shouldn't mean
 * the founder paid and never got their credits -- this webhook still lands independently
 * of whether the client-side handler ever ran.
 */
type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!(await verifyRazorpayWebhookSignature(rawBody, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
  if (payload.event !== "payment.captured") {
    // Not the event this purchase flow cares about (Razorpay sends many event types to
    // the same webhook URL) -- acknowledge so Razorpay doesn't retry it forever.
    return NextResponse.json({ ok: true });
  }

  const orderId = payload.payload?.payment?.entity?.order_id;
  const paymentId = payload.payload?.payment?.entity?.id;
  if (!orderId || !paymentId) {
    return NextResponse.json({ error: "Unrecognized payload" }, { status: 400 });
  }

  const purchase = await getCreditPurchaseByOrderId(orderId);
  if (!purchase) {
    // An order this deployment never created (a different environment's test payment,
    // for example) -- acknowledge rather than error, there's nothing to retry into.
    return NextResponse.json({ ok: true });
  }

  await markCreditPurchasePaid(purchase.id, paymentId, signature!);
  return NextResponse.json({ ok: true });
}

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay's own REST API + webhook signature scheme, called directly with `fetch` and
 * Node's built-in `crypto` rather than pulling in the `razorpay` npm package -- order
 * creation is one plain authenticated POST, and signature verification is a single
 * HMAC-SHA256 check, so a whole SDK dependency isn't earning its keep for that (CLAUDE.md
 * principle 2). Same reasoning already applied to Resend's webhook in
 * apps/web/app/api/webhooks/email-status/route.ts.
 */

export class RazorpayNotConfiguredError extends Error {
  constructor() {
    super("Razorpay is not configured: set its keys on Platform Admin → Billing → Providers.");
    this.name = "RazorpayNotConfiguredError";
  }
}

export type RazorpayCredentials = { keyId: string; keySecret: string; webhookSecret: string | null };

/**
 * PLATFORM-P1-14.3: the keys AI-credit purchases use. The ones saved on Platform Admin →
 * Billing → Providers (`platform.billing_providers`, encrypted) come first -- the same keys
 * subscriptions use -- so nothing has to be set in the deployment. The deployment's
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET stay a fallback, and are
 * also the answer when the store cannot be read. `load` is injectable for tests.
 */
export async function getRazorpayCredentials(
  load: () => Promise<{ publicKey: string | null; secretKey: string | null; webhookSecret: string | null } | null> = async () =>
    (await import("./provider-config")).loadProviderConfig("razorpay"),
  env: Record<string, string | undefined> = process.env,
): Promise<RazorpayCredentials | null> {
  let saved: Awaited<ReturnType<typeof load>> = null;
  try {
    saved = await load();
  } catch (cause) {
    console.error("[billing] Could not read Razorpay's keys from Platform Admin; using the deployment's.", cause instanceof Error ? cause.message : cause);
  }
  const keyId = saved?.publicKey || env.RAZORPAY_KEY_ID;
  const keySecret = saved?.secretKey || env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: saved?.webhookSecret || env.RAZORPAY_WEBHOOK_SECRET || null };
}

async function getCredentials(): Promise<RazorpayCredentials> {
  const credentials = await getRazorpayCredentials();
  if (!credentials) throw new RazorpayNotConfiguredError();
  return credentials;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

/** Creates a Razorpay order -- the object the client-side Checkout.js widget needs to
 * open a payment sheet against. `receipt` is our own purchase row's id, echoed back on
 * the payment webhook so credit_ai_purchase_paid() can look the purchase up by it. */
export async function createRazorpayOrder(input: {
  amountInrPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder & { keyId: string }> {
  const { keyId, keySecret } = await getCredentials();
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: input.amountInrPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Razorpay order creation failed (${response.status}): ${body}`);
  }

  return { ...((await response.json()) as RazorpayOrder), keyId };
}

/** Verifies the `x-razorpay-signature` header on a webhook delivery -- HMAC-SHA256 of the
 * raw request body, keyed by the webhook secret (saved on Billing → Providers, else RAZORPAY_WEBHOOK_SECRET; set separately from the API key/
 * secret pair in Razorpay's dashboard, under Webhooks). `timingSafeEqual` so this doesn't
 * leak timing information about how much of the signature matched. */
export async function verifyRazorpayWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = (await getRazorpayCredentials().catch(() => null))?.webhookSecret;
  if (!secret || !signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signatureHeader, "hex");
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

/** Verifies the signature Checkout.js itself hands back on successful payment
 * (`razorpay_signature`) -- HMAC-SHA256 of `"{order_id}|{payment_id}"`, keyed by the API
 * secret (not the separate webhook secret). Razorpay recommends checking this
 * client-reported signature too, not relying on the webhook alone, since the webhook can
 * be delayed; either one succeeding is enough to credit the purchase. */
export async function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const { keySecret } = await getCredentials();
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signature, "hex");
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

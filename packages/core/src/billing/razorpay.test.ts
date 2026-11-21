/**
 * PLATFORM-P1-14.3: AI-credit purchases use Razorpay's keys saved on Platform Admin →
 * Billing → Providers, so nothing has to be set in the deployment. The deployment's
 * variables are only a fallback, including when the store cannot be read.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getRazorpayCredentials } from "./razorpay";

const saved = { publicKey: "rzp_live_saved", secretKey: "saved-secret", webhookSecret: "saved-hook" };
const env = { RAZORPAY_KEY_ID: "rzp_live_env", RAZORPAY_KEY_SECRET: "env-secret", RAZORPAY_WEBHOOK_SECRET: "env-hook" };

describe("getRazorpayCredentials", () => {
  it("uses the keys saved on the platform, over the deployment's", async () => {
    expect(await getRazorpayCredentials(async () => saved, env)).toEqual({ keyId: "rzp_live_saved", keySecret: "saved-secret", webhookSecret: "saved-hook" });
  });

  it("needs no deployment variable when the platform has the keys", async () => {
    expect(await getRazorpayCredentials(async () => saved, {})).toMatchObject({ keyId: "rzp_live_saved", keySecret: "saved-secret" });
  });

  it("falls back to the deployment's variables when nothing is saved", async () => {
    expect(await getRazorpayCredentials(async () => null, env)).toEqual({ keyId: "rzp_live_env", keySecret: "env-secret", webhookSecret: "env-hook" });
    expect(await getRazorpayCredentials(async () => ({ publicKey: null, secretKey: null, webhookSecret: null }), env)).toMatchObject({ keyId: "rzp_live_env" });
  });

  it("falls back, and logs no key, when the platform's store cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getRazorpayCredentials(async () => { throw new Error("db down"); }, env)).toMatchObject({ keyId: "rzp_live_env" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("env-secret");
    error.mockRestore();
  });

  it("reports Razorpay as not configured when neither has the key pair", async () => {
    expect(await getRazorpayCredentials(async () => null, {})).toBeNull();
    expect(await getRazorpayCredentials(async () => ({ publicKey: "rzp_live_x", secretKey: null, webhookSecret: null }), {})).toBeNull();
  });
});

describe("signature checks use the platform's keys", () => {
  it("verifies a webhook and a payment against the saved secrets", async () => {
    vi.resetModules();
    vi.doMock("./provider-config", () => ({ loadProviderConfig: async () => saved }));
    const { verifyRazorpayWebhookSignature, verifyRazorpayPaymentSignature } = await import("./razorpay");
    const body = '{"event":"payment.captured"}';
    expect(await verifyRazorpayWebhookSignature(body, createHmac("sha256", "saved-hook").update(body).digest("hex"))).toBe(true);
    expect(await verifyRazorpayWebhookSignature(body, createHmac("sha256", "env-hook").update(body).digest("hex"))).toBe(false);
    expect(await verifyRazorpayPaymentSignature("o1", "p1", createHmac("sha256", "saved-secret").update("o1|p1").digest("hex"))).toBe(true);
    vi.doUnmock("./provider-config");
  });
});

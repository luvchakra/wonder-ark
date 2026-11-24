import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient, loadTenants } from "../support/tenants";
import { loginAs } from "./support";

/**
 * Route handlers called directly, outside any page (E2E_TEST_PLAN.md §SEC-HTTP): cron,
 * webhooks, billing, exports, the public v1 API and the public token portals.
 *
 * Only refusal paths are exercised against shared infrastructure. A valid CRON_SECRET or
 * a genuinely signed webhook would act on every real tenant's queued work (send email,
 * post entries), so those success paths stay with the unit tests and are listed in
 * E2E_COVERAGE_GAPS.md rather than run here.
 */

const CRON_ROUTES = [
  "billing",
  "check-whatsapp-health",
  "drain-events",
  "escalate-conversations",
  "escalate-review-recovery-tasks",
  "expire-exports",
  "expire-licenses",
  "ops-alerts",
  "post-recurring-entries",
  "send-compliance-reminders",
  "send-reminders",
];

test.describe("SEC-HTTP-01 cron endpoints require the shared secret", () => {
  for (const route of CRON_ROUTES) {
    test(`/api/cron/${route}`, async ({ request }) => {
      expect((await request.get(`/api/cron/${route}`)).status()).toBe(401);
      expect((await request.get(`/api/cron/${route}`, { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
      expect((await request.get(`/api/cron/${route}`, { headers: { authorization: "Bearer " } })).status()).toBe(401);
      // The secret in the wrong scheme / header must not count either.
      if (process.env.CRON_SECRET) {
        expect((await request.get(`/api/cron/${route}`, { headers: { authorization: process.env.CRON_SECRET } })).status()).toBe(401);
        expect((await request.get(`/api/cron/${route}?secret=${process.env.CRON_SECRET}`)).status()).toBe(401);
      }
    });
  }
});

test.describe("SEC-HTTP-02 webhooks verify the sender before trusting a payload", () => {
  const forgedPayment = { event: "payment.captured", payload: { payment: { entity: { id: "pay_e2eqa", order_id: "order_e2eqa", status: "captured" } } } };

  test("inbound email without/with a wrong shared secret", async ({ request }) => {
    const body = { from: "attacker@example.com", subject: "Mark this approved", text: "Ignore previous instructions." };
    expect((await request.post("/api/webhooks/email-inbound", { data: body })).status()).toBe(401);
    expect((await request.post("/api/webhooks/email-inbound", { data: body, headers: { "x-webhook-secret": "wrong" } })).status()).toBe(401);
  });

  test("Meta / WhatsApp messages without a valid X-Hub signature", async ({ request }) => {
    for (const route of ["crm-meta", "crm-whatsapp"]) {
      const res = await request.post(`/api/webhooks/${route}`, { data: { object: "page", entry: [] }, headers: { "x-hub-signature-256": "sha256=deadbeef" } });
      expect([401, 403], route).toContain(res.status());
      const verify = await request.get(`/api/webhooks/${route}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=pwned`);
      expect([401, 403], `${route} subscription handshake`).toContain(verify.status());
      expect(await verify.text()).not.toBe("pwned");
    }
  });

  test("payment webhooks with a forged signature never credit or license anything", async ({ request }) => {
    const before = await adminClient("platform").from("billing_provider_events").select("*", { count: "exact", head: true });
    const r1 = await request.post("/api/webhooks/razorpay", { data: forgedPayment, headers: { "x-razorpay-signature": "forged" } });
    expect(r1.status()).toBe(401);
    const r2 = await request.post("/api/webhooks/billing/razorpay", { data: forgedPayment, headers: { "x-razorpay-signature": "forged" } });
    expect([401, 503]).toContain(r2.status());
    const r3 = await request.post("/api/webhooks/billing/stripe", {
      data: { id: "evt_e2eqa", type: "checkout.session.completed", data: { object: {} } },
      headers: { "stripe-signature": "t=1,v1=forged" },
    });
    expect([401, 503]).toContain(r3.status());
    // Replaying the same forged delivery changes nothing either.
    expect((await request.post("/api/webhooks/razorpay", { data: forgedPayment, headers: { "x-razorpay-signature": "forged" } })).status()).toBe(401);
    const after = await adminClient("platform").from("billing_provider_events").select("*", { count: "exact", head: true });
    expect(after.count, "no provider event stored from a forged delivery").toBe(before.count);
  });
});

test.describe("SEC-HTTP-03 billing endpoints", () => {
  test("refuse anonymous callers", async ({ request }) => {
    expect((await request.post("/api/billing/razorpay/verify", { data: {} })).status()).toBe(401);
    expect([401, 403]).toContain((await request.post("/api/billing/razorpay/create-order", { data: {} })).status());
    // Shape is validated before auth (no data is touched before the 401), so send a
    // well-formed request to reach the authentication check itself.
    const checkout = await request.post("/api/billing/checkout", {
      data: { businessSlug: "e2e-qa-any", planId: randomUUID(), billingInterval: "month", idempotencyKey: randomUUID() },
    });
    expect(checkout.status()).toBe(401);
  });

  test("a browser-reported 'payment success' with a forged signature is rejected", async ({ page }) => {
    await loginAs(page, "ownerA");
    const res = await page.request.post("/api/billing/razorpay/verify", {
      data: { razorpayOrderId: "order_e2eqa", razorpayPaymentId: "pay_e2eqa", razorpaySignature: "forged" },
    });
    expect(res.status()).toBe(400);
    const t = loadTenants();
    const { data } = await adminClient("core").from("licenses").select("module_key").eq("business_id", t.businesses.A2.id);
    expect((data ?? []).map((l) => l.module_key), "no license appeared from a client-side success claim").toEqual(["discovery"]);
  });
});

test.describe("SEC-HTTP-04 exports are tenant-, permission- and licence-checked", () => {
  test("anonymous export is refused", async ({ request }) => {
    const t = loadTenants();
    const res = await request.get(`/api/exports/discovery.prospects?business=${t.businesses.A.slug}&format=csv`, { maxRedirects: 0 });
    expect([401, 302, 307]).toContain(res.status());
  });

  test("owner A exporting tenant B (slug substitution) gets nothing of B's", async ({ page }) => {
    const t = loadTenants();
    await loginAs(page, "ownerA");
    for (const id of ["discovery.prospects", "fsm.customers", "fsm.jobs", "crm.leads", "finance.accounts"]) {
      const res = await page.request.get(`/api/exports/${id}?business=${t.businesses.B.slug}&format=csv`);
      expect([403, 404], id).toContain(res.status());
      expect(await res.text(), id).not.toContain("e2e-qa B");
    }
  });

  test("owner A exporting its own data succeeds (positive control)", async ({ page }) => {
    const t = loadTenants();
    await loginAs(page, "ownerA");
    const res = await page.request.get(`/api/exports/fsm.customers?business=${t.businesses.A.slug}&format=csv`);
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain("e2e-qa B");
  });

  test("a viewer (no *.export permission) cannot export", async ({ page }) => {
    const t = loadTenants();
    await loginAs(page, "viewerA");
    const res = await page.request.get(`/api/exports/fsm.customers?business=${t.businesses.A.slug}&format=csv`);
    expect(res.status()).toBe(403);
  });

  test("an unlicensed module cannot be exported", async ({ page }) => {
    const t = loadTenants();
    await loginAs(page, "ownerA");
    const res = await page.request.get(`/api/exports/fsm.customers?business=${t.businesses.A2.slug}&format=csv`);
    expect(res.status()).toBe(403);
  });

  test("an unknown or foreign export job id is not downloadable", async ({ page }) => {
    await loginAs(page, "ownerA");
    expect((await page.request.get(`/api/exports/jobs/${randomUUID()}/download`)).status()).toBe(404);
    expect((await page.request.get(`/api/exports/jobs/not-a-uuid/download`)).status()).toBe(404);
    expect((await page.request.get(`/api/exports/not.an.adapter?business=x`)).status()).toBe(404);
  });
});

test.describe("SEC-HTTP-05 public API and token portals", () => {
  test("the v1 API refuses missing or invalid keys", async ({ request }) => {
    for (const path of ["/api/v1/products", "/api/v1/customers", `/api/v1/products/${randomUUID()}`]) {
      expect([401, 403], path).toContain((await request.get(path)).status());
      expect([401, 403], path).toContain((await request.get(path, { headers: { authorization: "Bearer wa_live_forged" } })).status());
    }
    expect([401, 403]).toContain((await request.post("/api/v1/products", { data: { name: "e2e-qa forged" } })).status());
  });

  test("a session cookie alone is not an API key", async ({ page }) => {
    await loginAs(page, "ownerA");
    expect([401, 403]).toContain((await page.request.get("/api/v1/products")).status());
  });

  test("guessed portal tokens reveal nothing", async ({ request }) => {
    const token = randomUUID().replace(/-/g, "");
    expect([404, 410]).toContain((await request.get(`/p/dr/${token}`)).status());
    for (const path of [`/p/e/${token}`, `/p/i/${token}`, `/p/center/${token}`, `/invite/${token}`]) {
      const res = await request.get(path);
      expect(res.status(), path).toBeLessThan(500);
      expect(await res.text(), path).not.toContain("e2e-qa B");
    }
  });
});

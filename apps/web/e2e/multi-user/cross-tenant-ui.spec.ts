import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { adminClient, loadTenants, userClient } from "../support/tenants";
import { expectRefused, loginAs, watchForErrors } from "./support";

/**
 * The browser half of the multi-user security suite (E2E_TEST_PLAN.md §AUTH, §SEC-UI,
 * §SEC-PLAT). Each test signs in as a seeded user through the real login form and then
 * does what a curious or hostile user would: edit the URL.
 */

const B_MARKERS = ["e2e-qa Tenant B", "e2e-qa B Customer", "e2e-qa B Offering", "e2e-qa B Prospect", "e2e-qa B Job", "e2e-qa B Item"];

test.describe("AUTH journeys", () => {
  test("AUTH-01 wrong password is refused and stays signed out", async ({ page }) => {
    const t = loadTenants();
    await page.goto("/login");
    await page.getByLabel("Email").fill(t.users.ownerA.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-02 session persists across reloads and new tabs, then logout ends it", async ({ page, context }, testInfo) => {
    const errors = watchForErrors(page, testInfo);
    await loginAs(page, "ownerA");
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    const second = await context.newPage();
    await second.goto("/dashboard");
    await expect(second).toHaveURL(/\/dashboard/);
    await second.close();

    await context.clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    errors.assertClean();
  });

  test("AUTH-03 a tampered session cookie is treated as signed out", async ({ page, context }) => {
    await loginAs(page, "ownerA");
    const cookies = await context.cookies();
    const auth = cookies.filter((c) => c.name.includes("auth-token"));
    expect(auth.length).toBeGreaterThan(0);
    await context.clearCookies();
    await context.addCookies(auth.map((c) => ({ ...c, value: `${c.value.slice(0, -12)}AAAAAAAAAAAA` })));
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-04 protected business URLs redirect an anonymous visitor to login", async ({ page }) => {
    const t = loadTenants();
    for (const path of [`/${t.businesses.A.slug}/discovery/dashboard`, `/${t.businesses.B.slug}/finance/accounts`, "/dashboard/settings", "/platform"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });
});

test.describe("SEC-UI cross-tenant URL manipulation (owner of A)", () => {
  test("SEC-UI-01 tenant B's own URLs show nothing of B", async ({ page }, testInfo) => {
    test.setTimeout(120_000); // several full page loads against the remote dev project
    const t = loadTenants();
    const errors = watchForErrors(page, testInfo);
    await loginAs(page, "ownerA");
    const b = t.businesses.B.slug;
    for (const path of [
      `/${b}/discovery/dashboard`,
      `/${b}/business`,
      `/${b}/inventory/products`,
      `/${b}/crm/leads`,
      `/${b}/service/jobs`,
      `/${b}/finance/accounts`,
      `/${b}/admin/users`,
      `/${b}/billing`,
      `/${b}/discovery/offerings/${t.b.productId}`,
      `/${b}/discovery/offerings/${t.b.productId}/prospects/${t.b.prospectId}`,
      `/${b}/service/jobs/${t.b.jobId}`,
      `/${b}/crm/customers/${t.b.partyId}`,
    ]) {
      await page.goto(path);
      await expectRefused(page, B_MARKERS);
    }
    errors.assertClean();
  });

  test("SEC-UI-02 B's record ids under A's own slug show nothing of B", async ({ page }, testInfo) => {
    test.setTimeout(120_000); // several full page loads against the remote dev project
    const t = loadTenants();
    const errors = watchForErrors(page, testInfo);
    await loginAs(page, "ownerA");
    const a = t.businesses.A.slug;
    for (const path of [
      `/${a}/discovery/offerings/${t.b.productId}`,
      `/${a}/discovery/offerings/${t.b.productId}/prospects`,
      `/${a}/discovery/offerings/${t.a.productId}/prospects/${t.b.prospectId}`,
      `/${a}/service/jobs/${t.b.jobId}`,
      `/${a}/service/invoices/${t.b.documentId}`,
      `/${a}/crm/customers/${t.b.partyId}`,
      `/${a}/finance/documents/${t.b.documentId}`,
    ]) {
      await page.goto(path);
      await expectRefused(page, B_MARKERS);
    }
    errors.assertClean();
  });

  test("SEC-UI-03 the business switcher only offers the user's own businesses", async ({ page }) => {
    const t = loadTenants();
    await loginAs(page, "ownerA");
    await page.goto("/dashboard");
    await expect(page.getByText(t.businesses.B.name)).toHaveCount(0);
  });

  test("SEC-UI-04 a user with no business cannot enter one by URL", async ({ page }) => {
    test.setTimeout(120_000); // several full page loads against the remote dev project
    const t = loadTenants();
    await loginAs(page, "outsider");
    for (const path of [`/${t.businesses.A.slug}/discovery/dashboard`, `/${t.businesses.A.slug}/admin/users`]) {
      await page.goto(path);
      await expectRefused(page, ["Acme Home Security QA", "e2e-qa A Customer", "e2e-qa A Offering"]);
    }
  });
});

test.describe("SEC-LIC-UI licensing in the browser", () => {
  test("an unlicensed module's routes show the not-licensed page, not the module", async ({ page }) => {
    test.setTimeout(120_000); // several full page loads against the remote dev project
    const t = loadTenants();
    await loginAs(page, "ownerA");
    for (const path of ["inventory/dashboard", "service/jobs", "crm/leads", "finance/accounts"]) {
      const response = await page.goto(`/${t.businesses.A2.slug}/${path}`);
      expect(response?.status(), path).toBeLessThan(500);
      await expect(page.getByRole("heading", { level: 1 }), path).toContainText(/not (licensed|available|included)|isn.t (licensed|included|part)|licen[cs]e/i);
    }
    // The licensed module still opens.
    await page.goto(`/${t.businesses.A2.slug}/discovery/dashboard`);
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText(/not licensed/i);
  });
});

test.describe("SEC-RBAC-UI roles in the browser", () => {
  test("a viewer sees no invite control, and an inventory manager can't manage users", async ({ page }) => {
    test.setTimeout(120_000); // several full page loads against the remote dev project
    const t = loadTenants();
    await loginAs(page, "viewerA");
    await page.goto(`/${t.businesses.A.slug}/admin/users`);
    await expect(page.getByRole("button", { name: "Invite user" })).toHaveCount(0);
    await page.goto(`/${t.businesses.A.slug}/admin/roles/new`);
    await expect(page.getByRole("button", { name: "Create role" })).toHaveCount(0);
  });
});

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) -- what an authenticator app computes. */
function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of base32Secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

const PLATFORM_PAGES = [
  "/platform",
  "/platform/modules",
  "/platform/plans",
  "/platform/billing",
  "/platform/billing/subscriptions",
  "/platform/billing/payments",
  "/platform/billing/events",
  "/platform/billing/providers",
  "/platform/ai-providers",
  "/platform/ai-routing",
  "/platform/ai-usage",
  "/platform/ai-feature-policies",
  "/platform/audit",
  "/platform/feature-flags",
  "/platform/email-provider",
  "/platform/email-templates",
  "/platform/integrations",
  "/platform/notification-policies",
  "/platform/system-policies",
  "/platform/announcements",
  "/platform/branding",
  "/platform/compliance",
  "/platform/config-history",
];

test.describe("SEC-PLAT platform administration", () => {
  test("a tenant owner is turned away from every /platform page", async ({ page }) => {
    test.setTimeout(480_000); // 23 full page loads, each waiting out a client-side redirect
    await loginAs(page, "ownerA");
    const leaked: string[] = [];
    for (const path of PLATFORM_PAGES) {
      await page.goto(path);
      // app/platform/layout.tsx redirects a non-superadmin from inside a streamed layout,
      // which Next completes client-side -- wait for it rather than reading the URL early.
      const left = await page
        .waitForURL((url) => !url.pathname.startsWith("/platform") || url.pathname.startsWith("/platform/mfa"), { timeout: 15_000 })
        .then(() => true, () => false);
      if (!left) leaked.push(path);
    }
    expect(leaked, "platform pages a tenant owner stayed on").toEqual([]);
  });

  // PLATFORM-P0-01.2: a layout that redirects does not stop its page from rendering, and
  // what the page rendered used to go out in the body of the redirect. Read the raw answer,
  // without following it: a redirect to the dashboard, with no page in its body.
  test("a tenant owner's request for a /platform page is answered with a redirect and no page", async ({ page }) => {
    await loginAs(page, "ownerA");
    const leaked: string[] = [];
    for (const path of [...PLATFORM_PAGES, "/platform/health", "/platform/keys", "/platform/mfa"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      const location = response.headers()["location"] ?? "";
      const body = await response.text();
      const redirected = response.status() >= 300 && response.status() < 400 && new URL(location, "http://x").pathname === "/dashboard";
      // A redirect's body is at most its destination ("/dashboard"): never markup.
      if (!redirected || body.length > 64 || body.includes("<")) leaked.push(`${path} (${response.status()} → ${location || "no redirect"}, ${body.length} bytes)`);
    }
    expect(leaked, "platform pages that answered a tenant owner with something other than a bare redirect").toEqual([]);
  });

  test("enrolling a second factor does not make a tenant owner a platform admin", async ({ page }) => {
    test.setTimeout(480_000); // 23 full page loads, each waiting out a client-side redirect
    const t = loadTenants();
    // Enroll + verify a TOTP factor for ownerB exactly as an authenticator app would,
    // then sign in with both factors -- an aal2 session that is still not a superadmin.
    // Start from no factors, whatever an earlier (kept-fixture) run left behind.
    const mfaAdmin = adminClient().auth.admin.mfa;
    const existing = await mfaAdmin.listFactors({ userId: t.users.ownerB.id });
    for (const factor of existing.data?.factors ?? []) await mfaAdmin.deleteFactor({ id: factor.id, userId: t.users.ownerB.id });
    const { client } = await userClient(t.users.ownerB.email, t.password);
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `e2e-qa-${Date.now()}` });
    expect(enrolled.error).toBeNull();
    const secret = enrolled.data!.totp.secret;
    expect((await client.auth.mfa.challengeAndVerify({ factorId: enrolled.data!.id, code: totp(secret) })).error).toBeNull();

    await loginAs(page, "ownerB");
    await page.goto("/platform/mfa");
    if (new URL(page.url()).pathname.startsWith("/platform/mfa")) {
      await page.getByLabel("6-digit code").fill(totp(secret));
      await page.getByRole("button", { name: "Verify and continue" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/platform/mfa"), { timeout: 30_000 });
    }
    const leaked: string[] = [];
    for (const path of PLATFORM_PAGES) {
      await page.goto(path);
      await page.waitForURL((url) => !url.pathname.startsWith("/platform"), { timeout: 15_000 }).catch(() => undefined);
      const onPlatform = new URL(page.url()).pathname.startsWith("/platform");
      const tables = await page.getByRole("table").count();
      if (onPlatform && tables > 0) leaked.push(path);
    }
    expect(leaked, "platform pages that rendered data for an aal2 non-admin").toEqual([]);
  });
});

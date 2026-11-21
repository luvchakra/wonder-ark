/**
 * PLATFORM-P1-10.17: two environment-controlled lists. PLATFORM_ADMIN_EMAILS opens
 * WonderArk's own console; BUSINESS_ADMIN_EMAILS opens only the account tools at
 * /dashboard/admin. A platform admin may use the account tools; the reverse is never true.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isBusinessAdminEmail, isPlatformAdminEmail } from "./platform-admin-emails";

const saved = { platform: process.env.PLATFORM_ADMIN_EMAILS, business: process.env.BUSINESS_ADMIN_EMAILS };

beforeEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.BUSINESS_ADMIN_EMAILS;
});
afterEach(() => {
  process.env.PLATFORM_ADMIN_EMAILS = saved.platform;
  process.env.BUSINESS_ADMIN_EMAILS = saved.business;
  if (saved.platform === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  if (saved.business === undefined) delete process.env.BUSINESS_ADMIN_EMAILS;
});

describe("the two admin lists", () => {
  it("lets nobody in when neither variable is set", () => {
    for (const email of ["owner@vendor.example", "", null, undefined]) {
      expect(isPlatformAdminEmail(email)).toBe(false);
      expect(isBusinessAdminEmail(email)).toBe(false);
    }
  });

  it("matches an email whatever its case, among several", () => {
    process.env.PLATFORM_ADMIN_EMAILS = " Owner@Vendor.example , second@vendor.example ";
    expect(isPlatformAdminEmail("owner@vendor.example")).toBe(true);
    expect(isPlatformAdminEmail("SECOND@vendor.example")).toBe(true);
    expect(isPlatformAdminEmail("third@vendor.example")).toBe(false);
  });

  it("gives a business admin the account tools and not the console", () => {
    process.env.BUSINESS_ADMIN_EMAILS = "support@vendor.example";
    expect(isBusinessAdminEmail("support@vendor.example")).toBe(true);
    expect(isPlatformAdminEmail("support@vendor.example")).toBe(false);
  });

  it("gives a platform admin the account tools too, with no second variable to set", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "owner@vendor.example";
    expect(isPlatformAdminEmail("owner@vendor.example")).toBe(true);
    expect(isBusinessAdminEmail("owner@vendor.example")).toBe(true);
  });

  it("keeps the lists apart when both are set", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "owner@vendor.example";
    process.env.BUSINESS_ADMIN_EMAILS = "support@vendor.example";
    expect(isPlatformAdminEmail("support@vendor.example")).toBe(false);
    expect(isBusinessAdminEmail("support@vendor.example")).toBe(true);
    expect(isBusinessAdminEmail("stranger@vendor.example")).toBe(false);
  });
});

/**
 * PLATFORM-P1-10.17: requireBusinessAdmin() is the gate on the account tools at
 * /dashboard/admin. It reads the signed-in person's email from the Auth server and checks
 * it against BUSINESS_ADMIN_EMAILS or PLATFORM_ADMIN_EMAILS; anyone else is refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("../db/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));

const { requireBusinessAdmin } = await import("./platform-admin");

const as = (email: string | null) => h.getUser.mockResolvedValue({ data: { user: email ? { id: "u1", email } : null } });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.BUSINESS_ADMIN_EMAILS;
});

describe("requireBusinessAdmin", () => {
  it("refuses a signed-out caller and anyone on neither list", async () => {
    process.env.BUSINESS_ADMIN_EMAILS = "support@vendor.example";
    as(null);
    await expect(requireBusinessAdmin()).rejects.toThrow("Forbidden");
    as("owner@tenant.example");
    await expect(requireBusinessAdmin()).rejects.toThrow("Forbidden");
  });

  it("refuses everyone when neither variable is set", async () => {
    as("support@vendor.example");
    await expect(requireBusinessAdmin()).rejects.toThrow("Forbidden");
  });

  it("lets a business admin through", async () => {
    process.env.BUSINESS_ADMIN_EMAILS = "support@vendor.example";
    as("Support@Vendor.example");
    await expect(requireBusinessAdmin()).resolves.toBeUndefined();
  });

  it("lets a platform admin through", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "owner@vendor.example";
    as("owner@vendor.example");
    await expect(requireBusinessAdmin()).resolves.toBeUndefined();
  });
});

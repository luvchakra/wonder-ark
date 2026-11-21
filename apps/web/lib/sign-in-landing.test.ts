/**
 * PLATFORM-P1-10.16: where a sign-in on the main address lands when no page was asked for.
 * A platform admin lands on the console; everyone else, and anything that cannot be
 * confirmed, on the dashboard. It is a destination only: the proxy still decides who is
 * served the console.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ onOrgAddress: vi.fn() }));
vi.mock("./org-host", () => ({ onOrgAddress: h.onOrgAddress }));

const { mainAddressLanding } = await import("./sign-in-landing");

function client(email: string | null, superadmin: { data: unknown; error: unknown } = { data: false, error: null }) {
  const rpc = vi.fn().mockResolvedValue(superadmin);
  return {
    rpc,
    auth: { getUser: async () => ({ data: { user: email ? { email } : null } }) },
    schema: () => ({ rpc }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PLATFORM_ADMIN_EMAILS;
  h.onOrgAddress.mockResolvedValue(false);
});

describe("mainAddressLanding", () => {
  it("lands an email in PLATFORM_ADMIN_EMAILS on the console without asking the database", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "owner@vendor.example";
    const c = client("Owner@Vendor.example");
    expect(await mainAddressLanding(c)).toBe("/platform");
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("lands a superadmin from the database on the console", async () => {
    expect(await mainAddressLanding(client("admin@vendor.example", { data: true, error: null }))).toBe("/platform");
  });

  it("lands everyone else on the dashboard", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "owner@vendor.example";
    expect(await mainAddressLanding(client("member@tenant.example"))).toBe("/dashboard");
    expect(await mainAddressLanding(client(null))).toBe("/dashboard");
  });

  it("never sends anyone to the console from an organization's address", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "owner@vendor.example";
    h.onOrgAddress.mockResolvedValue(true);
    expect(await mainAddressLanding(client("owner@vendor.example"))).toBe("/dashboard");
  });

  it("falls back to the dashboard when the role cannot be confirmed", async () => {
    expect(await mainAddressLanding(client("admin@vendor.example", { data: null, error: { message: "down" } }))).toBe("/dashboard");
    expect(await mainAddressLanding({ auth: {} })).toBe("/dashboard");
    h.onOrgAddress.mockRejectedValue(new Error("no request"));
    expect(await mainAddressLanding(client("admin@vendor.example", { data: true, error: null }))).toBe("/dashboard");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));
vi.mock("../db/admin", () => ({ createAdminClient: vi.fn() }));
// EMAIL-SMTP-01: no SMTP mailbox set up in these tests, so an invitation is not emailed.
vi.mock("../email/platform-mailer", () => ({ platformSender: async () => null, sendPlatformEmail: vi.fn() }));

const { modulesVisibleTo } = await import("./effective");
const { hashInvitationToken, inviteMember, changeMemberRole, createRole } = await import("./members");

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("RBAC-30 modulesVisibleTo", () => {
  it("shows a licensed module only when the role may open it", () => {
    const access = { roleKey: "viewer", roleName: "Viewer", permissions: new Set(["inventory.view", "crm.view"]) };
    expect(modulesVisibleTo(access, ["inventory", "crm", "gst", "fsm"])).toEqual(["inventory", "crm"]);
  });
  it("shows nothing to someone with no role in the business", () => {
    expect(modulesVisibleTo(undefined, ["inventory"])).toEqual([]);
  });
});

describe("RBAC-07 / RBAC-36 invitations", () => {
  it("stores only a SHA-256 of the token", () => {
    expect(hashInvitationToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken("abc")).not.toContain("abc");
  });

  it("sends the database a hash and an expiry, never the token", async () => {
    const fake = createFakeSupabase({ rpc: () => ({ data: "inv-1", error: null }) });
    createClient.mockResolvedValue(fake);
    const result = await inviteMember({ businessId: "00000000-0000-4000-8000-000000000001", email: " Neha@Acme.com ", roleId: "00000000-0000-4000-8000-000000000002" });
    expect(result).toEqual({ ok: true, value: { emailed: false } });
    const args = fake.rpcs("invite_member")[0]!.args;
    expect(args.p_email).toBe("neha@acme.com");
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(args.p_expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a malformed email before calling the database", async () => {
    const fake = createFakeSupabase();
    createClient.mockResolvedValue(fake);
    const result = await inviteMember({ businessId: "00000000-0000-4000-8000-000000000001", email: "nope", roleId: "00000000-0000-4000-8000-000000000002" });
    expect(result.ok).toBe(false);
    expect(fake.rpcs()).toHaveLength(0);
  });
});

describe("RBAC-10 / RBAC-13 database refusals", () => {
  it("passes the ceiling's own message through", async () => {
    createClient.mockResolvedValue(createFakeSupabase({ rpc: () => ({ data: null, error: { code: "42501", message: "You can't assign that role." } }) }));
    expect(await changeMemberRole("m", "r")).toEqual({ ok: false, error: "You can't assign that role." });
  });
  it("hides unexpected database errors", async () => {
    createClient.mockResolvedValue(createFakeSupabase({ rpc: () => ({ data: null, error: { code: "XX000", message: "internal detail" } }) }));
    expect(await createRole("b", { name: "Ops", permissionKeys: [] })).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });
});

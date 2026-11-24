import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type RecordedQuery } from "../test-support/fake-supabase";

const { createAdminClient, mailer } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  mailer: { sender: null as { fromEmail: string; fromName: string } | null, send: vi.fn() },
}));
vi.mock("../db/admin", () => ({ createAdminClient }));
// EMAIL-SMTP-01: billing emails go through the platform's SMTP mailbox.
vi.mock("../email/platform-mailer", () => ({
  platformSender: async () => mailer.sender,
  sendPlatformEmail: (...args: unknown[]) => mailer.send(...args),
}));

const { sendBillingEmail } = await import("./event-handlers");
const { getEventHandlers } = await import("../events/registry");
const { BILLING_NOTIFICATION_TYPES } = await import("./notifications");

const event = (type: string, payload: Record<string, unknown> = {}) =>
  ({ id: "evt-1", business_id: "biz-1", type, payload, required_module: null, status: "pending", attempts: 0, max_attempts: 5, next_attempt_at: "", last_error: null, published_at: "", processed_at: null }) as never;

function wire() {
  const fake = createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (call.table === "businesses") return { data: { name: "Acme", account_id: "acc-1" }, error: null };
      if (call.table === "account_members") return { data: [{ user_id: "u-owner" }], error: null };
      if (call.table === "business_settings") return { data: { slug: "acme" }, error: null };
      return { data: null, error: null };
    },
  }) as unknown as Record<string, unknown>;
  fake.auth = { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "owner@example.com" } } }) } };
  createAdminClient.mockReturnValue(fake);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("BILL-35 billing emails", () => {
  it("registers a handler for every billing notification, so none fails the drain", () => {
    for (const type of BILLING_NOTIFICATION_TYPES) expect(getEventHandlers(type).length).toBeGreaterThan(0);
  });

  it("does nothing when the SMTP mailbox isn't set up", async () => {
    mailer.sender = null;
    expect(await sendBillingEmail(event("billing.payment_failed"))).toBe("skipped");
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("emails the account's owners and admins with a link to the business's billing page", async () => {
    mailer.sender = { fromEmail: "billing@example.com", fromName: "WonderArk" };
    mailer.send.mockResolvedValue({ status: "sent", messageId: "<m1>" });
    wire();
    expect(await sendBillingEmail(event("billing.payment_failed", { amount: "₹2,999.00" }))).toBe("sent");
    const email = mailer.send.mock.calls[0]![0];
    expect(email.to).toEqual(["owner@example.com"]);
    expect(email.subject).toBe("Payment needs attention");
    expect(email.text).toContain("/acme/billing");
  });

  it("throws for a retry only when the email surely didn't go, never on an unknown outcome", async () => {
    mailer.sender = { fromEmail: "billing@example.com", fromName: "WonderArk" };
    wire();
    mailer.send.mockResolvedValueOnce({ status: "failed", reason: "The mail server refused the sign-in." });
    await expect(sendBillingEmail(event("billing.payment_failed"))).rejects.toThrow("refused the sign-in");
    mailer.send.mockResolvedValueOnce({ status: "unknown", reason: "Outcome unknown" });
    await expect(sendBillingEmail(event("billing.payment_failed"))).resolves.toBe("sent");
  });
});

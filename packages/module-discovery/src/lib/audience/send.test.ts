/**
 * DISC-CONS-P0-03.5 / 05.2: every email to a person goes through one gate: consent, not
 * unsubscribed, not on the business's opt-out list; and it carries their own unsubscribe
 * link in the footer and the one-click headers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, usedOp, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  prepareOutreachEmail: vi.fn(),
  loadMailboxForSending: vi.fn(),
  sendViaPlatform: vi.fn(),
  sendViaSmtp: vi.fn(),
  coreFrom: vi.fn(),
  coreRpc: vi.fn(),
}));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ prepareOutreachEmail: h.prepareOutreachEmail }));
vi.mock("@cofounderai/core/db/admin", () => ({
  createAdminClient: () => ({
    rpc: h.coreRpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Tidy Co", website: null } }) }) }) }),
  }),
}));
vi.mock("@cofounderai/core/site", () => ({ SITE_URL: "https://app.example" }));
vi.mock("../campaigns/mailbox", () => ({ loadMailboxForSending: h.loadMailboxForSending }));
vi.mock("../campaigns/smtp", () => ({ sendViaSmtp: h.sendViaSmtp }));
vi.mock("../messages/send", () => ({ sendViaPlatform: h.sendViaPlatform }));

const { sendLeadEmail } = await import("./send");

const LEAD = { id: "lead-1", workspace_id: "w1", email: "asha@example.com", consent_at: "2026-11-12T00:00:00Z", status: "new", lead_token: "b".repeat(48) };

function db() {
  return createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (call.table === "workspaces") return { data: { product_id: "prod-1" }, error: null };
      if (call.table === "products") return { data: { name: "Tidy Kit", website: null, business_id: "b1" }, error: null };
      return { data: null, error: null };
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_FROM_EMAIL", "hello@tidy.example");
  h.prepareOutreachEmail.mockResolvedValue({ suppressed: false, unsubscribeUrl: "x", headers: {} });
  h.loadMailboxForSending.mockResolvedValue(null);
  h.sendViaPlatform.mockResolvedValue({ status: "sent", messageId: "m1" });
  h.coreRpc.mockResolvedValue({ error: null });
});

const send = (lead: Omit<typeof LEAD, "consent_at"> & { consent_at: string | null } = LEAD, client = db()) =>
  sendLeadEmail({ client: client as never, lead, subject: "Hello", body: "Thanks", idempotencyKey: "audience-message/lead-1/k" });

describe("sendLeadEmail", () => {
  it("refuses someone who has not consented, or unsubscribed, without calling the provider", async () => {
    await expect(send({ ...LEAD, consent_at: null })).resolves.toMatchObject({ status: "refused" });
    await expect(send({ ...LEAD, status: "unsubscribed" })).resolves.toMatchObject({ status: "refused" });
    expect(h.sendViaPlatform).not.toHaveBeenCalled();
    expect(h.prepareOutreachEmail).not.toHaveBeenCalled();
  });

  it("refuses an address on the business's opt-out list, and marks the person unsubscribed", async () => {
    h.prepareOutreachEmail.mockResolvedValue({ suppressed: true });
    const client = db();
    await expect(send(LEAD, client)).resolves.toMatchObject({ status: "refused" });
    const update = client.queries("audience_leads").find((c) => usedOp(c, "update"))!;
    expect(opArgs(update, "update")![0]).toMatchObject({ status: "unsubscribed" });
    expect(h.sendViaPlatform).not.toHaveBeenCalled();
  });

  it("sends with the person's own unsubscribe link, the one-click headers and the idempotency key", async () => {
    await expect(send()).resolves.toEqual({ status: "sent" });
    const [, key, payload] = h.sendViaPlatform.mock.calls[0]!;
    expect(key).toBe("audience-message/lead-1/k");
    const unsubscribe = `https://app.example/api/audience/unsubscribe?t=${LEAD.lead_token}`;
    expect(payload.headers).toEqual({ "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(payload.text).toContain(unsubscribe);
    expect(h.coreRpc).toHaveBeenCalledWith("append_audit_log", expect.objectContaining({ p_action: "discovery.audience_email.sent", p_entity_id: "lead-1" }));
    // The audit trail never carries the address.
    expect(JSON.stringify(h.coreRpc.mock.calls)).not.toContain("asha@example.com");
  });

  it("says Needs setup when no mail provider or mailbox is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(send()).resolves.toEqual({ status: "failed", message: "Needs setup: email sending isn't configured yet." });
  });

  it("reports an unknown outcome as a failure that is not retried", async () => {
    h.sendViaPlatform.mockResolvedValue({ status: "unknown", reason: "?" });
    await expect(send()).resolves.toMatchObject({ status: "failed", message: expect.stringMatching(/won't be retried/) });
  });
});

/**
 * DISC-DATA-P0-04.2 (sending rules): what a lookup said about an address decides
 * whether a draft may go to it. An invalid address is never sent to; a risky or
 * unverified one is sent to only with the person's confirmation; a verified address, and
 * a contact a person typed (no status), send as before. The rule is applied here on the
 * server, before the provider is called, and the unsubscribe handling after it is
 * untouched: a confirmation never sends to someone who opted out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  listContacts: vi.fn(),
  send: vi.fn((_payload: { to: string }) => undefined as unknown),
  Resend: vi.fn(),
  prepareOutreachEmail: vi.fn(),
}));

vi.mock("resend", () => ({ Resend: h.Resend }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../contacts/queries", () => ({ listContacts: h.listContacts }));
vi.mock("../prospects/queries", () => ({ getProspect: vi.fn(async () => ({ id: "p1", company_name: "Acme" })) }));
vi.mock("../tenancy/queries", () => ({
  getBusiness: vi.fn(async () => ({ id: "b1", name: "Acme Co", website: null })),
  getProduct: vi.fn(async () => ({ id: "prod-1", name: "Widgets", business_id: "b1", website: null })),
  getWorkspace: vi.fn(async () => ({ id: "w1", product_id: "prod-1" })),
}));
vi.mock("../conversations/mutations", () => ({
  getOrCreateConversation: vi.fn(async () => ({ id: "conv-1" })),
  markConversationAwaitingReply: vi.fn(),
}));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ prepareOutreachEmail: h.prepareOutreachEmail }));
vi.mock("@cofounderai/core/email/render", () => ({ renderEmailHtml: () => "<html></html>", renderEmailText: () => "body" }));

const { sendMessage } = await import("./send");
const { emailSendCheck } = await import("./email-status");

const MESSAGE = { id: "m1", channel: "email", status: "approved", workspace_id: "w1", prospect_id: "p1", contact_id: "c1", subject: null, content: "Hello" };

function mock() {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => ({ data: usedOp(call, "update") ? { id: "m1" } : MESSAGE, error: null }),
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

function recipient(emailStatus: string | null | undefined) {
  h.listContacts.mockResolvedValue([
    { id: "c0", email: "other@acme.example", email_status: "verified" },
    { id: "c1", email: "buyer@acme.example", ...(emailStatus === undefined ? {} : { email_status: emailStatus }) },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.prepareOutreachEmail.mockResolvedValue({ suppressed: false, unsubscribeUrl: "https://app.example/u", headers: {} });
  h.send.mockResolvedValue({ data: { id: "resend-1" }, error: null });
  h.Resend.mockImplementation(
    class {
      emails = { send: h.send };
    } as unknown as (...args: unknown[]) => unknown,
  );
  vi.stubEnv("RESEND_API_KEY", "re_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "founder@widgets.example");
});

afterEach(() => vi.unstubAllEnvs());

describe("the rule", () => {
  it("blocks invalid, asks about risky and unverified, and passes everything else", () => {
    expect(emailSendCheck("invalid")).toBe("blocked");
    expect(emailSendCheck("risky")).toBe("confirm");
    expect(emailSendCheck("unverified")).toBe("confirm");
    expect(emailSendCheck("verified")).toBe("ok");
    expect(emailSendCheck(null)).toBe("ok");
    expect(emailSendCheck(undefined)).toBe("ok");
  });
});

describe("sendMessage and the address's status", () => {
  it("never sends to an address marked invalid, confirmed or not", async () => {
    const supabase = mock();
    recipient("invalid");

    await expect(sendMessage("m1")).rejects.toThrow("marked invalid");
    await expect(sendMessage("m1", { confirmedUnverified: true })).rejects.toThrow("marked invalid");

    expect(h.send).not.toHaveBeenCalled();
    // Nothing was written: the message is not marked sent, and not marked failed either.
    expect(supabase.queries("messages").some((call) => usedOp(call, "update"))).toBe(false);
  });

  it.each(["risky", "unverified"])("does not send to a %s address without the confirmation", async (status) => {
    mock();
    recipient(status);

    await expect(sendMessage("m1")).rejects.toThrow("Confirm to send it anyway");
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each(["risky", "unverified"])("sends to a %s address once it is confirmed", async (status) => {
    const supabase = mock();
    recipient(status);

    await sendMessage("m1", { confirmedUnverified: true });

    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]![0].to).toBe("buyer@acme.example");
    const update = supabase.queries("messages").find((call) => usedOp(call, "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "sent" });
  });

  it("sends to a verified address, and to a contact a person typed, with no confirmation", async () => {
    mock();
    recipient("verified");
    await sendMessage("m1");
    recipient(undefined);
    await sendMessage("m1");
    recipient(null);
    await sendMessage("m1");
    expect(h.send).toHaveBeenCalledTimes(3);
  });

  it("judges the address the message is going to, not another contact's", async () => {
    mock();
    // c0 is verified, c1 (the message's contact) is invalid.
    recipient("invalid");
    await expect(sendMessage("m1")).rejects.toThrow("marked invalid");
  });

  it("still refuses someone who unsubscribed, even when the address was confirmed", async () => {
    const supabase = mock();
    recipient("risky");
    h.prepareOutreachEmail.mockResolvedValue({ suppressed: true });

    await sendMessage("m1", { confirmedUnverified: true });

    expect(h.send).not.toHaveBeenCalled();
    const update = supabase.queries("messages").find((call) => usedOp(call, "update"))!;
    expect(writtenRow(update)).toMatchObject({
      status: "failed",
      failure_reason: "This contact unsubscribed from your emails, so it wasn't sent.",
    });
  });
});

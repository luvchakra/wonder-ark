/**
 * R1/R2: an outbound message's status must be the provider's *actual* result, never a
 * manual self-report. The tests therefore pin every branch that decides that status, plus
 * the guards in front of the send — sending an unapproved message, or one with no
 * deliverable recipient, would burn a provider call and mislead the founder about what
 * went out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  listContacts: vi.fn(),
  getProspect: vi.fn(),
  getBusiness: vi.fn(),
  getProduct: vi.fn(),
  getWorkspace: vi.fn(),
  getOrCreateConversation: vi.fn(),
  markConversationAwaitingReply: vi.fn(),
  renderEmailHtml: vi.fn(
    (_input: { brandName: string; body: string; websiteUrl: string | null; replyToEmail: string }) =>
      "<html>body</html>",
  ),
  renderEmailText: vi.fn(() => "body"),
  // Arg typed explicitly: an inferred zero-arg mock gives `mock.calls` an empty tuple
  // type, and the assertions below read the payload it was called with.
  send: vi.fn((_payload: { to: string; subject: string; text: string; html: string }) => undefined as unknown),
  Resend: vi.fn(),
  prepareOutreachEmail: vi.fn(),
}));

vi.mock("resend", () => ({ Resend: h.Resend }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../contacts/queries", () => ({ listContacts: h.listContacts }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({
  getBusiness: h.getBusiness,
  getProduct: h.getProduct,
  getWorkspace: h.getWorkspace,
}));
vi.mock("../conversations/mutations", () => ({
  getOrCreateConversation: h.getOrCreateConversation,
  markConversationAwaitingReply: h.markConversationAwaitingReply,
}));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../campaigns/mailbox", () => ({ loadMailboxForSending: vi.fn(async () => null) }));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ prepareOutreachEmail: h.prepareOutreachEmail }));
vi.mock("@cofounderai/core/email/render", () => ({
  renderEmailHtml: h.renderEmailHtml,
  renderEmailText: h.renderEmailText,
}));

const { sendMessage } = await import("./send");

const MESSAGE = {
  id: "m1",
  channel: "email",
  status: "approved",
  workspace_id: "w1",
  prospect_id: "p1",
  contact_id: null,
  subject: null,
  content: "Hello there",
};

const UNSUBSCRIBE_URL = "https://app.example/api/unsubscribe?t=tok";
const UNSUBSCRIBE_HEADERS = {
  "List-Unsubscribe": `<${UNSUBSCRIBE_URL}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
};

function mock(message: unknown = MESSAGE, error: unknown = null) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) =>
      error ? { data: null, error } : { data: usedOp(call, "update") ? { id: "m1", updated: true } : message, error: null },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProspect.mockResolvedValue({ id: "p1", company_name: "Acme" });
  h.listContacts.mockResolvedValue([{ id: "c1", email: "buyer@acme.com" }]);
  h.getWorkspace.mockResolvedValue({ id: "w1", product_id: "prod-1" });
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", business_id: "b1", website: "https://widgets.example" });
  h.getBusiness.mockResolvedValue({ id: "b1", name: "Acme Co", website: null });
  h.getOrCreateConversation.mockResolvedValue({ id: "conv-1" });
  h.prepareOutreachEmail.mockResolvedValue({ suppressed: false, unsubscribeUrl: UNSUBSCRIBE_URL, headers: UNSUBSCRIBE_HEADERS });
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

describe("sendMessage — guards", () => {
  it.each(["linkedin", "whatsapp"])("refuses the %s channel, which has no send integration", async (channel) => {
    mock({ ...MESSAGE, channel });

    await expect(sendMessage("m1")).rejects.toThrow(/only available for the email channel/);
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each(["draft", "sent"])("refuses a '%s' message — only approved or failed may send", async (status) => {
    mock({ ...MESSAGE, status });

    await expect(sendMessage("m1")).rejects.toThrow("Approve the message before sending.");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("allows retrying a previously failed message", async () => {
    mock({ ...MESSAGE, status: "failed" });

    await sendMessage("m1");

    expect(h.send).toHaveBeenCalled();
  });

  it("refuses when the prospect is not visible", async () => {
    mock();
    h.getProspect.mockResolvedValue(null);

    await expect(sendMessage("m1")).rejects.toThrow("Prospect not found.");
  });

  it("refuses when no contact has an email", async () => {
    mock();
    h.listContacts.mockResolvedValue([{ id: "c1", email: null }]);

    await expect(sendMessage("m1")).rejects.toThrow(/No contact email on file/);
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each([
    ["no API key", "RESEND_API_KEY"],
    ["no from address", "RESEND_FROM_EMAIL"],
  ])("refuses with %s configured, rather than failing mid-send", async (_label, missing) => {
    mock();
    vi.stubEnv(missing, "");

    await expect(sendMessage("m1")).rejects.toThrow(/isn't configured/);
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("sendMessage — recipient selection", () => {
  it("sends to the message's chosen contact when one is set", async () => {
    mock({ ...MESSAGE, contact_id: "c2" });
    h.listContacts.mockResolvedValue([
      { id: "c1", email: "first@acme.com" },
      { id: "c2", email: "chosen@acme.com" },
    ]);

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].to).toBe("chosen@acme.com");
  });

  it("falls back to the first contact with an email when none is chosen", async () => {
    mock();
    h.listContacts.mockResolvedValue([
      { id: "c1", email: null },
      { id: "c2", email: "second@acme.com" },
    ]);

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].to).toBe("second@acme.com");
  });

  it("refuses when the chosen contact has no email, rather than silently using another", async () => {
    mock({ ...MESSAGE, contact_id: "c1" });
    h.listContacts.mockResolvedValue([
      { id: "c1", email: null },
      { id: "c2", email: "other@acme.com" },
    ]);

    await expect(sendMessage("m1")).rejects.toThrow(/No contact email on file/);
  });
});

describe("sendMessage — composition", () => {
  it("brands the email with the product", async () => {
    mock();
    await sendMessage("m1");
    expect(h.renderEmailHtml.mock.calls[0]![0]).toMatchObject({ brandName: "Widgets" });
  });

  // PRIV-1: opt-outs are kept per business, so a send with no business to check against
  // is refused rather than sent unchecked.
  it("refuses to send when the workspace resolves to no business", async () => {
    h.getProduct.mockResolvedValue(null);
    mock();
    await expect(sendMessage("m1")).rejects.toThrow("isn't linked to a business");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("defaults the subject when the message has none", async () => {
    mock();

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].subject).toBe("Quick note for Acme");
  });

  it("uses the message's own subject when set", async () => {
    mock({ ...MESSAGE, subject: "About your ops" });

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].subject).toBe("About your ops");
  });

  it("sends both a text and an HTML part, replying to the configured address", async () => {
    mock();

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0]).toMatchObject({ text: "body", html: "<html>body</html>" });
    expect(h.renderEmailHtml.mock.calls[0]![0]).toMatchObject({
      replyToEmail: "founder@widgets.example",
    });
  });
});

describe("sendMessage — outcome", () => {
  it("records the provider's message id and marks it sent", async () => {
    const supabase = mock();

    await sendMessage("m1");

    const update = supabase.queries("messages").filter((c) => usedOp(c, "update")).at(-1)!;
    expect(writtenRow(update)).toMatchObject({
      status: "sent",
      conversation_id: "conv-1",
      provider_message_id: "resend-1",
      failure_reason: null,
    });
  });

  it("marks the conversation awaiting a reply after a successful send", async () => {
    mock();

    await sendMessage("m1");

    expect(h.markConversationAwaitingReply).toHaveBeenCalledWith("conv-1");
  });

  it("records the provider's own failure reason rather than a generic one", async () => {
    const supabase = mock();
    h.send.mockResolvedValue({ data: null, error: { message: "domain not verified" } });

    await sendMessage("m1");

    const update = supabase.queries("messages").filter((c) => usedOp(c, "update")).at(-1)!;
    expect(writtenRow(update)).toEqual({ status: "failed", failure_reason: "domain not verified", send_claimed_at: null, send_attempt: 1 });
  });

  it("opens no conversation for a send that failed", async () => {
    mock();
    h.send.mockResolvedValue({ data: null, error: { message: "bounced" } });

    await sendMessage("m1");

    expect(h.getOrCreateConversation).not.toHaveBeenCalled();
    expect(h.markConversationAwaitingReply).not.toHaveBeenCalled();
  });

  it("tolerates a provider response with no message id", async () => {
    const supabase = mock();
    h.send.mockResolvedValue({ data: null, error: null });

    await sendMessage("m1");

    const update = supabase.queries("messages").filter((c) => usedOp(c, "update")).at(-1)!;
    expect(writtenRow(update)).toMatchObject({ status: "sent", provider_message_id: null });
  });

  it("propagates a failed message lookup", async () => {
    mock(MESSAGE, new Error("not visible"));

    await expect(sendMessage("m1")).rejects.toThrow("not visible");
  });
});

/** The status write is the whole point of this function — if it fails, the founder is
 * told the send succeeded (or failed) on the strength of a row that was never updated. */
describe("sendMessage — status write failures", () => {
  function mockUpdateFailure() {
    const supabase = createFakeSupabase({
      query: (call: RecordedQuery) =>
        usedOp(call, "update")
          ? { data: null, error: new Error("status write denied") }
          : { data: MESSAGE, error: null },
    });
    h.createClient.mockResolvedValue(supabase);
    return supabase;
  }

  it("propagates a failure to record a successful send", async () => {
    mockUpdateFailure();

    await expect(sendMessage("m1")).rejects.toThrow("status write denied");
    expect(h.markConversationAwaitingReply).not.toHaveBeenCalled();
  });

  it("propagates a failure to record the provider's rejection", async () => {
    h.send.mockResolvedValue({ data: null, error: { message: "Mailbox does not exist" } });
    mockUpdateFailure();

    await expect(sendMessage("m1")).rejects.toThrow("status write denied");
  });

  // PRIV-1: without the workspace there's no business whose opt-outs to check, so the
  // send is refused (it used to go out branded with the prospect's name).
  it("refuses to send when the workspace behind the message is gone", async () => {
    mock();
    h.getWorkspace.mockResolvedValue(null);

    await expect(sendMessage("m1")).rejects.toThrow("isn't linked to a business");

    expect(h.getProduct).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("sendMessage — opt-outs (PRIV-1)", () => {
  it("checks the recipient against the business's opt-outs", async () => {
    mock();
    await sendMessage("m1");
    expect(h.prepareOutreachEmail).toHaveBeenCalledWith("b1", "buyer@acme.com");
  });

  it("does not send to someone who unsubscribed, and records why", async () => {
    h.prepareOutreachEmail.mockResolvedValue({ suppressed: true });
    const supabase = mock();

    await sendMessage("m1");

    expect(h.send).not.toHaveBeenCalled();
    const update = supabase.queries("messages").find((q) => usedOp(q, "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "failed", failure_reason: expect.stringContaining("unsubscribed") });
    expect(h.getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("sends with one-click unsubscribe headers and a footer link", async () => {
    mock();
    await sendMessage("m1");
    expect((h.send.mock.calls[0]![0] as unknown as { headers: unknown }).headers).toEqual(UNSUBSCRIBE_HEADERS);
    expect(h.renderEmailHtml.mock.calls[0]![0]).toMatchObject({ unsubscribeUrl: UNSUBSCRIBE_URL });
    expect(h.renderEmailText).toHaveBeenCalledWith("Hello there", UNSUBSCRIBE_URL);
  });

  it("carries the headers on template sends too", async () => {
    mock({ ...MESSAGE, resend_template_id: "tmpl_1", template_variables: { name: "Ravi" } });
    await sendMessage("m1");
    expect((h.send.mock.calls[0]![0] as unknown as { headers: unknown }).headers).toEqual(UNSUBSCRIBE_HEADERS);
  });
});

/**
 * DISC-CAMP-P0-02.3 / 02.4: one send per message, the mailbox when there is one, an
 * idempotency key on the provider path, an audit entry, and "unknown" never retried.
 */
describe("sendMessage — claim, mailbox and audit (DISC-CAMP-P0-02.3)", () => {
  const audit = async () => vi.mocked((await import("@cofounderai/core/audit/mutations")).writeAuditLog);
  const mailboxLoader = async () => vi.mocked((await import("../campaigns/mailbox")).loadMailboxForSending);
  const MAILBOX = {
    id: "mb1",
    fromName: "Asha at Acme",
    fromEmail: "asha@acme.example",
    dailyLimit: 30,
    connection: { host: "smtp.acme.example", port: 587, username: "asha@acme.example", password: "app-password-9f2c" },
    imap: null,
  };
  const publicLookup = async () => [{ address: "142.250.183.109", family: 4 }];

  /** A message table that behaves: the claim succeeds only while the column is empty. */
  function claimable(message: Record<string, unknown> = MESSAGE) {
    const row: Record<string, unknown> = { send_claimed_at: null, send_attempt: 0, ...message };
    const supabase = createFakeSupabase({
      query: (call: RecordedQuery) => {
        const update = call.ops.find((op) => op.method === "update");
        if (!update) return { data: { ...row }, error: null };
        const guarded = call.ops.some((op) => op.method === "is" && op.args[0] === "send_claimed_at");
        if (guarded && row.send_claimed_at !== null) return { data: null, error: null };
        Object.assign(row, update.args[0]);
        return { data: { ...row }, error: null };
      },
    });
    h.createClient.mockResolvedValue(supabase);
    return { supabase, row };
  }

  it("claims the message before calling the provider, with a compare-and-set on the empty claim", async () => {
    const supabase = mock();
    await sendMessage("m1");

    const claim = supabase.queries("messages").filter((c) => usedOp(c, "update"))[0]!;
    expect(writtenRow(claim)).toEqual({ send_claimed_at: expect.any(String) });
    expect(claim.ops).toEqual(
      expect.arrayContaining([
        { method: "in", args: ["status", ["approved", "failed"]] },
        { method: "is", args: ["send_claimed_at", null] },
      ]),
    );
  });

  it("sends once when two requests arrive together", async () => {
    claimable();
    const outcomes = await Promise.allSettled([sendMessage("m1"), sendMessage("m1")]);

    expect(h.send).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const refused = outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason)).toContain("already being sent");
  });

  it("refuses a message whose send is still in flight, without calling the provider", async () => {
    mock({ ...MESSAGE, send_claimed_at: new Date().toISOString() });
    await expect(sendMessage("m1")).rejects.toThrow("already being sent");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("marks a send that never reported back as Outcome unknown, and sends nothing", async () => {
    const supabase = mock({ ...MESSAGE, send_claimed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    await sendMessage("m1");

    expect(h.send).not.toHaveBeenCalled();
    const update = supabase.queries("messages").filter((c) => usedOp(c, "update")).at(-1)!;
    expect(writtenRow(update)).toMatchObject({ status: "failed", send_claimed_at: null });
    expect(String(writtenRow(update)!.failure_reason)).toContain("Outcome unknown");
  });

  it("sends with an idempotency key made of the message and its attempt", async () => {
    mock({ ...MESSAGE, send_attempt: 2 });
    await sendMessage("m1");
    expect(h.send.mock.calls[0]![1 as never]).toEqual({ idempotencyKey: "discovery-message/m1/2" });
  });

  it("keeps the attempt, so the same key is reused, when the provider request itself threw", async () => {
    const supabase = mock();
    h.send.mockRejectedValue(new Error("socket hang up"));

    await sendMessage("m1");

    const update = supabase.queries("messages").filter((c) => usedOp(c, "update")).at(-1)!;
    expect(writtenRow(update)).toMatchObject({ status: "failed", send_claimed_at: null });
    expect(String(writtenRow(update)!.failure_reason)).toContain("Outcome unknown");
    expect(writtenRow(update)).not.toHaveProperty("send_attempt");
  });

  it("writes the outcome to the audit log without the address or the text", async () => {
    mock();
    await sendMessage("m1");
    const writeAuditLog = await audit();
    expect(writeAuditLog).toHaveBeenCalledWith({
      businessId: "b1",
      action: "discovery.message.sent",
      entityType: "discovery_message",
      entityId: "m1",
      after: { via: "platform", prospectId: "p1", contactId: expect.anything() },
    });
    expect(JSON.stringify(writeAuditLog.mock.calls)).not.toMatch(/@|Hello there/);

    writeAuditLog.mockClear();
    mock();
    h.send.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    await sendMessage("m1");
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "discovery.message.send_failed" }));
  });

  it("goes through the workspace's verified mailbox when it has one, not the platform's provider", async () => {
    const supabase = mock();
    (await mailboxLoader()).mockResolvedValueOnce(MAILBOX);
    const sendMail = vi.fn(async (_message: Record<string, unknown>) => ({ messageId: "<smtp-1@acme.example>", accepted: ["x"] }));

    await sendMessage("m1", { smtp: { lookup: publicLookup, createTransport: () => ({ sendMail }) } });

    expect(h.send).not.toHaveBeenCalled();
    expect(sendMail.mock.calls[0]![0]).toMatchObject({
      from: { name: "Asha at Acme", address: "asha@acme.example" },
      headers: UNSUBSCRIBE_HEADERS,
    });
    const update = supabase.queries("messages").filter((c) => usedOp(c, "update")).at(-1)!;
    expect(writtenRow(update)).toMatchObject({ status: "sent", provider_message_id: "<smtp-1@acme.example>" });
    expect(await audit()).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ via: "mailbox" }) }));
  });

  it("marks a mailbox send with an unknown outcome failed, and does not fall back to the provider", async () => {
    const supabase = mock();
    (await mailboxLoader()).mockResolvedValueOnce(MAILBOX);
    const sendMail = vi.fn(async () => {
      throw Object.assign(new Error("Timeout"), { code: "ETIMEDOUT", timeoutType: "SOCKET_TIMEOUT" });
    });

    await sendMessage("m1", { smtp: { lookup: publicLookup, createTransport: () => ({ sendMail }) } });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(h.send).not.toHaveBeenCalled();
    const update = supabase.queries("messages").filter((c) => usedOp(c, "update")).at(-1)!;
    expect(String(writtenRow(update)!.failure_reason)).toContain("Outcome unknown");
    expect(JSON.stringify(supabase.calls)).not.toContain("app-password-9f2c");
  });

  it("sends through the mailbox even when the platform's provider is not configured", async () => {
    mock();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    (await mailboxLoader()).mockResolvedValueOnce(MAILBOX);
    const sendMail = vi.fn(async () => ({ messageId: "<smtp-2@acme.example>" }));
    await expect(sendMessage("m1", { smtp: { lookup: publicLookup, createTransport: () => ({ sendMail }) } })).resolves.toBeDefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});


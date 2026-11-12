/**
 * DISC-CAMP-P0-04.1 / 04.2: what the tick does with the mailbox before it sends. The
 * tables are held in memory and the IMAP session is injected. Pinned here:
 *  - a reply read from the mailbox stops the prospect's follow-ups before the next step
 *    is sent, is stored once however often the mailbox is read, and stays in its own
 *    workspace;
 *  - a failure notice marks the email bounced, stops the enrollment and puts the address
 *    on the opt-out list;
 *  - unrelated mail is never stored;
 *  - if the mailbox is meant to be read and cannot be, nothing is sent and the reason is
 *    kept on the mailbox;
 *  - the read position only moves once what was read has been dealt with.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import { createMemoryDb } from "../data-sources/__tests__/memory-db";
import type { ImapSession, InboxEnvelope } from "./imap";
import type { SmtpTransportFactory } from "./smtp";

const h = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createCoreAdminClient: vi.fn(),
  classifyReply: vi.fn(),
  recordUnsubscribe: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
  loadMailboxForSending: vi.fn(),
}));
vi.mock("../../db/admin", () => ({ createAdminClient: h.createAdminClient }));
vi.mock("../../db/server", () => ({ createClient: vi.fn() }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: h.createCoreAdminClient }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: vi.fn() }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: vi.fn() }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn() }));
vi.mock("../ai/classify-reply", () => ({ classifyReply: h.classifyReply }));
vi.mock("@cofounderai/core/privacy/suppression", async (original) => ({
  ...(await original<typeof import("@cofounderai/core/privacy/suppression")>()),
  recordUnsubscribe: h.recordUnsubscribe,
}));
vi.mock("../tenancy/queries", () => ({
  getBusinessIdForWorkspace: h.getBusinessIdForWorkspace,
  getWorkspace: vi.fn(async (id: string) => ({ id, product_id: "prod" })),
  getProduct: vi.fn(async () => ({ id: "prod", name: "FieldDesk", business_id: "b", website: null })),
  getBusiness: vi.fn(async () => ({ id: "b", name: "Acme Software", website: null })),
}));
vi.mock("./mailbox", () => ({ loadMailboxForSending: h.loadMailboxForSending, getSenderMailbox: vi.fn() }));

const { syncMailboxInbox } = await import("./inbox");
const { runCampaignTick } = await import("./tick");

const W = "w1";
const NOW = new Date("2026-11-12T06:05:00.000Z");
const publicLookup = async () => [{ address: "142.250.183.109", family: 4 }];
const mailbox = (imap: Record<string, unknown> | null = { host: "imap.acme.example", port: 993, lastSeenUid: null, uidValidity: null }) => ({
  id: "mb1",
  fromName: "Asha",
  fromEmail: "asha@acme.example",
  dailyLimit: 30,
  connection: { host: "smtp.acme.example", port: 587, username: "asha@acme.example", password: "secret-w1" },
  imap,
});

let db: ReturnType<typeof createMemoryDb>;
let inbox: { envelopes: InboxEnvelope[]; bodies: Record<number, string>; fail?: "connect" | "list" };
let texts: number[];
let sendMail: ReturnType<typeof vi.fn<(message: Record<string, unknown>) => Promise<unknown>>>;

const connect = async (): Promise<ImapSession> => {
  if (inbox.fail === "connect") throw new Error("AUTHENTICATIONFAILED secret-w1");
  return {
    open: async () => ({ uidValidity: 77 }),
    list: async () => {
      if (inbox.fail === "list") throw new Error("socket closed");
      return inbox.envelopes;
    },
    text: async (uid) => {
      texts.push(uid);
      return inbox.bodies[uid] ?? "";
    },
    close: async () => {},
  };
};
const envelope = (uid: number, from: string, overrides: Partial<InboxEnvelope> = {}): InboxEnvelope => ({ uid, from, subject: "Re: An idea", messageId: `<${uid}@mail>`, contentType: "text/plain", ...overrides });

function setup(extra: Record<string, Record<string, unknown>[]> = {}) {
  db = createMemoryDb(
    {
      sender_mailboxes: [{ id: "mb1", workspace_id: W, status: "verified", last_seen_uid: null, last_seen_uid_validity: null, last_error: null }],
      outreach_campaigns: [{ id: "c1", workspace_id: W, status: "active", launched_at: "2026-11-10T00:00:00.000Z", send_days: [1, 2, 3, 4, 5], send_from_hour: 9, send_to_hour: 18, timezone: "Asia/Kolkata", auto_enroll: false, include_unverified: false, audience: {} }],
      outreach_campaign_steps: [
        { id: "s1", campaign_id: "c1", workspace_id: W, position: 1, channel: "email", delay_days: 0, purpose: "intro" },
        { id: "s2", campaign_id: "c1", workspace_id: W, position: 2, channel: "email", delay_days: 3, purpose: "follow_up" },
      ],
      outreach_templates: ["s1", "s2"].map((step) => ({ id: `t-${step}`, campaign_id: "c1", step_id: step, workspace_id: W, segment: "general", subject: "An idea for {{company}}", body: "Hello {{company}}" })),
      prospects: [
        { id: "p1", workspace_id: W, company_name: "One", outcome: "open", company_email: null },
        { id: "p2", workspace_id: W, company_name: "Two", outcome: "open", company_email: null },
      ],
      contacts: [
        { id: "k1", workspace_id: W, prospect_id: "p1", email: "Buyer@Prospect.example", email_status: null, first_name: null },
        { id: "k2", workspace_id: W, prospect_id: "p2", email: "gone@prospect.example", email_status: null, first_name: null },
      ],
      // Both got step 1 two days ago; step 2 is due now.
      outreach_enrollments: ["1", "2"].map((n) => ({ id: `e${n}`, campaign_id: "c1", workspace_id: W, prospect_id: `p${n}`, contact_id: `k${n}`, recipient: "contact", segment: "general", status: "active", stop_reason: null, next_step_position: 2, next_due_at: "2026-11-12T00:00:00.000Z", created_at: "2026-11-10T00:00:00.000Z" })),
      outreach_sends: ["1", "2"].map((n) => ({ id: `send${n}`, enrollment_id: `e${n}`, step_id: "s1", campaign_id: "c1", workspace_id: W, status: "sent", message_id: `m${n}`, bounced_at: null, claimed_at: "2026-11-10T06:05:00.000Z" })),
      messages: ["1", "2"].map((n) => ({ id: `m${n}`, workspace_id: W, prospect_id: `p${n}`, contact_id: `k${n}`, channel: "email", direction: "outbound", status: "sent", sent_at: "2026-11-10T06:05:00.000Z", created_at: "2026-11-10T06:05:00.000Z", provider_message_id: `<out${n}@acme>` })),
      conversations: [],
      ...extra,
    },
    { messages: "provider_message_id" },
  );
  const claims = (args: Record<string, unknown>) => {
    const sends = db.rows("outreach_sends");
    const existing = sends.find((row) => row.enrollment_id === args.p_enrollment_id && row.step_id === args.p_step_id);
    if (existing) return { data: [{ id: existing.id, status: existing.status, reason: null, created: false }], error: null };
    const enrollment = db.rows("outreach_enrollments").find((row) => row.id === args.p_enrollment_id)!;
    if (enrollment.status !== "active") return { data: [{ id: null, status: "deferred", reason: "enrollment_not_active", created: false }], error: null };
    const row = { id: `send-new-${sends.length}`, enrollment_id: args.p_enrollment_id, step_id: args.p_step_id, campaign_id: "c1", workspace_id: W, status: args.p_skip_reason ? "skipped" : "requested", reason: args.p_skip_reason ?? null, bounced_at: null, claimed_at: NOW.toISOString() };
    sends.push(row);
    return { data: [{ id: row.id, status: row.status, reason: row.reason, created: true }], error: null };
  };
  h.createAdminClient.mockReturnValue(Object.assign(db.client, { rpc: async (_fn: string, args: Record<string, unknown>) => claims(args) }));
  h.createCoreAdminClient.mockReturnValue(Object.assign(createMemoryDb({}).client, { rpc: async () => ({ data: false, error: null }) }));
}

const sync = (box = mailbox()) => syncMailboxInbox(db.client as never, W, box as never, { lookup: publicLookup, connect }, NOW);
const tick = () => runCampaignTick({ now: NOW, imap: { lookup: publicLookup, connect }, smtp: { lookup: publicLookup, createTransport: (() => ({ sendMail, close: vi.fn() })) as unknown as SmtpTransportFactory } });
const enrollments = () => db.rows("outreach_enrollments");
const inboundRows = () => db.rows("messages").filter((row) => row.direction === "inbound");
const stored = () => db.rows("sender_mailboxes")[0]!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_KEY_ENCRYPTION_SECRET", randomBytes(32).toString("base64"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  inbox = { envelopes: [], bodies: {} };
  texts = [];
  sendMail = vi.fn(async (message: Record<string, unknown>) => ({ messageId: "<x@sent>", accepted: [message.to] }));
  h.getBusinessIdForWorkspace.mockResolvedValue("b1");
  h.classifyReply.mockImplementation(async (id: string) => ({ ...db.rows("messages").find((row) => row.id === id), classification: "interested" }));
  h.loadMailboxForSending.mockImplementation(async () => mailbox());
  setup();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("reading the mailbox", () => {
  it("stores a reply from someone enrolled, stops their follow-ups, and stores nothing else", async () => {
    inbox = {
      envelopes: [envelope(10, "friend@elsewhere.example", { subject: "Lunch?" }), envelope(11, "buyer@prospect.example")],
      bodies: { 10: "PRIVATE lunch plans", 11: "Tell me more" },
    };

    expect(await sync()).toEqual({ ok: true, replies: 1, bounces: 0, ignored: 1 });

    expect(inboundRows()).toHaveLength(1);
    expect(inboundRows()[0]).toMatchObject({ workspace_id: W, prospect_id: "p1", contact_id: "k1", provider_message_id: "id:<11@mail>" });
    expect(String(inboundRows()[0]!.content)).toContain("Tell me more");
    expect(enrollments().map((row) => [row.id, row.status])).toEqual([["e1", "replied"], ["e2", "active"]]);
    // The unrelated message: its body was never fetched and nothing about it is stored.
    expect(texts).toEqual([11]);
    expect(JSON.stringify([db.rows("messages"), db.rows("conversations"), stored()])).not.toMatch(/PRIVATE|Lunch|friend@elsewhere/);
    expect(stored()).toMatchObject({ last_seen_uid: 11, last_seen_uid_validity: 77, last_error: null });
  });

  it("stores the same reply once however often the mailbox is read", async () => {
    inbox = { envelopes: [envelope(11, "buyer@prospect.example")], bodies: { 11: "Tell me more" } };
    await sync();
    expect(await sync()).toMatchObject({ ok: true, replies: 0 });
    expect(inboundRows()).toHaveLength(1);
  });

  it("marks a bounced email, stops the enrollment and suppresses the address", async () => {
    inbox = {
      envelopes: [envelope(12, "mailer-daemon@mail.example", { subject: "Undelivered Mail Returned to Sender", contentType: "multipart/report" })],
      bodies: { 12: "Final-Recipient: rfc822; gone@prospect.example\nAction: failed\nStatus: 5.1.1" },
    };

    expect(await sync()).toEqual({ ok: true, replies: 0, bounces: 1, ignored: 0 });

    expect(db.rows("outreach_sends").find((row) => row.id === "send2")!.bounced_at).toEqual(expect.any(String));
    expect(db.rows("messages").find((row) => row.id === "m2")).toMatchObject({ status: "failed", failure_reason: "The email bounced." });
    expect(enrollments().find((row) => row.id === "e2")).toMatchObject({ status: "stopped", stop_reason: "The email bounced" });
    expect(h.recordUnsubscribe).toHaveBeenCalledWith("b1", emailHash("gone@prospect.example"), "bounce");
    expect(enrollments().find((row) => row.id === "e1")).toMatchObject({ status: "active" });
  });

  it("ignores a failure notice about an address this workspace never wrote to", async () => {
    inbox = {
      envelopes: [envelope(13, "mailer-daemon@mail.example", { subject: "Undelivered Mail Returned to Sender", contentType: "multipart/report" })],
      bodies: { 13: "Final-Recipient: rfc822; stranger@private.example" },
    };
    expect(await sync()).toEqual({ ok: true, replies: 0, bounces: 0, ignored: 1 });
    expect(h.recordUnsubscribe).not.toHaveBeenCalled();
    expect(enrollments().every((row) => row.status === "active")).toBe(true);
  });

  it("does nothing, and connects to nothing, for a mailbox with no incoming server", async () => {
    inbox.fail = "connect";
    expect(await sync(mailbox(null))).toEqual({ ok: true, replies: 0, bounces: 0, ignored: 0 });
  });

  it("keeps the reason on the mailbox, without the password, when it cannot be read", async () => {
    inbox.fail = "connect";
    const result = await sync();
    expect(result).toEqual({ ok: false, reason: "The incoming mail server couldn't be reached or refused the sign-in." });
    expect(String(stored().last_error)).toContain("Replies couldn't be read, so nothing was sent.");
    expect(JSON.stringify(stored())).not.toContain("secret-w1");
    expect(stored().last_seen_uid).toBeNull();
  });

  it("leaves the read position where it was when dealing with a message fails", async () => {
    inbox = { envelopes: [envelope(11, "buyer@prospect.example")], bodies: { 11: "Tell me more" } };
    h.getBusinessIdForWorkspace.mockResolvedValue("b1");
    const original = db.client.from.bind(db.client);
    vi.spyOn(db.client, "from").mockImplementation(((table: string) => {
      if (table === "conversations") throw new Error("database is down");
      return original(table);
    }) as never);
    await expect(sync()).rejects.toThrow("database is down");
    expect(stored().last_seen_uid).toBeNull();
  });
});

describe("the tick reads the mailbox before it sends", () => {
  it("does not send the follow-up to someone whose reply is in the mailbox", async () => {
    inbox = { envelopes: [envelope(11, "buyer@prospect.example")], bodies: { 11: "Tell me more" } };

    const summary = await tick();

    expect(summary).toMatchObject({ repliesRead: 1, sent: 1 });
    expect(sendMail.mock.calls.map(([message]) => message.to)).toEqual(["gone@prospect.example"]);
    expect(enrollments().find((row) => row.id === "e1")).toMatchObject({ status: "replied" });
  });

  it("does not send the follow-up to an address that bounced", async () => {
    inbox = {
      envelopes: [envelope(12, "mailer-daemon@mail.example", { subject: "Undelivered Mail Returned to Sender", contentType: "multipart/report" })],
      bodies: { 12: "<gone@prospect.example>: 550 no such user" },
    };
    const summary = await tick();
    expect(summary).toMatchObject({ bouncesRead: 1, sent: 1 });
    expect(sendMail.mock.calls.map(([message]) => message.to)).toEqual(["Buyer@Prospect.example"]);
  });

  it("sends nothing for the workspace when the mailbox cannot be read", async () => {
    inbox.fail = "list";
    const summary = await tick();
    expect(summary).toMatchObject({ sent: 0, deferred: 2 });
    expect(sendMail).not.toHaveBeenCalled();
    expect(enrollments().every((row) => row.status === "active" && row.next_step_position === 2)).toBe(true);
    expect(String(stored().last_error)).toContain("Replies couldn't be read");
  });

  it("reads replies even outside the campaign's sending hours", async () => {
    inbox = { envelopes: [envelope(11, "buyer@prospect.example")], bodies: { 11: "Tell me more" } };
    const summary = await runCampaignTick({ now: new Date("2026-11-14T06:05:00.000Z"), imap: { lookup: publicLookup, connect } });
    expect(summary).toMatchObject({ repliesRead: 1, sent: 0 });
    expect(enrollments().find((row) => row.id === "e1")).toMatchObject({ status: "replied" });
  });

  it("pauses a campaign that a bounce just took over the limit, before sending more", async () => {
    setup({
      outreach_sends: [
        ...Array.from({ length: 22 }, (_, i) => ({ id: `old${i}`, enrollment_id: `x${i}`, step_id: "s1", campaign_id: "c1", workspace_id: W, status: "sent", message_id: null, bounced_at: i < 1 ? "2026-11-11T00:00:00Z" : null })),
        { id: "send1", enrollment_id: "e1", step_id: "s1", campaign_id: "c1", workspace_id: W, status: "sent", message_id: "m1", bounced_at: null },
        { id: "send2", enrollment_id: "e2", step_id: "s1", campaign_id: "c1", workspace_id: W, status: "sent", message_id: "m2", bounced_at: null },
      ],
    });
    inbox = {
      envelopes: [envelope(12, "mailer-daemon@mail.example", { subject: "Undelivered Mail Returned to Sender", contentType: "multipart/report" })],
      bodies: { 12: "<gone@prospect.example> and <buyer@prospect.example>: 550" },
    };

    const summary = await tick();

    // 3 of 24 sent emails bounced: more than 8%.
    expect(summary.paused).toEqual(["c1"]);
    expect(summary.sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(String(db.rows("outreach_campaigns")[0]!.pause_reason)).toContain("3 of 24 emails bounced");
  });
});

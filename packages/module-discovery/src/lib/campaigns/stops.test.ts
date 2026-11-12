/**
 * DISC-CAMP-P0-04.1 / 04.2: replies, bounces and complaints, as the webhooks deliver
 * them, with the tables held in memory. Pinned here:
 *  - a reply goes to the workspace that last wrote to that address, not the first one
 *    that holds a contact with it, and to nobody when that cannot be told;
 *  - a reply delivered twice is stored once;
 *  - any reply stops the prospect's follow-ups; one that asks to unsubscribe also puts
 *    the address on the business's opt-out list;
 *  - a bounce or a complaint marks the send, stops the enrollment and puts the address
 *    on the opt-out list; a plain "failed" does not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import { createMemoryDb } from "../data-sources/__tests__/memory-db";

const h = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  classifyReply: vi.fn(),
  recordUnsubscribe: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
}));
vi.mock("../../db/admin", () => ({ createAdminClient: h.createAdminClient }));
vi.mock("../ai/classify-reply", () => ({ classifyReply: h.classifyReply }));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ recordUnsubscribe: h.recordUnsubscribe }));
vi.mock("../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));

const { ingestInboundEmail } = await import("../conversations/ingest-inbound-email");
const { ingestSendStatus } = await import("../messages/ingest-send-status");

const ADDRESS = "buyer@shared.example";
const reply = { from: "Buyer@Shared.example ", subject: "Re: An idea", text: "Tell me more" };

let db: ReturnType<typeof createMemoryDb>;

const contact = (id: string, workspaceId: string, prospectId: string) => ({ id, workspace_id: workspaceId, prospect_id: prospectId, email: ADDRESS });
const outbound = (id: string, workspaceId: string, prospectId: string, contactId: string | null, sentAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspace_id: workspaceId,
  prospect_id: prospectId,
  contact_id: contactId,
  channel: "email",
  direction: "outbound",
  status: "sent",
  sent_at: sentAt,
  provider_message_id: `<${id}@sent>`,
  ...extra,
});
const enrollment = (id: string, workspaceId: string, prospectId: string, status = "active") => ({ id, workspace_id: workspaceId, prospect_id: prospectId, status, stop_reason: null, next_due_at: "2026-11-20T00:00:00Z" });

function setup(tables: Record<string, Record<string, unknown>[]>) {
  db = createMemoryDb({ messages: [], conversations: [], outreach_enrollments: [], outreach_sends: [], contacts: [], prospects: [], ...tables }, { messages: "provider_message_id" });
  h.createAdminClient.mockReturnValue(db.client);
}
const inbound = () => db.rows("messages").filter((row) => row.direction === "inbound");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.getBusinessIdForWorkspace.mockImplementation(async (workspaceId: string) => `business-of-${workspaceId}`);
  h.classifyReply.mockImplementation(async (id: string) => ({ ...db.rows("messages").find((row) => row.id === id), classification: "interested" }));
});

describe("whose reply it is", () => {
  it("goes to the workspace that last wrote to the address, not the first that holds it", async () => {
    setup({
      contacts: [contact("k1", "w1", "p1"), contact("k2", "w2", "p2")],
      messages: [outbound("m1", "w1", "p1", "k1", "2026-11-01T00:00:00Z"), outbound("m2", "w2", "p2", "k2", "2026-11-10T00:00:00Z")],
      outreach_enrollments: [enrollment("e1", "w1", "p1"), enrollment("e2", "w2", "p2")],
    });

    const result = await ingestInboundEmail(reply);

    expect(result.matched).toBe(true);
    expect(inbound()).toHaveLength(1);
    expect(inbound()[0]).toMatchObject({ workspace_id: "w2", prospect_id: "p2", contact_id: "k2" });
    expect(db.rows("conversations")[0]).toMatchObject({ workspace_id: "w2", prospect_id: "p2", status: "replied" });
    // Only that workspace's enrollment stops; the other workspace's is untouched.
    expect(db.rows("outreach_enrollments").map((row) => [row.id, row.status])).toEqual([["e1", "active"], ["e2", "replied"]]);
  });

  it("is attributed to nobody when several workspaces hold the address and none wrote to it", async () => {
    setup({ contacts: [contact("k1", "w1", "p1"), contact("k2", "w2", "p2")] });
    expect(await ingestInboundEmail(reply)).toEqual({ matched: false, reason: `No contact found for ${ADDRESS}.` });
    expect(inbound()).toHaveLength(0);
  });

  it("matches a prospect's general company email, which has no contact", async () => {
    setup({ prospects: [{ id: "p1", workspace_id: "w1", company_email: ADDRESS }], outreach_enrollments: [enrollment("e1", "w1", "p1")] });
    const result = await ingestInboundEmail(reply);
    expect(result.matched).toBe(true);
    expect(inbound()[0]).toMatchObject({ workspace_id: "w1", prospect_id: "p1", contact_id: null });
    expect(db.rows("outreach_enrollments")[0]).toMatchObject({ status: "replied", stop_reason: "Replied", next_due_at: null });
  });

  it("looks only in the workspace whose mailbox was read, when told which", async () => {
    setup({ contacts: [contact("k1", "w1", "p1"), contact("k2", "w2", "p2")] });
    const result = await ingestInboundEmail({ ...reply, workspaceId: "w1" });
    expect(result.matched).toBe(true);
    expect(inbound()[0]).toMatchObject({ workspace_id: "w1", prospect_id: "p1" });
  });
});

describe("a reply delivered twice", () => {
  it("is stored once, by its Message-ID", async () => {
    setup({ contacts: [contact("k1", "w1", "p1")] });
    const first = await ingestInboundEmail({ ...reply, messageId: "<abc@mail.example>" });
    const second = await ingestInboundEmail({ ...reply, messageId: "<abc@mail.example>" });

    expect(first).toMatchObject({ matched: true });
    expect(second).toMatchObject({ matched: true, duplicate: true });
    expect(second.matched && second.message.id).toBe(first.matched && first.message.id);
    expect(inbound()).toHaveLength(1);
    expect(h.classifyReply).toHaveBeenCalledTimes(1);
  });

  it("is stored once without a Message-ID too, by its sender, text and day", async () => {
    setup({ contacts: [contact("k1", "w1", "p1")] });
    await ingestInboundEmail(reply);
    expect(await ingestInboundEmail(reply)).toMatchObject({ matched: true, duplicate: true });
    expect(inbound()).toHaveLength(1);

    // A different reply from the same person is a new row.
    await ingestInboundEmail({ ...reply, text: "Actually, call me." });
    expect(inbound()).toHaveLength(2);
  });
});

describe("a reply and the opt-out list", () => {
  it("stops the follow-ups whatever the reply says, and leaves the opt-out list alone", async () => {
    setup({ contacts: [contact("k1", "w1", "p1")], outreach_enrollments: [enrollment("e1", "w1", "p1"), enrollment("e0", "w1", "p1", "completed")] });
    await ingestInboundEmail(reply);
    expect(db.rows("outreach_enrollments").map((row) => row.status)).toEqual(["replied", "completed"]);
    expect(h.recordUnsubscribe).not.toHaveBeenCalled();
  });

  it("adds the address (its hash) to the business's opt-out list when the reply asks to unsubscribe", async () => {
    setup({ contacts: [contact("k1", "w1", "p1")], outreach_enrollments: [enrollment("e1", "w1", "p1")] });
    h.classifyReply.mockImplementation(async (id: string) => ({ id, classification: "unsubscribe" }));

    await ingestInboundEmail({ ...reply, text: "Please remove me from your list" });

    expect(h.recordUnsubscribe).toHaveBeenCalledWith("business-of-w1", emailHash(ADDRESS), "unsubscribe");
    expect(db.rows("outreach_enrollments")[0]).toMatchObject({ status: "replied" });
  });

  it("still stops the follow-ups when the reply cannot be classified", async () => {
    setup({ contacts: [contact("k1", "w1", "p1")], outreach_enrollments: [enrollment("e1", "w1", "p1")] });
    h.classifyReply.mockRejectedValue(new Error("provider down"));
    expect(await ingestInboundEmail(reply)).toMatchObject({ matched: true });
    expect(db.rows("outreach_enrollments")[0]).toMatchObject({ status: "replied" });
    expect(h.recordUnsubscribe).not.toHaveBeenCalled();
  });
});

describe("a bounce or a complaint", () => {
  const sent = () => ({
    contacts: [contact("k1", "w1", "p1")],
    messages: [outbound("m1", "w1", "p1", "k1", "2026-11-10T00:00:00Z", { provider_message_id: "prov-1" })],
    outreach_enrollments: [enrollment("e1", "w1", "p1")],
    outreach_sends: [{ id: "s1", message_id: "m1", workspace_id: "w1", status: "sent", bounced_at: null }],
  });

  it.each([
    ["bounced", "bounce", "The email bounced"],
    ["complained", "complaint", "Reported the email as unwanted"],
  ] as const)("%s: marks the send, stops the enrollment and suppresses the address", async (status, reason, stopReason) => {
    setup(sent());

    const result = await ingestSendStatus({ providerMessageId: "prov-1", status });

    expect(result.matched).toBe(true);
    expect(db.rows("messages")[0]).toMatchObject({ status: "failed" });
    expect(db.rows("outreach_sends")[0]!.bounced_at).toEqual(expect.any(String));
    expect(db.rows("outreach_enrollments")[0]).toMatchObject({ status: "stopped", stop_reason: stopReason });
    expect(h.recordUnsubscribe).toHaveBeenCalledWith("business-of-w1", emailHash(ADDRESS), reason);
  });

  it("is safe to deliver twice", async () => {
    setup(sent());
    await ingestSendStatus({ providerMessageId: "prov-1", status: "bounced" });
    const first = db.rows("outreach_sends")[0]!.bounced_at;
    await ingestSendStatus({ providerMessageId: "prov-1", status: "bounced" });
    expect(db.rows("outreach_sends")[0]!.bounced_at).toBe(first);
    expect(db.rows("outreach_enrollments")[0]).toMatchObject({ status: "stopped", stop_reason: "The email bounced" });
  });

  it("does not suppress an address, or stop anything, for a plain failure", async () => {
    setup(sent());
    await ingestSendStatus({ providerMessageId: "prov-1", status: "failed", reason: "rate limited" });
    expect(h.recordUnsubscribe).not.toHaveBeenCalled();
    expect(db.rows("outreach_enrollments")[0]).toMatchObject({ status: "active" });
    expect(db.rows("outreach_sends")[0]).toMatchObject({ bounced_at: null });
  });

  it("suppresses the general company email when that is where the message went", async () => {
    setup({
      prospects: [{ id: "p1", workspace_id: "w1", company_email: "info@acme.example" }],
      messages: [outbound("m1", "w1", "p1", null, "2026-11-10T00:00:00Z", { provider_message_id: "prov-1" })],
    });
    await ingestSendStatus({ providerMessageId: "prov-1", status: "bounced" });
    expect(h.recordUnsubscribe).toHaveBeenCalledWith("business-of-w1", emailHash("info@acme.example"), "bounce");
  });
});

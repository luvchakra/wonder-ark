/** DISC-AUTO-P0-03.1: what "Send automatically" sends, and what it leaves for the person. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sentToday: 0, messages: [] as Record<string, unknown>[], sendResult: { status: "sent" } as Record<string, unknown> }));
vi.mock("../../db/server", () => ({
  createClient: async () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, gte: async () => ({ count: h.sentToday, error: null }) };
      return q;
    },
  }),
}));
vi.mock("../messages/queries", () => ({ listMessages: vi.fn(async () => h.messages) }));
vi.mock("../messages/mutations", () => ({ approveMessage: vi.fn(async () => ({})) }));
vi.mock("../messages/send", () => ({ sendMessage: vi.fn(async () => h.sendResult) }));
vi.mock("../campaigns/mailbox", () => ({ getSenderMailbox: vi.fn(async () => ({ dailyLimit: 2 })), MAILBOX_DAILY_LIMIT_DEFAULT: 30 }));

const { sendFirstEmailAutomatically, DailySendLimitReached, LeftForPerson } = await import("./send");
const { sendMessage } = await import("../messages/send");
const { approveMessage } = await import("../messages/mutations");

const msg = (id: string, extra: Record<string, unknown> = {}) => ({ id, channel: "email", status: "draft", direction: "outbound", conversation_id: null, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  h.sentToday = 0;
  h.sendResult = { status: "sent" };
});

describe("sendFirstEmailAutomatically", () => {
  it("approves and sends the email draft through the Send path, marked automatic", async () => {
    h.messages = [msg("m1")];
    await sendFirstEmailAutomatically("w1", "p1");
    expect(approveMessage).toHaveBeenCalledWith("m1");
    expect(sendMessage).toHaveBeenCalledWith("m1", { automatic: true });
  });

  it("stops at the mailbox's daily limit without sending", async () => {
    h.sentToday = 2;
    h.messages = [msg("m1")];
    await expect(sendFirstEmailAutomatically("w1", "p1")).rejects.toBeInstanceOf(DailySendLimitReached);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("leaves LinkedIn and WhatsApp drafts, and failed or approved ones, for the person", async () => {
    h.messages = [msg("m1", { channel: "linkedin" }), msg("m2", { status: "failed" }), msg("m3", { status: "approved" })];
    await expect(sendFirstEmailAutomatically("w1", "p1")).rejects.toBeInstanceOf(LeftForPerson);
    expect(approveMessage).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("never sends a follow-up: only a prospect's first email", async () => {
    h.messages = [msg("m0", { status: "sent", conversation_id: "c1" }), msg("m1")];
    await expect(sendFirstEmailAutomatically("w1", "p1")).rejects.toThrow(/follow-up waits for you/);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("reports a refused or failed send as left for the person, never as sent", async () => {
    h.messages = [msg("m1")];
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error("This address needs your confirmation."));
    await expect(sendFirstEmailAutomatically("w1", "p1")).rejects.toThrow(/needs your confirmation/);
    h.sendResult = { status: "failed", failure_reason: "SMTP refused" };
    await expect(sendFirstEmailAutomatically("w1", "p1")).rejects.toThrow(/Not sent: SMTP refused/);
  });
});

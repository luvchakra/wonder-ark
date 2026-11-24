import { beforeEach, describe, expect, it, vi } from "vitest";

/** PRIV-1: investor outreach honours opt-outs and carries one-click unsubscribe.
 * EMAIL-SMTP-01: it goes through the platform's SMTP mailbox. */

const h = vi.hoisted(() => ({ send: vi.fn(), prepare: vi.fn(), sender: null as { fromEmail: string; fromName: string } | null }));
vi.mock("@cofounderai/core/email/platform-mailer", () => ({
  EMAIL_NOT_SET_UP: "Email sending isn't set up yet.",
  platformSender: async () => h.sender,
  sendPlatformEmail: (...args: unknown[]) => h.send(...args),
}));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ prepareOutreachEmail: h.prepare }));

const { deliverInvestorEmail } = await import("./outreach-send");

const INPUT = { businessId: "biz-1", to: "p@fund.vc", subject: "Intro", body: "Hello", brandName: "Acme", websiteUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.sender = { fromEmail: "founder@acme.com", fromName: "Acme" };
});

describe("deliverInvestorEmail (PRIV-1)", () => {
  it("does not send to an investor who opted out, and says so", async () => {
    h.prepare.mockResolvedValue({ suppressed: true });
    const result = await deliverInvestorEmail(INPUT);
    expect(h.prepare).toHaveBeenCalledWith("biz-1", "p@fund.vc");
    expect(h.send).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, provider: "smtp", reason: expect.stringContaining("unsubscribed") });
  });

  it("sends with the List-Unsubscribe headers and footer link otherwise", async () => {
    const headers = { "List-Unsubscribe": "<https://x/api/unsubscribe?t=1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    h.prepare.mockResolvedValue({ suppressed: false, unsubscribeUrl: "https://x/api/unsubscribe?t=1", headers });
    h.send.mockResolvedValue({ status: "sent", messageId: "<msg_1@secureserver.net>" });
    const result = await deliverInvestorEmail(INPUT);
    expect(result).toEqual({ ok: true, provider: "smtp", messageId: "<msg_1@secureserver.net>" });
    const sent = h.send.mock.calls[0]![0];
    expect(sent.headers).toEqual(headers);
    expect(sent.text).toContain("Unsubscribe: https://x/api/unsubscribe?t=1");
    expect(sent.html).toContain(">Unsubscribe</a>");
  });

  it("says what to set up without the mailbox, and reports a refused or uncertain send as not sent", async () => {
    h.sender = null;
    expect(await deliverInvestorEmail(INPUT)).toEqual({ ok: false, provider: "smtp", reason: "Email sending isn't set up yet." });
    h.sender = { fromEmail: "founder@acme.com", fromName: "Acme" };
    h.prepare.mockResolvedValue({ suppressed: false, unsubscribeUrl: "u", headers: {} });
    h.send.mockResolvedValue({ status: "unknown", reason: "Outcome unknown" });
    expect(await deliverInvestorEmail(INPUT)).toEqual({ ok: false, provider: "smtp", reason: "Outcome unknown" });
  });
});

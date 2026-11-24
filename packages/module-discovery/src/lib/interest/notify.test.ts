/**
 * The founder notification runs *after* the visitor's signup is already recorded, so its
 * contract is that it never throws: a failure here must not turn a successful signup into
 * a visitor-facing error. Both failure modes (no SMTP mailbox set up, a failed send) are
 * therefore tested for silence plus a server-side log. EMAIL-SMTP-01: it goes through the
 * platform's SMTP mailbox.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mailer = vi.hoisted(() => ({ sender: null as { fromEmail: string; fromName: string } | null, send: vi.fn() }));
vi.mock("@cofounderai/core/email/platform-mailer", () => ({
  platformSender: async () => mailer.sender,
  sendPlatformEmail: (...args: unknown[]) => mailer.send(...args),
}));

const { notifyInterestSignup } = await import("./notify");

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mailer.sender = { fromEmail: "hello@wonderapps.biz", fromName: "WonderArk" };
  mailer.send.mockResolvedValue({ status: "sent", messageId: "<m1>" });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("notifyInterestSignup", () => {
  it("sends the notification through the platform's mailbox, with the signup address in it", async () => {
    await notifyInterestSignup("visitor@example.com");
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.any(String) }));
    expect(mailer.send.mock.calls[0]![0].text).toContain("visitor@example.com");
  });

  it("escapes the address in the html part", async () => {
    await notifyInterestSignup('<script>x</script>"@example.com');
    expect(mailer.send.mock.calls[0]![0].html).not.toContain("<script>");
  });

  it("skips silently without the SMTP mailbox, logging instead and never the address", async () => {
    mailer.sender = null;
    await expect(notifyInterestSignup("visitor@example.com")).resolves.toBeUndefined();
    expect(mailer.send).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("visitor@example.com");
  });

  it("logs, but does not throw, when the mail server refuses it", async () => {
    mailer.send.mockResolvedValue({ status: "failed", reason: "The mail server refused the sign-in." });
    await expect(notifyInterestSignup("visitor@example.com")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("wasn't sent"), "The mail server refused the sign-in.");
  });
});

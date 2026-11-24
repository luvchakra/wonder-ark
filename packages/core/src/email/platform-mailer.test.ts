/** EMAIL-SMTP-01: the platform's own email goes out through the SMTP mailbox set on Keys. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const keys = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock("../admin/platform-key-store", () => ({ platformKey: async (name: string) => keys.values[name] }));

const { EMAIL_NOT_SET_UP, platformSender, sendPlatformEmail, sendPlatformEmailOnce } = await import("./platform-mailer");

const GODADDY = {
  SMTP_HOST: "smtpout.secureserver.net",
  SMTP_PORT: "465",
  SMTP_USERNAME: "hello@wonderapps.biz",
  SMTP_PASSWORD: "mailbox-secret",
  SMTP_FROM_EMAIL: "hello@wonderapps.biz",
};
const email = { to: "someone@example.org", subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

function transportReturning(result: Record<string, unknown> | Error) {
  // The message is typed so the assertions can read what was sent.
  const sendMail = vi.fn(async (_message: Record<string, unknown>) => {
    if (result instanceof Error) throw result;
    return result;
  });
  const options: Record<string, unknown>[] = [];
  return {
    sendMail,
    options,
    deps: {
      lookup: async () => [{ address: "92.204.80.0", family: 4 }],
      createTransport: (o: Record<string, unknown>) => {
        options.push(o);
        return { sendMail, close: () => {} };
      },
    },
  };
}

beforeEach(() => {
  keys.values = {};
});

describe("platformSender", () => {
  it("is null until the mailbox is set up, and never exposes the password", async () => {
    expect(await platformSender()).toBeNull();
    keys.values = { ...GODADDY, SMTP_FROM_NAME: "WonderArk" };
    expect(await platformSender()).toEqual({ fromEmail: "hello@wonderapps.biz", fromName: "WonderArk" });
    expect(JSON.stringify(await platformSender())).not.toContain("mailbox-secret");
  });
});

describe("sendPlatformEmail", () => {
  it("says what to set up, and sends nothing, without the mailbox", async () => {
    const t = transportReturning({ messageId: "<x>" });
    expect(await sendPlatformEmail(email, t.deps)).toEqual({ status: "failed", reason: EMAIL_NOT_SET_UP, mailbox: true });
    expect(t.sendMail).not.toHaveBeenCalled();
  });

  it("signs in to the GoDaddy mailbox over TLS and sends from its address", async () => {
    keys.values = GODADDY;
    const t = transportReturning({ messageId: "<m1@secureserver.net>", accepted: ["someone@example.org"] });
    expect(await sendPlatformEmail({ ...email, replyTo: "team@wonderapps.biz" }, t.deps)).toEqual({ status: "sent", messageId: "<m1@secureserver.net>" });
    expect(t.options[0]).toMatchObject({ port: 465, secure: true, auth: { user: "hello@wonderapps.biz", pass: "mailbox-secret" } });
    expect(t.sendMail.mock.calls[0]![0]).toMatchObject({ from: { address: "hello@wonderapps.biz" }, to: "someone@example.org", replyTo: "team@wonderapps.biz" });
  });

  it("uses STARTTLS on 587, and refuses a host on a private network", async () => {
    keys.values = { ...GODADDY, SMTP_PORT: "587" };
    const t = transportReturning({ messageId: "<m2>" });
    await sendPlatformEmail(email, t.deps);
    expect(t.options[0]).toMatchObject({ port: 587, secure: false, requireTLS: true });
    const inside = transportReturning({ messageId: "<m3>" });
    inside.deps.lookup = async () => [{ address: "10.0.0.5", family: 4 }];
    expect((await sendPlatformEmail(email, inside.deps)).status).toBe("failed");
    expect(inside.sendMail).not.toHaveBeenCalled();
  });
});

describe("sendPlatformEmailOnce", () => {
  it("throws for a retry only when the email surely didn't go", async () => {
    keys.values = GODADDY;
    const refused = transportReturning(Object.assign(new Error("auth"), { code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" }));
    await expect(sendPlatformEmailOnce(email, refused.deps)).rejects.toThrow(/sign-in/);
    const dropped = transportReturning(Object.assign(new Error("socket"), { code: "ESOCKET" }));
    expect((await sendPlatformEmailOnce(email, dropped.deps)).status).toBe("unknown");
  });
});

/**
 * DISC-CAMP-P0-02.4: connecting and testing the mailbox a workspace sends from. The
 * tables are held in memory and the SMTP library and DNS lookup are injected: no test
 * opens a connection. Pinned here:
 *  - only a licensed member with discovery.manage saves or tests a mailbox;
 *  - a private or malformed host, or a non-mail port, is refused before anything is stored;
 *  - the password is stored encrypted, kept when an edit leaves it blank, and appears in
 *    no view, outcome, audit entry or log line;
 *  - "Send a test to me" goes to the acting user's own address and verifies the mailbox
 *    only when the server accepted it; an unknown outcome does not verify it;
 *  - the send path gets a mailbox only when it is verified.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "../data-sources/__tests__/memory-db";
import type { SmtpTransportFactory } from "./smtp";

const h = vi.hoisted(() => ({
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLog: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
}));

vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: h.writeAuditLog }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../../db/admin", () => ({ createAdminClient: h.createAdminClient }));
vi.mock("../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace, getBusiness: vi.fn(async () => ({ id: "b1", name: "Acme Software" })) }));

const { getSenderMailbox, loadMailboxForSending, saveSenderMailbox, sendMailboxTest } = await import("./mailbox");

const WORKSPACE = "w1";
const BUSINESS = "b1";
const PASSWORD = "app-password-9f2c";
const USER_EMAIL = "owner@acme.example";
const publicLookup = vi.fn(async () => [{ address: "142.250.183.109", family: 4 }]);
const input = {
  fromName: "Asha at Acme",
  fromEmail: "Asha@Acme.example",
  smtpHost: "smtp.acme.example",
  smtpPort: 587,
  username: "asha@acme.example",
  password: PASSWORD,
  dailyLimit: 30,
};

let db: ReturnType<typeof createMemoryDb>;
let logged: ReturnType<typeof vi.spyOn>;

function setup(mailboxes: Record<string, unknown>[] = []) {
  db = createMemoryDb({ sender_mailboxes: mailboxes });
  h.createClient.mockResolvedValue(Object.assign(db.client, { auth: { getUser: async () => ({ data: { user: { id: "u1", email: USER_EMAIL } } }) } }));
  h.createAdminClient.mockReturnValue(db.client);
}
const stored = () => db.rows("sender_mailboxes")[0]!;
const transport = (sendMail: () => Promise<unknown>) => {
  const send = vi.fn((_message: Record<string, unknown>) => sendMail());
  return { send, factory: vi.fn((() => ({ sendMail: send, close: vi.fn() })) as unknown as SmtpTransportFactory) };
};
/** Everything a caller, a log or the audit trail got to see. */
const exposed = (...extra: unknown[]) => JSON.stringify([extra, h.writeAuditLog.mock.calls, logged.mock.calls]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_KEY_ENCRYPTION_SECRET", randomBytes(32).toString("base64"));
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  h.getBusinessIdForWorkspace.mockResolvedValue(BUSINESS);
  setup();
});
afterEach(() => {
  vi.unstubAllEnvs();
  logged.mockRestore();
});

describe("saving a mailbox", () => {
  it("stores the settings with the password encrypted, and shows no password back", async () => {
    const outcome = await saveSenderMailbox(WORKSPACE, input, { lookup: publicLookup });

    expect(outcome).toEqual({ status: "saved" });
    expect(stored()).toMatchObject({ workspace_id: WORKSPACE, from_email: "asha@acme.example", smtp_host: "smtp.acme.example", smtp_port: 587, daily_limit: 30, imap_host: null });
    expect(stored().secret_encrypted).toEqual(expect.any(String));
    expect(String(stored().secret_encrypted)).not.toContain(PASSWORD);
    const view = await getSenderMailbox(WORKSPACE);
    expect(view).toMatchObject({ fromEmail: "asha@acme.example", smtpHost: "smtp.acme.example" });
    expect(JSON.stringify(view)).not.toContain(PASSWORD);
    expect(Object.keys(view!)).not.toContain("password");
    expect(exposed(outcome, view)).not.toContain(PASSWORD);
    expect(h.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "discovery.sender_mailbox.connected", after: expect.objectContaining({ passwordChanged: true }) }));
  });

  it("checks the licence and the permission before anything else", async () => {
    h.requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (discovery.manage)."));
    await expect(saveSenderMailbox(WORKSPACE, input, { lookup: publicLookup })).rejects.toThrow("discovery.manage");
    h.requireModule.mockRejectedValueOnce(new Error("Discovery is not licensed."));
    await expect(saveSenderMailbox(WORKSPACE, input, { lookup: publicLookup })).rejects.toThrow("not licensed");
    expect(db.rows("sender_mailboxes")).toHaveLength(0);
    expect(publicLookup).not.toHaveBeenCalled();
    expect(h.requirePermission).toHaveBeenCalledWith(BUSINESS, "discovery.manage");
  });

  it.each([
    ["a host on a private network", { smtpHost: "smtp.acme.example" }, [{ address: "10.0.0.5", family: 4 }], "private network"],
    ["the cloud metadata address", { smtpHost: "169.254.169.254" }, [], "private network"],
    ["a port that is not 465 or 587", { smtpPort: 25 }, [{ address: "142.250.183.109", family: 4 }], "465 or 587"],
    ["a host written as a URL", { smtpHost: "http://smtp.acme.example" }, [], "host name"],
    ["a reply server on a private network", { imapHost: "imap.acme.example" }, [{ address: "192.168.1.9", family: 4 }], "private network"],
  ])("refuses %s and stores nothing", async (_label, change, addresses, words) => {
    const outcome = await saveSenderMailbox(WORKSPACE, { ...input, ...change }, { lookup: async () => addresses });
    expect(outcome.status).toBe("invalid");
    expect(outcome.status === "invalid" && outcome.message).toContain(words);
    expect(db.rows("sender_mailboxes")).toHaveLength(0);
  });

  describe("with only the address and the password", () => {
    const only = { fromEmail: "asha@acme.example", password: PASSWORD };
    const mx = (...exchanges: string[]) => async () => exchanges.map((exchange, priority) => ({ exchange, priority }));

    it.each([
      ["GoDaddy", ["smtp.secureserver.net", "mailstore1.secureserver.net"], "smtpout.secureserver.net", 465, "imap.secureserver.net"],
      ["Google", ["aspmx.l.google.com"], "smtp.gmail.com", 465, "imap.gmail.com"],
      ["Microsoft 365", ["acme-example.mail.protection.outlook.com"], "smtp.office365.com", 587, "outlook.office365.com"],
      ["Zoho", ["mx.zoho.com"], "smtp.zoho.com", 465, "imap.zoho.com"],
      ["Zoho India", ["mx.zoho.in"], "smtp.zoho.in", 465, "imap.zoho.in"],
    ])("fills the servers from the fixed table for %s", async (_label, exchanges, smtpHost, smtpPort, imapHost) => {
      const outcome = await saveSenderMailbox(WORKSPACE, only, { lookup: publicLookup, resolveMx: mx(...exchanges) });

      expect(outcome.status).toBe("saved");
      expect(stored()).toMatchObject({
        from_email: "asha@acme.example",
        from_name: "Acme Software",
        username: "asha@acme.example",
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        imap_host: imapHost,
        imap_port: 993,
        daily_limit: 30,
      });
      // Nothing DNS returned is stored: only hosts from the table.
      expect(JSON.stringify(stored())).not.toContain(exchanges[0]);
    });

    it("passes on the provider's sign-in hint for a Google mailbox only", async () => {
      expect(await saveSenderMailbox(WORKSPACE, only, { lookup: publicLookup, resolveMx: mx("aspmx.l.google.com") })).toEqual({
        status: "saved",
        signInHint: "Google mailboxes need an app password here, not your usual password.",
      });
      setup();
      expect(await saveSenderMailbox(WORKSPACE, only, { lookup: publicLookup, resolveMx: mx("mailstore1.secureserver.net") })).toEqual({ status: "saved" });
    });

    it.each([
      ["the provider is not in the table", mx("mx1.unknownhost.example")],
      ["the domain has no MX records", mx()],
      ["the lookup fails", async () => { throw new Error("ESERVFAIL"); }],
    ])("asks for the servers, and stores nothing, when %s", async (_label, resolveMx) => {
      const outcome = await saveSenderMailbox(WORKSPACE, only, { lookup: publicLookup, resolveMx });
      expect(outcome).toEqual({ status: "invalid", message: "We couldn't work out the mail servers from that address. Open Server settings and enter them." });
      expect(db.rows("sender_mailboxes")).toHaveLength(0);
    });

    it("still puts the suggested host through the address guard", async () => {
      const outcome = await saveSenderMailbox(WORKSPACE, only, { lookup: async () => [{ address: "10.0.0.5", family: 4 }], resolveMx: mx("mailstore1.secureserver.net") });
      expect(outcome).toMatchObject({ status: "invalid" });
      expect(outcome.status === "invalid" && outcome.message).toContain("private network");
      expect(db.rows("sender_mailboxes")).toHaveLength(0);
    });

    it("uses servers a person typed as typed, without looking anything up", async () => {
      const resolveMx = vi.fn(mx("mailstore1.secureserver.net"));
      await saveSenderMailbox(WORKSPACE, { ...only, smtpHost: "mail.acme.example", smtpPort: 587 }, { lookup: publicLookup, resolveMx });
      expect(resolveMx).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ smtp_host: "mail.acme.example", smtp_port: 587, imap_host: null });
    });

    it("keeps the saved servers when the same address reconnects with the settings folded away", async () => {
      await saveSenderMailbox(WORKSPACE, { ...only, fromName: "Asha", smtpHost: "mail.acme.example", smtpPort: 587, imapHost: "imap.acme.example", dailyLimit: 50 }, { lookup: publicLookup });
      const resolveMx = vi.fn(mx("mailstore1.secureserver.net"));

      expect(await saveSenderMailbox(WORKSPACE, { fromEmail: "asha@acme.example", password: "new-password" }, { lookup: publicLookup, resolveMx })).toEqual({ status: "saved" });

      expect(resolveMx).not.toHaveBeenCalled();
      expect(stored()).toMatchObject({ from_name: "Asha", smtp_host: "mail.acme.example", smtp_port: 587, imap_host: "imap.acme.example", daily_limit: 50 });
    });

    it("starts again from the new address's own domain when the address changes", async () => {
      await saveSenderMailbox(WORKSPACE, { ...only, smtpHost: "mail.acme.example", smtpPort: 587 }, { lookup: publicLookup });
      await saveSenderMailbox(WORKSPACE, { fromEmail: "asha@other.example", password: PASSWORD }, { lookup: publicLookup, resolveMx: mx("aspmx.l.google.com") });
      expect(stored()).toMatchObject({ from_email: "asha@other.example", username: "asha@other.example", smtp_host: "smtp.gmail.com", imap_host: "imap.gmail.com" });
    });
  });

  it("needs a password the first time, and keeps the stored one when an edit leaves it blank", async () => {
    expect(await saveSenderMailbox(WORKSPACE, { ...input, password: "" }, { lookup: publicLookup })).toMatchObject({ status: "invalid" });
    await saveSenderMailbox(WORKSPACE, input, { lookup: publicLookup });
    const secret = stored().secret_encrypted;

    expect(await saveSenderMailbox(WORKSPACE, { ...input, password: "", dailyLimit: 50, imapHost: "imap.acme.example" }, { lookup: publicLookup })).toEqual({ status: "saved" });

    expect(db.rows("sender_mailboxes")).toHaveLength(1);
    expect(stored()).toMatchObject({ daily_limit: 50, imap_host: "imap.acme.example", imap_port: 993 });
    expect(stored().secret_encrypted).toBe(secret);
  });

  it("holds the daily limit to 200", async () => {
    const outcome = await saveSenderMailbox(WORKSPACE, { ...input, dailyLimit: 201 }, { lookup: publicLookup });
    expect(outcome).toMatchObject({ status: "invalid" });
    expect(outcome.status === "invalid" && outcome.message).toContain("200");
  });
});

describe("Send a test to me", () => {
  beforeEach(async () => {
    await saveSenderMailbox(WORKSPACE, input, { lookup: publicLookup });
    Object.assign(stored(), { status: "unverified", verified_at: null, last_error: null });
    h.writeAuditLog.mockClear();
  });

  it("sends to the acting user's own address and verifies the mailbox when the server accepts it", async () => {
    const { send, factory } = transport(async () => ({ messageId: "<t@acme.example>", accepted: [USER_EMAIL] }));

    const outcome = await sendMailboxTest(WORKSPACE, { lookup: publicLookup, createTransport: factory });

    expect(outcome).toEqual({ status: "verified", sentTo: USER_EMAIL });
    expect(send.mock.calls[0]![0]).toMatchObject({ to: USER_EMAIL, from: { address: "asha@acme.example" } });
    expect((factory.mock.calls[0]![0] as { auth: { pass: string } }).auth.pass).toBe(PASSWORD);
    expect(stored()).toMatchObject({ status: "verified", last_error: null });
    expect(stored().verified_at).toEqual(expect.any(String));
    expect(exposed(outcome)).not.toContain(PASSWORD);
  });

  it.each([
    ["the server refuses the sign-in", Object.assign(new Error(`535 ${PASSWORD}`), { code: "EAUTH", responseCode: 535 }), "sign-in"],
    ["the outcome is unknown", Object.assign(new Error("Timeout"), { code: "ETIMEDOUT", timeoutType: "SOCKET_TIMEOUT" }), "Outcome unknown"],
  ])("does not verify the mailbox when %s", async (_label, error, words) => {
    const { factory } = transport(async () => {
      throw error;
    });

    const outcome = await sendMailboxTest(WORKSPACE, { lookup: publicLookup, createTransport: factory });

    expect(outcome.status).toBe("failed");
    expect(outcome.status === "failed" && outcome.message).toContain(words);
    expect(stored()).toMatchObject({ status: "failed", verified_at: null });
    expect(String(stored().last_error)).toContain(words);
    expect(exposed(outcome, stored().last_error)).not.toContain(PASSWORD);
    expect(await loadMailboxForSending(WORKSPACE)).toBeNull();
  });

  it("is refused without the permission, before the password is read", async () => {
    h.requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (discovery.manage)."));
    const { factory } = transport(async () => ({ messageId: "<t@x>" }));
    await expect(sendMailboxTest(WORKSPACE, { lookup: publicLookup, createTransport: factory })).rejects.toThrow("discovery.manage");
    expect(factory).not.toHaveBeenCalled();
    expect(h.createAdminClient).not.toHaveBeenCalled();
  });

  it("says so when no mailbox was saved", async () => {
    setup();
    expect(await sendMailboxTest(WORKSPACE, { lookup: publicLookup })).toEqual({ status: "failed", message: "Save the mailbox's details first." });
  });
});

describe("the mailbox the send path gets", () => {
  it("is only ever a verified one, with the password decrypted for the connection", async () => {
    await saveSenderMailbox(WORKSPACE, input, { lookup: publicLookup });
    Object.assign(stored(), { status: "unverified" });
    expect(await loadMailboxForSending(WORKSPACE)).toBeNull();
    Object.assign(stored(), { status: "failed" });
    expect(await loadMailboxForSending(WORKSPACE)).toBeNull();

    Object.assign(stored(), { status: "verified" });
    expect(await loadMailboxForSending(WORKSPACE)).toMatchObject({
      fromEmail: "asha@acme.example",
      dailyLimit: 30,
      connection: { host: "smtp.acme.example", port: 587, username: "asha@acme.example", password: PASSWORD },
      imap: null,
    });
  });

  it("is null, and logs nothing that names the password, when the stored password cannot be read", async () => {
    setup([{ id: "m1", workspace_id: WORKSPACE, status: "verified", secret_encrypted: "not-a-ciphertext", smtp_host: "smtp.acme.example", smtp_port: 587 }]);
    expect(await loadMailboxForSending(WORKSPACE)).toBeNull();
    expect(exposed()).not.toContain("not-a-ciphertext");
    expect(await loadMailboxForSending("w-none")).toBeNull();
  });
});

/**
 * DISC-CAMP-P0-02.4: working out a mailbox's servers from its address. The DNS lookup is
 * injected. Pinned here: each row of the fixed table, no match, a failed lookup, and
 * that only a host written in the table is ever returned.
 */
import { describe, expect, it, vi } from "vitest";
import { settingsForMx, suggestMailSettings } from "./mail-provider";

const mx = (...exchanges: string[]) => async () => exchanges.map((exchange, index) => ({ exchange, priority: (index + 1) * 10 }));

describe("the fixed table", () => {
  it.each([
    [["smtp.secureserver.net", "mailstore1.secureserver.net"], { provider: "godaddy", smtpHost: "smtpout.secureserver.net", smtpPort: 465, imapHost: "imap.secureserver.net" }],
    [["ASPMX.L.GOOGLE.COM."], { provider: "google", smtpHost: "smtp.gmail.com", smtpPort: 465, imapHost: "imap.gmail.com" }],
    [["alt1.aspmx.l.googlemail.com"], { provider: "google", smtpHost: "smtp.gmail.com", smtpPort: 465, imapHost: "imap.gmail.com" }],
    [["acme-example.mail.protection.outlook.com"], { provider: "microsoft", smtpHost: "smtp.office365.com", smtpPort: 587, imapHost: "outlook.office365.com" }],
    [["acme.olc.protection.outlook.com"], { provider: "microsoft", smtpHost: "smtp.office365.com", smtpPort: 587, imapHost: "outlook.office365.com" }],
    [["mx.zoho.com", "mx2.zoho.com"], { provider: "zoho", smtpHost: "smtp.zoho.com", smtpPort: 465, imapHost: "imap.zoho.com" }],
    [["mx.zoho.in"], { provider: "zoho", smtpHost: "smtp.zoho.in", smtpPort: 465, imapHost: "imap.zoho.in" }],
  ])("%j", (exchanges, expected) => {
    expect(settingsForMx(exchanges)).toMatchObject(expected);
  });

  it.each([
    [["mx1.unknownhost.example"]],
    [[]],
    // A look-alike is not the provider: the name must be the suffix itself or end with ".suffix".
    [["evilgoogle.com"]],
    [["google.com.attacker.example"]],
    [["secureserver.net.attacker.example"]],
  ])("has no row for %j", (exchanges) => {
    expect(settingsForMx(exchanges)).toBeNull();
  });

  it("tells a Google mailbox owner about app passwords, and nobody else", () => {
    expect(settingsForMx(["aspmx.l.google.com"])?.signInHint).toContain("app password");
    expect(settingsForMx(["mailstore1.secureserver.net"])?.signInHint).toBeUndefined();
  });
});

describe("suggestMailSettings", () => {
  it("looks up the address's own domain and returns the row's hosts, never a name DNS gave", async () => {
    const resolveMx = vi.fn(mx("smtp.secureserver.net", "mailstore1.secureserver.net"));
    const settings = await suggestMailSettings(" Owner@WonderArk.example ", resolveMx);
    expect(resolveMx).toHaveBeenCalledWith("wonderark.example");
    expect(settings).toMatchObject({ provider: "godaddy", smtpHost: "smtpout.secureserver.net", imapHost: "imap.secureserver.net" });
    expect(JSON.stringify(settings)).not.toMatch(/mailstore1|smtp\.secureserver/);
  });

  it("suggests nothing when the provider is unknown, there are no records, or the lookup fails", async () => {
    expect(await suggestMailSettings("a@unknown.example", mx("mx.unknownhost.example"))).toBeNull();
    expect(await suggestMailSettings("a@unknown.example", mx())).toBeNull();
    expect(
      await suggestMailSettings("a@unknown.example", async () => {
        throw new Error("ESERVFAIL");
      }),
    ).toBeNull();
  });

  it("does not look anything up for something that is not an address", async () => {
    const resolveMx = vi.fn(mx("aspmx.l.google.com"));
    for (const value of ["", "no-at-sign", "a@", "a@localhost", "a@10.0.0.1", "a@bad domain.example"]) {
      expect(await suggestMailSettings(value, resolveMx)).toBeNull();
    }
    expect(resolveMx).not.toHaveBeenCalled();
  });
});

/**
 * DISC-CAMP-P0-04.1: reading the mailbox. The IMAP session and the DNS lookup are
 * injected; no test opens a connection. Pinned here: only a reply from someone enrolled
 * and a failure notice naming an address we sent to are kept; the body of anything else
 * is never fetched; the host guard runs first; only what is new is listed.
 */
import { describe, expect, it, vi } from "vitest";
import { failedRecipientsIn, htmlToText, looksLikeFailureNotice, normaliseMessageId, readInbox, textPartsOf, type ImapSession, type InboxEnvelope } from "./imap";

const PASSWORD = "app-password-9f2c";
const mailbox = { host: "imap.acme.example", port: 993, username: "asha@acme.example", password: PASSWORD };
const publicLookup = async () => [{ address: "142.250.183.109", family: 4 }];
const query = {
  since: new Date("2026-11-10T00:00:00Z"),
  lastSeenUid: null,
  uidValidity: null,
  knownSenders: new Set(["buyer@prospect.example"]),
  sentTo: new Set(["buyer@prospect.example", "gone@prospect.example"]),
};

const envelope = (uid: number, from: string | null, overrides: Partial<InboxEnvelope> = {}): InboxEnvelope => ({ uid, from, subject: "Re: An idea", messageId: `<${uid}@mail>`, contentType: "text/plain", ...overrides });

function session(envelopes: InboxEnvelope[], bodies: Record<number, string> = {}) {
  const fake = {
    open: vi.fn(async () => ({ uidValidity: 77 })),
    list: vi.fn(async (_criteria: { afterUid: number } | { since: Date }, _limit: number) => envelopes),
    text: vi.fn(async (uid: number) => bodies[uid] ?? ""),
    close: vi.fn(async () => {}),
  } satisfies ImapSession;
  const connect = vi.fn(async (_options: { address: string; host: string; port: number; username: string; password: string }) => fake);
  return { fake, connect };
}

describe("readInbox", () => {
  it("keeps a reply from someone enrolled, and never fetches the body of anyone else's mail", async () => {
    const { fake, connect } = session(
      [envelope(1, "friend@elsewhere.example", { subject: "Lunch?" }), envelope(2, "buyer@prospect.example"), envelope(3, "bank@elsewhere.example", { subject: "Your statement" })],
      { 1: "PRIVATE one", 2: "Tell me more", 3: "PRIVATE three" },
    );

    const result = await readInbox(mailbox, query, { lookup: publicLookup, connect });

    expect(result).toEqual({
      ok: true,
      uidValidity: 77,
      lastUid: 3,
      ignored: 2,
      messages: [{ kind: "reply", uid: 2, from: "buyer@prospect.example", subject: "Re: An idea", messageId: "<2@mail>", text: "Tell me more" }],
    });
    expect(fake.text.mock.calls.map(([uid]) => uid)).toEqual([2]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(fake.close).toHaveBeenCalled();
  });

  it("keeps a reply from an unknown address when it answers an email we sent, and leaves one that does not unread", async () => {
    const { fake, connect } = session(
      [
        envelope(7, "owner.personal@elsewhere.example", { inReplyTo: " <out1@acme.example> " }),
        envelope(8, "stranger@elsewhere.example", { inReplyTo: "<someone-elses-thread@other.example>" }),
        envelope(9, "stranger@elsewhere.example", { inReplyTo: null }),
      ],
      { 7: "Yes, call me", 8: "PRIVATE eight", 9: "PRIVATE nine" },
    );

    const result = await readInbox(mailbox, { ...query, sentMessageIds: new Set(["out1@acme.example"]) }, { lookup: publicLookup, connect });

    expect(result).toMatchObject({
      ok: true,
      ignored: 2,
      messages: [{ kind: "reply", uid: 7, from: "owner.personal@elsewhere.example", text: "Yes, call me", answers: "out1@acme.example" }],
    });
    expect(fake.text.mock.calls.map(([uid]) => uid)).toEqual([7]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("does not mark a reply from an enrolled address as answering anything: its sender already says whose it is", async () => {
    const { connect } = session([envelope(2, "buyer@prospect.example", { inReplyTo: "<out1@acme.example>" })], { 2: "Tell me more" });
    const result = await readInbox(mailbox, { ...query, sentMessageIds: new Set(["out1@acme.example"]) }, { lookup: publicLookup, connect });
    expect(result.ok && result.messages[0]).not.toHaveProperty("answers");
  });

  it("keeps a failure notice only when it names an address we sent to", async () => {
    const { fake, connect } = session(
      [
        envelope(5, "mailer-daemon@mail.example", { subject: "Undelivered Mail Returned to Sender", contentType: "multipart/report" }),
        envelope(6, "mailer-daemon@mail.example", { subject: "Delivery Status Notification (Failure)", contentType: "multipart/report" }),
      ],
      { 5: "Final-Recipient: rfc822; Gone@Prospect.example\nAction: failed\nStatus: 5.1.1", 6: "Final-Recipient: rfc822; someone@private.example\nAction: failed" },
    );

    const result = await readInbox(mailbox, query, { lookup: publicLookup, connect });

    expect(result).toMatchObject({ ok: true, lastUid: 6, ignored: 1, messages: [{ kind: "bounce", uid: 5, failedRecipients: ["gone@prospect.example"] }] });
    expect(JSON.stringify(result)).not.toContain("someone@private.example");
    expect(fake.text).toHaveBeenCalledTimes(2);
  });

  it("starts the first read from the given date, and later ones after the last message looked at", async () => {
    const first = session([]);
    await readInbox(mailbox, query, { lookup: publicLookup, connect: first.connect });
    expect(first.fake.list.mock.calls[0]![0]).toEqual({ since: query.since });

    const later = session([envelope(40, "buyer@prospect.example"), envelope(41, "buyer@prospect.example")], { 40: "old", 41: "new" });
    const result = await readInbox(mailbox, { ...query, lastSeenUid: 40, uidValidity: 77 }, { lookup: publicLookup, connect: later.connect });
    expect(later.fake.list.mock.calls[0]![0]).toEqual({ afterUid: 40 });
    // A message at or below the last one looked at is not read again.
    expect(result).toMatchObject({ ok: true, lastUid: 41 });
    expect(result.ok && result.messages.map((message) => message.uid)).toEqual([41]);
  });

  it("starts again from the date when the mailbox's UIDVALIDITY changed", async () => {
    const { fake, connect } = session([]);
    await readInbox(mailbox, { ...query, lastSeenUid: 40, uidValidity: 12 }, { lookup: publicLookup, connect });
    expect(fake.list.mock.calls[0]![0]).toEqual({ since: query.since });
  });

  it("reports nothing new as nothing new", async () => {
    const { connect } = session([]);
    expect(await readInbox(mailbox, query, { lookup: publicLookup, connect })).toEqual({ ok: true, uidValidity: 77, lastUid: null, messages: [], ignored: 0 });
  });

  it.each([
    ["a private address", [{ address: "10.0.0.5", family: 4 }], 993, "private network"],
    ["a port other than 993", [{ address: "142.250.183.109", family: 4 }], 143, "993"],
  ])("refuses %s before anything connects", async (_label, addresses, port, words) => {
    const { connect } = session([]);
    const result = await readInbox({ ...mailbox, port }, query, { lookup: async () => addresses, connect });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(words);
    expect(connect).not.toHaveBeenCalled();
  });

  it("connects to the checked address, keeping the name for the certificate", async () => {
    const { connect } = session([]);
    await readInbox(mailbox, query, { lookup: publicLookup, connect });
    expect(connect.mock.calls[0]![0]).toMatchObject({ address: "142.250.183.109", host: "imap.acme.example", port: 993 });
  });

  it("says why, in fixed words and without the password, when the mailbox cannot be read", async () => {
    const refused = await readInbox(mailbox, query, {
      lookup: publicLookup,
      connect: async () => {
        throw new Error(`AUTHENTICATIONFAILED ${PASSWORD}`);
      },
    });
    const { fake, connect } = session([]);
    fake.list.mockRejectedValue(new Error(`socket closed ${PASSWORD}`));
    const broken = await readInbox(mailbox, query, { lookup: publicLookup, connect });

    expect(refused).toEqual({ ok: false, reason: "The incoming mail server couldn't be reached or refused the sign-in." });
    expect(broken).toEqual({ ok: false, reason: "The mailbox couldn't be read." });
    expect(fake.close).toHaveBeenCalled();
    expect(JSON.stringify([refused, broken])).not.toContain(PASSWORD);
  });
});

describe("recognising a failure notice", () => {
  it("goes by the envelope: a report, or a mail system sender with a failure subject", () => {
    expect(looksLikeFailureNotice({ from: "x@y.example", subject: "hello", contentType: "multipart/report" })).toBe(true);
    expect(looksLikeFailureNotice({ from: "mailer-daemon@mail.example", subject: "Mail delivery failed: returning message to sender", contentType: "text/plain" })).toBe(true);
    expect(looksLikeFailureNotice({ from: "postmaster@mail.example", subject: "Undeliverable: An idea", contentType: "multipart/mixed" })).toBe(true);
    expect(looksLikeFailureNotice({ from: "buyer@prospect.example", subject: "Undeliverable?", contentType: "text/plain" })).toBe(false);
    expect(looksLikeFailureNotice({ from: "mailer-daemon@mail.example", subject: "Welcome", contentType: "text/plain" })).toBe(false);
    expect(looksLikeFailureNotice({ from: null, subject: null, contentType: null })).toBe(false);
  });

  it("finds only the addresses that are ours", () => {
    const sentTo = new Set(["gone@prospect.example"]);
    expect(failedRecipientsIn("<gone@prospect.example>: host said 550; also other@private.example and GONE@prospect.example", sentTo)).toEqual(["gone@prospect.example"]);
    expect(failedRecipientsIn("nothing here", sentTo)).toEqual([]);
  });
});

describe("a reply's text", () => {
  it("prefers the plain-text part, and never reads an attachment or an arbitrary first part", () => {
    const alternative = { type: "multipart/alternative", childNodes: [{ part: "1", type: "text/plain" }, { part: "2", type: "text/html" }] };
    expect(textPartsOf(alternative)).toEqual([{ part: "1", html: false }]);

    const htmlOnly = { type: "multipart/mixed", childNodes: [{ part: "1", type: "text/html" }, { part: "2", type: "application/pdf", disposition: "attachment" }] };
    expect(textPartsOf(htmlOnly)).toEqual([{ part: "1", html: true }]);

    expect(textPartsOf({ type: "text/html" })).toEqual([{ part: "1", html: true }]);
    expect(textPartsOf({ type: "text/plain" })).toEqual([{ part: "1", html: false }]);
    // No text part at all: there is no text, rather than a container or a file read as text.
    expect(textPartsOf({ type: "multipart/mixed", childNodes: [{ part: "1", type: "image/png" }, { part: "2", type: "text/plain", disposition: "attachment" }] })).toEqual([]);
    expect(textPartsOf({ type: "application/pdf" })).toEqual([]);
    expect(textPartsOf(undefined)).toEqual([]);
  });

  it("reads a failure report's status part as well as its text", () => {
    const report = { type: "multipart/report", childNodes: [{ part: "1", type: "text/plain" }, { part: "2", type: "message/delivery-status" }, { part: "3", type: "message/rfc822" }] };
    expect(textPartsOf(report)).toEqual([{ part: "1", html: false }, { part: "2", html: false }]);
  });

  it("turns HTML into text: no tags, scripts or styles, line breaks kept, entities decoded", () => {
    const html = `<html><head><style>p{color:red}</style><title>x</title></head><body><!-- hidden --><p>Hi&nbsp;Asha,</p><div>Yes &amp; thanks.<br>Call me &lt;tomorrow&gt; &#8212; it&#39;s fine.</div><script>alert("x")</script><ul><li>One</li><li>Two</li></ul></body></html>`;
    expect(htmlToText(html)).toBe("Hi Asha,\nYes & thanks.\nCall me <tomorrow> — it's fine.\nOne\nTwo");
    expect(htmlToText("plain text")).toBe("plain text");
    expect(htmlToText("<p>a</p>\n\n\n\n<p>b</p>")).toBe("a\n\nb");
    expect(htmlToText('<img src=x onerror="alert(1)">Hello')).toBe("Hello");
  });

  it("compares Message-IDs without their brackets", () => {
    expect(normaliseMessageId(" <abc@mail.example> ")).toBe("abc@mail.example");
    expect(normaliseMessageId("abc@mail.example")).toBe("abc@mail.example");
    expect(normaliseMessageId("  ")).toBeNull();
    expect(normaliseMessageId(null)).toBeNull();
  });
});


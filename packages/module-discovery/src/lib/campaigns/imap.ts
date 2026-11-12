import { IMAP_PORT, resolveSafeHost, type HostLookup } from "./host-guard";

/**
 * DISC-CAMP-P0-04.1: reading a workspace's own mailbox for replies and bounces.
 *
 * A campaign sends from the business's mailbox, so replies land there and there is no
 * delivery webhook. This looks at the inbox and keeps exactly these kinds of message:
 *  (a) one whose From address is someone this workspace enrolled, or whose In-Reply-To
 *      names an email this workspace sent (people often answer from another address
 *      than the one written to); and
 *  (b) a delivery-failure notice that names an address this workspace sent to.
 *
 * Everything else in the mailbox is the business's private mail. It is decided on from
 * the envelope alone (sender, subject, structure); its body is never fetched, and
 * nothing about it is stored, logged or passed to a model. A failure notice's body is
 * read only to find which address failed, and is dropped unless that address is one of
 * ours.
 *
 * The mailbox is opened read-only: nothing is marked read, moved or deleted. The host
 * goes through the same address guard as SMTP, TLS on port 993 only, with timeouts. Only
 * messages after the last one looked at are listed (`last_seen_uid`); the first read
 * starts from a date the caller gives (when the mailbox began sending), not from the
 * start of the mailbox.
 */

export const INBOX_BATCH = 200;
const TEXT_LIMIT = 20_000;
const TIMEOUT_MS = 15_000;

export type InboxEnvelope = {
  uid: number;
  /** The From address, lower-cased, or null. */
  from: string | null;
  subject: string | null;
  messageId: string | null;
  /** The message's top-level content type, e.g. "multipart/report". */
  contentType: string | null;
  /** The Message-ID this message answers, from its In-Reply-To header, or null. */
  inReplyTo?: string | null;
};

/** What this module needs from an IMAP library: imapflow in production, a stand-in in
 * tests, which never open a connection. */
export type ImapSession = {
  /** Opens the inbox read-only and returns its UIDVALIDITY. */
  open(): Promise<{ uidValidity: number }>;
  /** Envelopes only, ascending by UID, at most `limit`. */
  list(criteria: { afterUid: number } | { since: Date }, limit: number): Promise<InboxEnvelope[]>;
  /** The message's text, for one this module decided to read. */
  text(uid: number): Promise<string>;
  close(): Promise<void>;
};
export type ImapConnector = (options: { address: string; host: string; port: number; username: string; password: string }) => Promise<ImapSession>;
export type ImapDeps = { lookup?: HostLookup; connect?: ImapConnector };

export type InboxMessage =
  | {
      kind: "reply";
      uid: number;
      from: string;
      subject: string | null;
      messageId: string | null;
      text: string;
      /** Set when the reply was recognised by the email it answers, not by its sender:
       * the Message-ID of that email, as this workspace recorded it. */
      answers?: string;
    }
  | { kind: "bounce"; uid: number; failedRecipients: string[] };

export type InboxRead =
  | {
      ok: true;
      uidValidity: number;
      /** The highest UID looked at, kept or not; null when there was nothing new. */
      lastUid: number | null;
      messages: InboxMessage[];
      /** Messages that were neither (a) nor (b). Counted, never read. */
      ignored: number;
    }
  | { ok: false; reason: string };

export type InboxQuery = {
  /** Where the first read starts. */
  since: Date;
  lastSeenUid: number | null;
  uidValidity: number | null;
  /** Lower-cased addresses of everyone this workspace enrolled. */
  knownSenders: ReadonlySet<string>;
  /** Lower-cased addresses this workspace sent a campaign email to. */
  sentTo: ReadonlySet<string>;
  /** Message-IDs of emails this workspace sent, normalised with `normaliseMessageId`. */
  sentMessageIds?: ReadonlySet<string>;
};

/** A Message-ID as it is compared: without its angle brackets or surrounding space. */
export function normaliseMessageId(value: string | null | undefined): string | null {
  const id = (value ?? "").trim().replace(/^<+|>+$/g, "").trim();
  return id.length > 0 ? id.slice(0, 500) : null;
}

const FAILURE_SENDER = /^(mailer-daemon|postmaster|mail-daemon|bounce|bounces|no-?reply-bounces)@/i;
const FAILURE_SUBJECT = /(undeliver|delivery (status notification|failure|has failed)|returned mail|mail delivery (failed|subsystem)|failure notice|could not be delivered)/i;
const ADDRESS = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Whether an envelope looks like a delivery-failure notice. Envelope only. */
export function looksLikeFailureNotice(envelope: Pick<InboxEnvelope, "from" | "subject" | "contentType">): boolean {
  if (envelope.contentType?.toLowerCase().startsWith("multipart/report")) return true;
  return Boolean(envelope.from && FAILURE_SENDER.test(envelope.from) && envelope.subject && FAILURE_SUBJECT.test(envelope.subject));
}

/** The addresses a failure notice names that this workspace sent to. */
export function failedRecipientsIn(text: string, sentTo: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  for (const match of text.slice(0, TEXT_LIMIT).matchAll(ADDRESS)) {
    const address = match[0].toLowerCase();
    if (sentTo.has(address)) found.add(address);
  }
  return [...found];
}

/**
 * Reads what is new in the inbox and returns only the replies and bounces that are this
 * workspace's. Never throws for a mailbox problem: it returns why, in fixed words.
 */
export async function readInbox(
  mailbox: { host: string; port: number; username: string; password: string },
  query: InboxQuery,
  deps: ImapDeps = {},
): Promise<InboxRead> {
  const host = await resolveSafeHost(mailbox.host, mailbox.port, [IMAP_PORT], deps.lookup);
  if (!host.ok) {
    return {
      ok: false,
      reason: host.reason === "private_address" ? "The incoming mail server's address is on a private network." : "The incoming mail server couldn't be found, or its port isn't 993.",
    };
  }

  let session: ImapSession;
  try {
    session = await (deps.connect ?? imapflowConnector)({ address: host.address, host: host.host, port: mailbox.port, username: mailbox.username, password: mailbox.password });
  } catch {
    return { ok: false, reason: "The incoming mail server couldn't be reached or refused the sign-in." };
  }

  try {
    const { uidValidity } = await session.open();
    const resume = query.uidValidity === uidValidity && query.lastSeenUid !== null;
    const envelopes = await session.list(resume ? { afterUid: query.lastSeenUid! } : { since: query.since }, INBOX_BATCH);

    const messages: InboxMessage[] = [];
    let ignored = 0;
    let lastUid: number | null = null;
    for (const envelope of envelopes) {
      if (resume && envelope.uid <= query.lastSeenUid!) continue;
      lastUid = Math.max(lastUid ?? 0, envelope.uid);
      const answers = normaliseMessageId(envelope.inReplyTo);
      const answersOurs = answers !== null && query.sentMessageIds?.has(answers) === true;
      if (envelope.from && (query.knownSenders.has(envelope.from) || answersOurs)) {
        const text = (await session.text(envelope.uid)).slice(0, TEXT_LIMIT).trim();
        if (text) {
          messages.push({
            kind: "reply",
            uid: envelope.uid,
            from: envelope.from,
            subject: envelope.subject,
            messageId: envelope.messageId,
            text,
            // Only when the sender is not someone enrolled: the email it answers says whose reply it is.
            ...(answersOurs && !query.knownSenders.has(envelope.from) ? { answers: answers! } : {}),
          });
        } else ignored += 1;
      } else if (looksLikeFailureNotice(envelope)) {
        const failedRecipients = failedRecipientsIn(await session.text(envelope.uid), query.sentTo);
        if (failedRecipients.length > 0) messages.push({ kind: "bounce", uid: envelope.uid, failedRecipients });
        else ignored += 1;
      } else {
        // Someone else's mail: its body is never fetched.
        ignored += 1;
      }
    }
    return { ok: true, uidValidity, lastUid, messages, ignored };
  } catch {
    return { ok: false, reason: "The mailbox couldn't be read." };
  } finally {
    try {
      await session.close();
    } catch {
      // Closing is best-effort.
    }
  }
}

type StructureNode = { part?: string; type: string; disposition?: string; childNodes?: StructureNode[] };

/**
 * A reply's HTML as plain text: scripts and styles dropped, block ends and line breaks
 * kept as line breaks, every tag removed, the common entities decoded. Markup is never
 * stored as the reply or passed to a model.
 */
export function htmlToText(html: string): string {
  const entity: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
      const key = name.toLowerCase();
      if (key in entity) return entity[key]!;
      const code = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : key.startsWith("#") ? Number.parseInt(key.slice(1), 10) : Number.NaN;
      return Number.isInteger(code) && code > 31 && code < 0x10ffff ? String.fromCodePoint(code) : match.startsWith("&#") ? " " : match;
    })
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The parts to read for a message's text: its text/plain part, or, when it has none,
 * its text/html part (to be stripped to text), plus a delivery-status part when there is
 * one. Never an attachment, and never an arbitrary first part: a message with no text
 * part has no text. Pure.
 */
export function textPartsOf(structure: StructureNode | undefined): { part: string; html: boolean }[] {
  const plain: string[] = [];
  const html: string[] = [];
  const status: string[] = [];
  const walk = (node: StructureNode | undefined) => {
    if (!node || node.disposition?.toLowerCase() === "attachment") return;
    const type = node.type.toLowerCase();
    // A single-part message has no part number of its own; its body is part 1.
    const part = node.part ?? "1";
    if (type === "text/plain") plain.push(part);
    else if (type === "text/html") html.push(part);
    else if (type === "message/delivery-status") status.push(part);
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(structure);
  const body = plain.length > 0 ? [{ part: plain[0]!, html: false }] : html.length > 0 ? [{ part: html[0]!, html: true }] : [];
  return [...body, ...status.slice(0, 1).map((part) => ({ part, html: false }))];
}

/** The real session, over imapflow. Kept thin: every decision is in `readInbox`. */
const imapflowConnector: ImapConnector = async ({ address, host, port, username, password }) => {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    // The address that was checked, with the name kept for the certificate.
    host: address,
    port,
    secure: true,
    servername: host,
    tls: { servername: host, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: { user: username, pass: password },
    // The library's own log lines carry mailbox content; none are emitted.
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS * 2,
  });
  await client.connect();
  let lock: { release(): void } | null = null;
  const structures = new Map<number, StructureNode | undefined>();

  return {
    async open() {
      lock = await client.getMailboxLock("INBOX", { readOnly: true });
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("The inbox could not be opened.");
      return { uidValidity: Number(mailbox.uidValidity) };
    },
    async list(criteria, limit) {
      const found = await client.search("afterUid" in criteria ? { uid: `${criteria.afterUid + 1}:*` } : { since: criteria.since }, { uid: true });
      const floor = "afterUid" in criteria ? criteria.afterUid : 0;
      // "N:*" always includes the newest message, even when its UID is below N.
      const uids = (Array.isArray(found) ? found : []).filter((uid) => uid > floor).sort((a, b) => a - b).slice(0, limit);
      if (uids.length === 0) return [];
      const envelopes: InboxEnvelope[] = [];
      for await (const message of client.fetch(uids.join(","), { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
        structures.set(message.uid, message.bodyStructure as StructureNode | undefined);
        envelopes.push({
          uid: message.uid,
          from: message.envelope?.from?.[0]?.address?.trim().toLowerCase() || null,
          subject: message.envelope?.subject?.slice(0, 300) ?? null,
          messageId: message.envelope?.messageId?.slice(0, 400) ?? null,
          contentType: message.bodyStructure?.type ?? null,
          inReplyTo: message.envelope?.inReplyTo?.slice(0, 500) ?? null,
        });
      }
      return envelopes.sort((a, b) => a.uid - b.uid);
    },
    async text(uid) {
      let text = "";
      for (const { part, html } of textPartsOf(structures.get(uid))) {
        const download = await client.download(String(uid), part, { uid: true, maxBytes: TEXT_LIMIT * 8 });
        if (!download.content) continue;
        let raw = "";
        for await (const chunk of download.content) {
          raw += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
          if (raw.length > TEXT_LIMIT * 8) break;
        }
        text += `${html ? htmlToText(raw) : raw}\n`;
      }
      return text;
    },
    async close() {
      lock?.release();
      await client.logout();
    },
  };
};

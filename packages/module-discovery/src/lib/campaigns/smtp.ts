import { SMTP_PORTS, resolveSafeHost, type HostLookup, type SafeHost } from "./host-guard";

/**
 * DISC-CAMP-P0-02.4: sending one email through a workspace's own mailbox, SMTP over TLS.
 *
 * The one implementation of the outbound sender. What it decides:
 *  - the host is checked and resolved by `resolveSafeHost`, and the connection goes to
 *    that address with the host name kept for the certificate check;
 *  - port 465 is TLS from the first byte; port 587 must upgrade with STARTTLS or the
 *    send fails. Nothing is ever sent in the clear, and the certificate is verified;
 *  - there are timeouts on connecting, on the greeting, on the socket and on the whole
 *    send;
 *  - the outcome is one of three, and "unknown" is not "failed": SMTP has no idempotency
 *    key, so when the connection drops or times out after the server may have taken the
 *    message, the caller must record that the outcome is unknown and never retry on its
 *    own. Only an error that proves the message did not go (the host was refused, the
 *    connection or sign-in failed, or the server answered with a rejection) is "failed".
 *
 * The password is used for the connection and appears nowhere else: not in a result, a
 * reason or a log line. Reasons are fixed wording; a server's reply text is untrusted
 * and is never echoed.
 */

export type OutboundEmail = {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

export type MailboxConnection = { host: string; port: number; username: string; password: string };

export type SendResult =
  /** The mail server accepted the message. `messageId` is its SMTP Message-ID. */
  | { status: "sent"; messageId: string | null }
  /** The message did not go. `mailbox` marks a failure of the mailbox itself (it could
   * not be reached or signed in to), which every other send would meet too. */
  | { status: "failed"; reason: string; mailbox?: true }
  /** The message may or may not have gone. Never retry this automatically. */
  | { status: "unknown"; reason: string };

export const OUTCOME_UNKNOWN_REASON =
  "Outcome unknown: the connection to the mail server ended before it confirmed the message. It may have been sent, so it was not retried.";

const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;
const SEND_TIMEOUT_MS = 30_000;

/** What this module needs from an SMTP library: nodemailer's `createTransport`, or a
 * stand-in in tests, which never open a connection. */
export type SmtpTransport = {
  sendMail(message: Record<string, unknown>): Promise<{ messageId?: string | null; accepted?: unknown[]; rejected?: unknown[] }>;
  close?(): void;
};
export type SmtpTransportFactory = (options: Record<string, unknown>) => SmtpTransport | Promise<SmtpTransport>;

const nodemailerFactory: SmtpTransportFactory = async (options) => {
  const { createTransport } = await import("nodemailer");
  return createTransport(options as Parameters<typeof createTransport>[0]) as unknown as SmtpTransport;
};

export type SmtpDeps = { lookup?: HostLookup; createTransport?: SmtpTransportFactory };

type SmtpError = { code?: unknown; command?: unknown; responseCode?: unknown; timeoutType?: unknown; originalCode?: unknown };

/** Error codes the library gives only before a message is handed over. */
const NOT_SENT_CODES = new Set(["EDNS", "EENVELOPE", "ECONFIG", "EMAXRECIPIENTS"]);
/** Timeouts that can only happen while the connection is being set up. */
const SETUP_TIMEOUTS = new Set(["CONNECT_TIMEOUT", "GREETING_TIMEOUT", "UPGRADE_TIMEOUT"]);
/** System errors that mean no connection was ever made. */
const NO_CONNECTION_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"]);

/**
 * Reads an SMTP library error for what it proves about the message. Pure.
 *
 * The library labels a socket error or a socket timeout the same way whether it struck
 * while connecting or after the message body was written, so those prove nothing and are
 * "unknown". "failed" needs proof: the server's own rejection code, or an error that can
 * only occur before a message is handed over (sign-in, TLS set-up, the set-up timeouts,
 * a refused connection).
 */
export function classifySmtpError(error: unknown): Extract<SendResult, { status: "failed" | "unknown" }> {
  const { code, command, responseCode, timeoutType, originalCode } = (typeof error === "object" && error !== null ? error : {}) as SmtpError;
  const signIn = "The mail server refused the sign-in. Check the username and password.";
  if (typeof responseCode === "number" && responseCode >= 400 && responseCode < 600) {
    if (code === "EAUTH" || (typeof command === "string" && command.startsWith("AUTH"))) return { status: "failed", reason: signIn, mailbox: true };
    return { status: "failed", reason: `The mail server refused the message (code ${responseCode}).` };
  }
  if (code === "EAUTH" || code === "ENOAUTH" || code === "EOAUTH2") return { status: "failed", reason: signIn, mailbox: true };
  if (code === "ETLS" || code === "EREQUIRETLS") {
    return { status: "failed", reason: "A secure connection to the mail server couldn't be made, so nothing was sent.", mailbox: true };
  }
  if (typeof code === "string" && NOT_SENT_CODES.has(code)) {
    return { status: "failed", reason: "The mail server couldn't take the message, so nothing was sent." };
  }
  if (
    (code === "ETIMEDOUT" && typeof timeoutType === "string" && SETUP_TIMEOUTS.has(timeoutType)) ||
    (typeof originalCode === "string" && NO_CONNECTION_CODES.has(originalCode)) ||
    (typeof code === "string" && NO_CONNECTION_CODES.has(code))
  ) {
    return { status: "failed", reason: "The mail server couldn't be reached, so nothing was sent.", mailbox: true };
  }
  return { status: "unknown", reason: OUTCOME_UNKNOWN_REASON };
}

function refused(host: Extract<SafeHost, { ok: false }>): SendResult {
  return {
    status: "failed",
    mailbox: true,
    reason:
      host.reason === "private_address"
        ? "The mail server's address is on a private network, so nothing was sent."
        : host.reason === "invalid_port"
          ? "The mailbox uses a port other than 465 or 587, so nothing was sent."
          : "The mail server's host name couldn't be found, so nothing was sent.",
  };
}

/** Sends one email through the mailbox and says what is known about the outcome. */
export async function sendViaSmtp(mailbox: MailboxConnection, email: OutboundEmail, deps: SmtpDeps = {}): Promise<SendResult> {
  const host = await resolveSafeHost(mailbox.host, mailbox.port, SMTP_PORTS, deps.lookup);
  if (!host.ok) return refused(host);

  let transport: SmtpTransport;
  try {
    transport = await (deps.createTransport ?? nodemailerFactory)({
      // The address that was checked, not the name: the name is not resolved again.
      host: host.address,
      port: mailbox.port,
      secure: mailbox.port === 465,
      requireTLS: mailbox.port !== 465,
      servername: host.host,
      tls: { servername: host.host, rejectUnauthorized: true, minVersion: "TLSv1.2" },
      auth: { user: mailbox.username, pass: mailbox.password },
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: CONNECT_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      // A message is built from text only: no file paths or URLs are ever read.
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } catch {
    return { status: "failed", reason: "The mail server couldn't be reached, so nothing was sent.", mailbox: true };
  }

  try {
    const info = await transport.sendMail({
      from: { name: email.fromName, address: email.fromEmail },
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: email.headers ?? {},
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    // One recipient: a server that accepted the session but not the recipient sent nothing.
    if (Array.isArray(info.rejected) && info.rejected.length > 0 && !(Array.isArray(info.accepted) && info.accepted.length > 0)) {
      return { status: "failed", reason: "The mail server refused the recipient's address." };
    }
    return { status: "sent", messageId: typeof info.messageId === "string" && info.messageId ? info.messageId.slice(0, 500) : null };
  } catch (error) {
    return classifySmtpError(error);
  } finally {
    try {
      transport.close?.();
    } catch {
      // Closing is best-effort; the outcome above stands.
    }
  }
}

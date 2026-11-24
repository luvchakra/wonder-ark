import { platformKey } from "../admin/platform-key-store";
import { BRAND_NAME } from "../lib/brand";
import { sendViaSmtp, type OutboundEmail, type SendResult, type SmtpDeps } from "./smtp";

/**
 * EMAIL-SMTP-01 (owner, 2026-11-24: "use GoDaddy email as SMTP to send emails, I will
 * configure the connection details on platform admin section. Do not use Resend
 * anywhere"). The one way the platform sends email of its own: team invitations, billing
 * and membership notices, service reminders, invoices and estimates, GST reminders, ops
 * alerts, and outreach when a business has no mailbox of its own.
 *
 * It sends through the SMTP mailbox set on Platform admin → Keys (SMTP_HOST, SMTP_PORT,
 * SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL, optional SMTP_FROM_NAME), with the same
 * sender a business's own mailbox uses (`sendViaSmtp`: the host checked and pinned, TLS
 * only, timeouts). There is no other provider and no fallback.
 *
 * SMTP has no idempotency key. So an outcome is one of three, and "unknown" (the
 * connection ended after the server may have taken the message) is never retried on its
 * own: a caller that retries on a thrown error throws only on "failed".
 */
export const EMAIL_NOT_SET_UP =
  "Email sending isn't set up yet: add the SMTP mailbox on Platform admin → Keys (host, port, username, password and from address).";

export type PlatformSender = { fromEmail: string; fromName: string };

type Connection = PlatformSender & { host: string; port: number; username: string; password: string };

async function connection(): Promise<Connection | null> {
  const [host, port, username, password, fromEmail, fromName] = await Promise.all([
    platformKey("SMTP_HOST"),
    platformKey("SMTP_PORT"),
    platformKey("SMTP_USERNAME"),
    platformKey("SMTP_PASSWORD"),
    platformKey("SMTP_FROM_EMAIL"),
    platformKey("SMTP_FROM_NAME"),
  ]);
  const portNumber = Number(port ?? "465");
  if (!host || !username || !password || !fromEmail || !Number.isInteger(portNumber)) return null;
  return { host, port: portNumber, username, password, fromEmail, fromName: fromName || BRAND_NAME };
}

/** Who platform email comes from, or null while the SMTP mailbox isn't set up. Never the password. */
export async function platformSender(): Promise<PlatformSender | null> {
  const found = await connection();
  return found ? { fromEmail: found.fromEmail, fromName: found.fromName } : null;
}

export type PlatformEmail = Omit<OutboundEmail, "fromEmail" | "fromName"> & { fromName?: string };

/** Sends one email from the platform's mailbox. Not set up: "failed", with what to do. */
export async function sendPlatformEmail(email: PlatformEmail, deps: SmtpDeps = {}): Promise<SendResult> {
  const found = await connection();
  if (!found) return { status: "failed", reason: EMAIL_NOT_SET_UP, mailbox: true };
  return sendViaSmtp(
    { host: found.host, port: found.port, username: found.username, password: found.password },
    { ...email, fromEmail: found.fromEmail, fromName: email.fromName ?? found.fromName },
    deps,
  );
}

/**
 * For a background job that is retried when it throws: throws only when the email surely
 * did not go, so a retry can never send it twice. An unknown outcome is returned, not
 * thrown.
 */
export async function sendPlatformEmailOnce(email: PlatformEmail, deps: SmtpDeps = {}): Promise<SendResult> {
  const result = await sendPlatformEmail(email, deps);
  if (result.status === "failed") throw new Error(result.reason);
  return result;
}

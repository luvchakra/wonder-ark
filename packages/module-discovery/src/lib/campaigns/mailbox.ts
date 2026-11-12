import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { decryptApiKey, encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createAdminClient } from "../../db/admin";
import { createClient } from "../../db/server";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { getBusiness } from "../tenancy/queries";
import { HOST_REFUSAL_MESSAGE, IMAP_PORT, SMTP_PORTS, resolveSafeHost, type HostLookup } from "./host-guard";
import { suggestMailSettings, type MxResolver } from "./mail-provider";
import { sendViaSmtp, type MailboxConnection, type SmtpDeps } from "./smtp";

/**
 * DISC-CAMP-P0-02.4: the mailbox a workspace sends its outreach from.
 *
 * What this code decides:
 *  - only a member with discovery.manage, in a business with Discovery licensed, saves
 *    or tests a mailbox (checked here, and again by RLS on the write);
 *  - the password is encrypted before it is stored, is never read back to a page (the
 *    database refuses a member's select of it), and appears in no result, log line or
 *    audit entry. Leaving the password blank on an edit keeps the stored one;
 *  - the SMTP and IMAP hosts pass the address guard when they are saved, and again
 *    every time a connection is made;
 *  - a mailbox is "verified" only when a test message to the acting user's own account
 *    address was accepted by the mail server. That is written with the service role;
 *    the database does not let a member set it, and resets it when the server, the
 *    sign-in or the From address changes.
 */

export const MAILBOX_DAILY_LIMIT_DEFAULT = 30;
export const MAILBOX_DAILY_LIMIT_MAX = 200;

export type SenderMailboxStatus = "unverified" | "verified" | "failed";

/** What a page may show. There is no password field in it, by construction. */
export type SenderMailboxView = {
  id: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  username: string;
  imapHost: string | null;
  status: SenderMailboxStatus;
  lastError: string | null;
  verifiedAt: string | null;
  dailyLimit: number;
};

/** Every column a member may read. `secret_encrypted` is not among them. */
const VIEW_COLUMNS =
  "id, from_name, from_email, smtp_host, smtp_port, username, imap_host, status, last_error, verified_at, daily_limit";

type ViewRow = {
  id: string;
  from_name: string;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  username: string;
  imap_host: string | null;
  status: SenderMailboxStatus;
  last_error: string | null;
  verified_at: string | null;
  daily_limit: number;
};

function toView(row: ViewRow): SenderMailboxView {
  return {
    id: row.id,
    fromName: row.from_name,
    fromEmail: row.from_email,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    username: row.username,
    imapHost: row.imap_host,
    status: row.status,
    lastError: row.last_error,
    verifiedAt: row.verified_at,
    dailyLimit: row.daily_limit,
  };
}

async function authorise(workspaceId: string): Promise<string> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, "discovery.manage");
  return businessId;
}

export async function getSenderMailbox(workspaceId: string): Promise<SenderMailboxView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sender_mailboxes").select(VIEW_COLUMNS).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error;
  return data ? toView(data as ViewRow) : null;
}

const MailboxInput = z.object({
  /** Blank uses the business's name. */
  fromName: z.string().trim().max(100).optional(),
  fromEmail: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter the address emails are sent from."),
  /** Blank is worked out from the address's domain, when its provider is one we know. */
  smtpHost: z.string().trim().max(253).optional(),
  smtpPort: z.union([z.literal(""), z.coerce.number().int()]).optional(),
  /** Blank uses the address. */
  username: z.string().trim().max(320).optional(),
  /** Blank on an edit keeps the stored password. */
  password: z.string().max(500).optional(),
  imapHost: z.string().trim().max(253).optional(),
  /** Blank keeps the saved limit, or the default for a new mailbox. */
  dailyLimit: z.union([z.literal(""), z.coerce.number().int().min(1, "The daily limit is at least 1.").max(MAILBOX_DAILY_LIMIT_MAX, `The daily limit is at most ${MAILBOX_DAILY_LIMIT_MAX}.`)]).optional(),
});
export type SenderMailboxInput = z.input<typeof MailboxInput>;

export type SaveMailboxOutcome = { status: "saved"; signInHint?: string } | { status: "invalid"; message: string };

/**
 * Saves the mailbox's settings. It is not usable until a test message is accepted.
 *
 * Only the address and the password are needed when the address's mail provider is one
 * this code knows: with the outgoing server left blank, the servers come from the fixed
 * table in `mail-provider.ts`, chosen by the domain's MX records. A server a person
 * typed is used as typed. Either way it passes the address guard here and again at
 * every connection.
 */
export async function saveSenderMailbox(
  workspaceId: string,
  input: SenderMailboxInput,
  deps: { lookup?: HostLookup; resolveMx?: MxResolver } = {},
): Promise<SaveMailboxOutcome> {
  const businessId = await authorise(workspaceId);
  const parsed = MailboxInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", message: parsed.error.issues[0]?.message ?? "Check the mailbox details." };
  const values = parsed.data;

  const supabase = await createClient();
  const { data: existingRow, error: readError } = await supabase.from("sender_mailboxes").select(VIEW_COLUMNS).eq("workspace_id", workspaceId).maybeSingle();
  if (readError) throw readError;
  const existing = existingRow as ViewRow | null;
  if (!existing && !values.password) return { status: "invalid", message: "Enter the mailbox's password or app password." };

  // A field left blank keeps what is saved, as long as the address is the same one. (The
  // server settings are folded, and a closed fold posts nothing.) A new address starts
  // again from what its own domain says.
  const kept = existing && existing.from_email === values.fromEmail ? existing : null;
  let smtpHost = values.smtpHost || kept?.smtp_host || "";
  let smtpPort = typeof values.smtpPort === "number" ? values.smtpPort : values.smtpHost ? null : (kept?.smtp_port ?? null);
  let imapInput = values.imapHost || kept?.imap_host || "";
  let signInHint: string | undefined;
  if (!smtpHost) {
    const suggestion = await suggestMailSettings(values.fromEmail, deps.resolveMx);
    if (!suggestion) {
      return { status: "invalid", message: "We couldn't work out the mail servers from that address. Open Server settings and enter them." };
    }
    smtpHost = suggestion.smtpHost;
    smtpPort = suggestion.smtpPort;
    if (!imapInput) imapInput = suggestion.imapHost;
    signInHint = suggestion.signInHint;
  }

  const smtp = await resolveSafeHost(smtpHost, smtpPort ?? 587, SMTP_PORTS, deps.lookup);
  if (!smtp.ok) return { status: "invalid", message: HOST_REFUSAL_MESSAGE[smtp.reason] };
  let imapHost: string | null = null;
  if (imapInput) {
    const imap = await resolveSafeHost(imapInput, IMAP_PORT, [IMAP_PORT], deps.lookup);
    if (!imap.ok) return { status: "invalid", message: HOST_REFUSAL_MESSAGE[imap.reason] };
    imapHost = imap.host;
  }

  const fromName = values.fromName || kept?.from_name || (await getBusiness(businessId))?.name?.slice(0, 100) || values.fromEmail;
  const row = {
    from_name: fromName,
    from_email: values.fromEmail,
    smtp_host: smtp.host,
    smtp_port: smtpPort ?? 587,
    username: values.username || kept?.username || values.fromEmail,
    imap_host: imapHost,
    imap_port: imapHost ? IMAP_PORT : null,
    daily_limit: typeof values.dailyLimit === "number" ? values.dailyLimit : (existing?.daily_limit ?? MAILBOX_DAILY_LIMIT_DEFAULT),
    ...(values.password ? { secret_encrypted: encryptApiKey(values.password) } : {}),
  };
  const { error } = existing
    ? await supabase.from("sender_mailboxes").update(row).eq("id", existing.id)
    : await supabase.from("sender_mailboxes").insert({ workspace_id: workspaceId, ...row });
  if (error) throw error;

  try {
    await writeAuditLog({
      businessId,
      action: existing ? "discovery.sender_mailbox.updated" : "discovery.sender_mailbox.connected",
      entityType: "discovery_sender_mailbox",
      entityId: existing?.id ?? null,
      // Where it connects and as whom; never the password, in any form.
      after: { workspaceId, smtpHost: smtp.host, smtpPort: smtpPort ?? 587, readsReplies: imapHost !== null, passwordChanged: Boolean(values.password) },
    });
  } catch (auditError) {
    console.error("Could not record a mailbox change:", auditError instanceof Error ? auditError.message : auditError);
  }
  return signInHint ? { status: "saved", signInHint } : { status: "saved" };
}

/** A verified mailbox as the send path needs it. Held in memory for one send only. */
export type SendingMailbox = {
  id: string;
  fromName: string;
  fromEmail: string;
  dailyLimit: number;
  connection: MailboxConnection;
  imap: { host: string; port: number; lastSeenUid: number | null; uidValidity: number | null } | null;
};

type SecretRow = ViewRow & { secret_encrypted: string; imap_port: number | null; last_seen_uid: number | null; last_seen_uid_validity: number | null };

async function readWithSecret(workspaceId: string, client: SupabaseClient): Promise<SecretRow | null> {
  const { data, error } = await client
    .from("sender_mailboxes")
    .select(`${VIEW_COLUMNS}, secret_encrypted, imap_port, last_seen_uid, last_seen_uid_validity`)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as SecretRow | null) ?? null;
}

function toSending(row: SecretRow): SendingMailbox | null {
  let password: string;
  try {
    password = decryptApiKey(row.secret_encrypted);
  } catch {
    // The reason is not logged: a decryption error can describe its input.
    console.error("A mailbox's stored password could not be read.");
    return null;
  }
  return {
    id: row.id,
    fromName: row.from_name,
    fromEmail: row.from_email,
    dailyLimit: row.daily_limit,
    connection: { host: row.smtp_host, port: row.smtp_port, username: row.username, password },
    imap: row.imap_host && row.imap_port ? { host: row.imap_host, port: row.imap_port, lastSeenUid: row.last_seen_uid, uidValidity: row.last_seen_uid_validity } : null,
  };
}

/**
 * The workspace's mailbox, only if it is verified, for a caller that has already been
 * authorised to send for that workspace. Needs the service role: a member's session
 * cannot read the password. Null when there is none, it is not verified, or its
 * password cannot be read; the caller must then not send.
 */
export async function loadMailboxForSending(workspaceId: string, client: SupabaseClient = createAdminClient()): Promise<SendingMailbox | null> {
  const row = await readWithSecret(workspaceId, client);
  if (!row || row.status !== "verified") return null;
  return toSending(row);
}

export type MailboxTestOutcome = { status: "verified"; sentTo: string } | { status: "failed"; message: string };

/**
 * "Send a test to me": sends one message through the mailbox to the acting user's own
 * account address, and marks the mailbox verified only if the mail server accepted it.
 * A test whose outcome is unknown does not verify the mailbox.
 */
export async function sendMailboxTest(workspaceId: string, deps: SmtpDeps = {}): Promise<MailboxTestOutcome> {
  const businessId = await authorise(workspaceId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { status: "failed", message: "Your account has no email address to send the test to." };

  const admin = createAdminClient();
  const row = await readWithSecret(workspaceId, admin);
  if (!row) return { status: "failed", message: "Save the mailbox's details first." };
  const mailbox = toSending(row);
  if (!mailbox) return { status: "failed", message: "The stored password couldn't be read. Enter it again and save." };

  const text = `This is a test from WonderArk. Your mailbox ${mailbox.fromEmail} is connected, and campaign emails for this offering will be sent from it.`;
  const result = await sendViaSmtp(
    mailbox.connection,
    {
      fromName: mailbox.fromName,
      fromEmail: mailbox.fromEmail,
      to: user.email,
      subject: "WonderArk test: your mailbox is connected",
      text,
      html: `<p>${text}</p>`,
    },
    deps,
  );

  const verified = result.status === "sent";
  const { error } = await admin
    .from("sender_mailboxes")
    .update(
      verified
        ? { status: "verified", verified_at: new Date().toISOString(), last_error: null }
        : { status: "failed", verified_at: null, last_error: result.reason },
    )
    .eq("id", row.id);
  if (error) throw error;

  try {
    await writeAuditLog({
      businessId,
      action: verified ? "discovery.sender_mailbox.verified" : "discovery.sender_mailbox.test_failed",
      entityType: "discovery_sender_mailbox",
      entityId: row.id,
      after: { workspaceId, outcome: result.status },
    });
  } catch (auditError) {
    console.error("Could not record a mailbox test:", auditError instanceof Error ? auditError.message : auditError);
  }
  return verified ? { status: "verified", sentTo: user.email } : { status: "failed", message: result.reason };
}

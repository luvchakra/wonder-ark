import { createAdminClient } from "../db/admin";
import { requireSuperadmin } from "../rbac/platform-admin";
import { renderEmailHtml, renderEmailText } from "../email/render";
import { BRAND_NAME } from "../lib/brand";
import { SITE_URL } from "../site";
import { collectHealthSnapshot, evaluateAlerts, type OpsAlert } from "./platform-health";
import { platformKey } from "./platform-key-store";

/**
 * PLATFORM-P1-07.4 ("Operational Alerts"): runs the health checks, records each alert
 * episode in platform.ops_alerts, and emails platform operators when an episode opens --
 * once per episode, so the daily run never repeats an email for a problem already reported.
 * Called by /api/cron/ops-alerts (CRON_SECRET). The email outcome is written back to the
 * episode (notified_at, or notify_error saying why not), so /platform/health never implies
 * an email was sent when it wasn't.
 */

type OpenedAlert = { id: string; alert_key: string; severity: string; message: string };

export type OpsAlertRunResult = { firing: number; opened: number; emailed: number; emailErrors: number };

/** Every platform operator's address: active rows in platform.admins plus the
 * PLATFORM_ADMIN_EMAILS bootstrap list (rbac/platform-admin.ts). */
async function operatorEmails(): Promise<string[]> {
  const emails = new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  const { data, error } = await createAdminClient({ schema: "platform" }).from("admins").select("user_id").is("revoked_at", null);
  if (error) throw new Error(error.message);
  const auth = createAdminClient();
  for (const row of (data ?? []) as { user_id: string }[]) {
    const { data: user } = await auth.auth.admin.getUserById(row.user_id);
    if (user?.user?.email) emails.add(user.user.email.toLowerCase());
  }
  return [...emails];
}

/** Sends one email per opened episode. Returns null when sent, otherwise why it wasn't. */
async function emailOperators(alert: OpenedAlert, to: string[]): Promise<string | null> {
  const apiKey = await platformKey("RESEND_API_KEY");
  const from = await platformKey("RESEND_FROM_EMAIL");
  if (!apiKey || !from) return "Email isn't configured (RESEND_API_KEY / RESEND_FROM_EMAIL).";
  if (to.length === 0) return "No platform operator has an email address.";

  const body = `${alert.message}\n\nSee the details on the system health page: ${SITE_URL}/platform/health`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `ops-alert-${alert.id}` },
    body: JSON.stringify({
      from,
      to,
      subject: `[${alert.severity === "critical" ? "Critical" : "Warning"}] ${alert.message}`,
      html: renderEmailHtml({ brandName: BRAND_NAME, body, websiteUrl: SITE_URL, replyToEmail: from, platform: true }),
      text: renderEmailText(body),
    }),
  });
  return response.ok ? null : `Email provider answered ${response.status}.`;
}

export async function runOpsAlertCheck(): Promise<OpsAlertRunResult> {
  const alerts: OpsAlert[] = evaluateAlerts(await collectHealthSnapshot());
  const platform = createAdminClient({ schema: "platform" });

  const { data, error } = await platform.rpc("record_ops_alerts", { p_alerts: alerts });
  if (error) throw new Error(error.message);
  const opened = (data ?? []) as OpenedAlert[];

  let emailed = 0;
  let emailErrors = 0;
  if (opened.length > 0) {
    const to = await operatorEmails();
    for (const alert of opened) {
      let failure: string | null;
      try {
        failure = await emailOperators(alert, to);
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err);
      }
      const { error: markError } = await platform.rpc("mark_ops_alert_notified", { p_id: alert.id, p_error: failure });
      if (markError) throw new Error(markError.message);
      if (failure) emailErrors++;
      else emailed++;
    }
  }
  return { firing: alerts.length, opened: opened.length, emailed, emailErrors };
}

export type OpsAlertRow = {
  id: string;
  key: string;
  severity: "warning" | "critical";
  message: string;
  openedAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  notifiedAt: string | null;
  notifyError: string | null;
};

/** Open episodes plus the most recently resolved ones, newest first, to a SUPERADMIN only
 * (checked here, PLATFORM-P0-01.2); read through the service role like the rest of the
 * health page. */
export async function listOpsAlerts(limit = 20): Promise<OpsAlertRow[]> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient({ schema: "platform" })
    .from("ops_alerts")
    .select("id, alert_key, severity, message, opened_at, last_seen_at, resolved_at, notified_at, notify_error")
    .order("resolved_at", { ascending: false, nullsFirst: true })
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    key: r.alert_key as string,
    severity: r.severity as OpsAlertRow["severity"],
    message: r.message as string,
    openedAt: r.opened_at as string,
    lastSeenAt: r.last_seen_at as string,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    notifiedAt: (r.notified_at as string | null) ?? null,
    notifyError: (r.notify_error as string | null) ?? null,
  }));
}

import { createAdminClient } from "../db/admin";
import { platformSender, sendPlatformEmail } from "../email/platform-mailer";
import { renderEmailHtml, renderEmailText } from "../email/render";
import { registerEventHandler } from "../events/registry";
import type { DomainEvent } from "../events/types";
import { BRAND_NAME } from "../lib/brand";
import { SITE_URL } from "../site";

/**
 * RBAC-32 / §52 -- membership notifications, sent by the domain-event drain (never from a
 * database trigger). The member hears about their own role change, suspension, removal or
 * reactivation; the inviter hears that an invitation was accepted. Without the platform's
 * SMTP mailbox (EMAIL-SMTP-01) the events are acknowledged and nothing is sent.
 * Imported for its side effect from apps/web/app/api/cron/drain-events/route.ts.
 */

export const MEMBER_EVENT_TYPES = [
  "member.invitation_accepted",
  "member.role_changed",
  "member.suspended",
  "member.removed",
  "member.reactivated",
] as const;

type Payload = { user_id?: string; invited_by?: string; role_id?: string };

async function emailFor(userId: string | undefined): Promise<{ email: string | null; name: string | null }> {
  if (!userId) return { email: null, name: null };
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  const meta = data?.user?.user_metadata as { full_name?: string } | undefined;
  return { email: data?.user?.email ?? null, name: meta?.full_name ?? null };
}

export async function sendMemberEmail(event: DomainEvent): Promise<"sent" | "skipped"> {
  // EMAIL-SMTP-01: through the platform's SMTP mailbox; not set up, skipped.
  const sender = await platformSender();
  if (!sender) return "skipped";
  const payload = event.payload as Payload;
  const core = createAdminClient({ schema: "core" });
  const [{ data: business }, { data: role }] = await Promise.all([
    core.from("businesses").select("name").eq("id", event.business_id).maybeSingle(),
    payload.role_id ? core.from("roles").select("name").eq("id", payload.role_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const businessName = (business?.name as string | undefined) ?? "your business";
  const roleName = (role as { name?: string } | null)?.name ?? null;

  let to: string | null;
  let subject: string;
  let body: string;
  if (event.type === "member.invitation_accepted") {
    const [inviter, joiner] = await Promise.all([emailFor(payload.invited_by), emailFor(payload.user_id)]);
    to = inviter.email;
    subject = `${joiner.name ?? joiner.email ?? "Someone"} joined ${businessName}`;
    body = `${joiner.name ?? joiner.email ?? "Your invitee"} accepted your invitation to **${businessName}**${roleName ? ` as **${roleName}**` : ""}.`;
  } else {
    to = (await emailFor(payload.user_id)).email;
    if (event.type === "member.role_changed") {
      subject = `Your role in ${businessName} changed`;
      body = `Your role in **${businessName}** is now **${roleName ?? "updated"}**. What you can see and do there has changed accordingly.`;
    } else if (event.type === "member.suspended") {
      subject = `Your access to ${businessName} was suspended`;
      body = `An administrator suspended your access to **${businessName}**. Contact them if you think this is a mistake.`;
    } else if (event.type === "member.removed") {
      subject = `You were removed from ${businessName}`;
      body = `You no longer have access to **${businessName}**.`;
    } else {
      subject = `Your access to ${businessName} is back`;
      body = `Your access to **${businessName}** was restored.`;
    }
  }
  if (!to) return "skipped";
  const full = `${body}\n\n${SITE_URL}/dashboard`;
  // Thrown only when it surely didn't go, so the event's retry can't send it twice.
  const result = await sendPlatformEmail({
    to,
    subject,
    html: renderEmailHtml({ brandName: BRAND_NAME, body: full, websiteUrl: SITE_URL, replyToEmail: sender.fromEmail, platform: true }),
    text: renderEmailText(full),
  });
  if (result.status === "failed") throw new Error(`Member email failed: ${result.reason}`);
  return "sent";
}

for (const type of MEMBER_EVENT_TYPES) {
  registerEventHandler(type, async (event) => {
    await sendMemberEmail(event);
  });
}

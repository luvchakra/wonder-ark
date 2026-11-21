import { Resend } from "resend";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { getOrCreateThread, postMessage } from "@cofounderai/core/messages/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import type { Message } from "@cofounderai/core/messages/types";
import { createClient as createFsmClient } from "../../db/server";
import { createAdminClient as createFsmAdminClient } from "../../db/admin";
import { platformKey } from "@cofounderai/core/admin/platform-key-store";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Same resolution order (primary contact, then the party's own email) as
 * `invoices/mutations.ts#resolveJobCustomerEmail`/`events/mutations.ts#resolveEventCustomerEmail`
 * -- duplicated rather than shared, matching how those two already independently
 * duplicate it (this module's own established precedent, not introduced by this
 * story). */
async function resolveJobCustomerEmail(businessId: string, jobId: string): Promise<string> {
  const fsm = await createFsmClient();
  const { data: job, error } = await fsm.from("jobs").select("party_id, primary_contact_id").eq("id", jobId).eq("business_id", businessId).single();
  if (error) throw error;

  const core = await coreClient();
  if (job.primary_contact_id) {
    const { data: contact } = await core.from("party_contacts").select("email").eq("id", job.primary_contact_id).maybeSingle();
    if (contact?.email) return contact.email;
  }
  const { data: party } = await core.from("parties").select("email").eq("id", job.party_id).maybeSingle();
  if (!party?.email) throw new Error("No email on file for this customer -- add one to the customer or their primary contact before messaging.");
  return party.email;
}

/** "Job participants (creator, sender of the estimate/invoice, assigned worker) get
 * notified by email" (PRD §9) -- the creator and every technician ever assigned to one
 * of this job's own work events. "Sender of the estimate/invoice" is not resolvable:
 * no column anywhere in this schema records who sent either document (`core.documents`
 * has no such field), so it's left out here rather than guessed -- a documented gap,
 * not a silently dropped requirement. */
async function resolveJobParticipantEmails(businessId: string, jobId: string): Promise<string[]> {
  const fsm = await createFsmAdminClient();
  const core = createCoreAdminClient({ schema: "core" });

  const { data: job } = await fsm.from("jobs").select("created_by").eq("id", jobId).eq("business_id", businessId).maybeSingle();
  const { data: events } = await fsm.from("events").select("id").eq("business_id", businessId).eq("job_id", jobId);
  const eventIds = (events ?? []).map((e) => e.id);
  const { data: assignees } = eventIds.length ? await fsm.from("event_assignees").select("employee_id").in("event_id", eventIds) : { data: [] };
  const employeeIds = [...new Set((assignees ?? []).map((a) => a.employee_id))];

  const { data: employees } = employeeIds.length ? await core.from("employees").select("user_id").in("id", employeeIds) : { data: [] };
  const userIds = new Set((employees ?? []).map((e) => e.user_id).filter((id): id is string => Boolean(id)));
  if (job?.created_by) userIds.add(job.created_by);
  if (userIds.size === 0) return [];

  const { data: profiles } = await core.from("user_profiles").select("email").in("id", [...userIds]);
  return (profiles ?? []).map((p) => p.email).filter((e): e is string => Boolean(e));
}

async function sendParticipantNotification(businessId: string, jobId: string, message: Message): Promise<void> {
  const apiKey = await platformKey("RESEND_API_KEY");
  const fromAddress = await platformKey("RESEND_FROM_EMAIL");
  if (!apiKey || !fromAddress) return; // same documented gap every other Resend-sending mutation in this module has

  const emails = await resolveJobParticipantEmails(businessId, jobId);
  if (emails.length === 0) return;

  const core = createCoreAdminClient({ schema: "core" });
  const { data: business } = await core.from("businesses").select("name, website").eq("id", businessId).maybeSingle();
  const brandName = business?.name ?? "Your business";

  const resend = new Resend(apiKey);
  await resend.emails
    .send({
      from: fromAddress,
      to: emails,
      subject: "New customer reply",
      text: renderEmailText(`A customer replied on a job:\n\n${message.body}`),
      html: renderEmailHtml({ brandName, body: `A customer replied on a job:\n\n${message.body}`, websiteUrl: business?.website ?? null, replyToEmail: fromAddress }),
    })
    .catch(() => null); // best-effort -- the message itself already landed regardless of whether this notification succeeds
}

/** Staff composing a new outbound message on a job's Messages tab (F-11). Finds-or-
 * creates the job's own thread, sends the email, and records it. */
export async function sendJobMessage(businessId: string, jobId: string, body: string, subject?: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A message body is required.");

  const apiKey = await platformKey("RESEND_API_KEY");
  const fromAddress = await platformKey("RESEND_FROM_EMAIL");
  if (!apiKey || !fromAddress) throw new Error("Email sending isn't configured yet -- set RESEND_API_KEY and RESEND_FROM_EMAIL.");

  const toEmail = await resolveJobCustomerEmail(businessId, jobId);
  const thread = await getOrCreateThread(businessId, "job", jobId);

  const core = await coreClient();
  const {
    data: { user },
  } = await core.auth.getUser();
  const { data: business } = await core.from("businesses").select("name, website").eq("id", businessId).maybeSingle();
  const brandName = business?.name ?? "Your service provider";

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: subject?.trim() || `Message from ${brandName}`,
    text: renderEmailText(trimmed),
    html: renderEmailHtml({ brandName, body: trimmed, websiteUrl: business?.website ?? null, replyToEmail: fromAddress }),
  });
  if (result.error) throw new Error(`Could not send the message: ${result.error.message}`);

  await postMessage({
    businessId,
    threadId: thread.id,
    direction: "outbound",
    body: trimmed,
    toAddress: toEmail,
    subject: subject?.trim() || null,
    createdBy: user?.id ?? null,
  });
}

/** The FSM-side half of the shared inbound-email webhook
 * (`apps/web/app/api/webhooks/email-inbound/route.ts`) -- tried after discovery's own
 * contact match fails. Matches the sender to a `core.parties` row by email (same
 * global, business-unscoped lookup discovery's own `ingestInboundEmail` already uses --
 * there's no "which business's inbox received this" signal in the payload for either
 * side to disambiguate on), then picks that party's own most-recently-updated
 * non-cancelled job -- a documented simplification when a customer has more than one
 * active job open at once (Kickserv-equivalent systems solve this with a unique
 * reply-to address or Message-ID threading, neither of which exists in this platform's
 * email-sending code yet). Runs with the admin client throughout (no signed-in user on
 * a webhook request). */
export async function ingestInboundJobReply(fromEmail: string, subject: string | null, text: string): Promise<{ matched: boolean; message?: Message }> {
  const trimmedFrom = fromEmail.trim().toLowerCase();
  if (!trimmedFrom) return { matched: false };

  const core = createCoreAdminClient({ schema: "core" });
  const { data: party, error: partyError } = await core.from("parties").select("id, business_id").ilike("email", trimmedFrom).limit(1).maybeSingle();
  if (partyError) throw partyError;
  if (!party) return { matched: false };

  const fsm = createFsmAdminClient();
  const { data: job, error: jobError } = await fsm
    .from("jobs")
    .select("id")
    .eq("business_id", party.business_id)
    .eq("party_id", party.id)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) return { matched: false };

  const thread = await getOrCreateThread(party.business_id, "job", job.id);
  const message = await postMessage({
    businessId: party.business_id,
    threadId: thread.id,
    direction: "inbound",
    body: text,
    fromAddress: trimmedFrom,
    subject,
  });

  await sendParticipantNotification(party.business_id, job.id, message);

  return { matched: true, message };
}

import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { renderEmailHtml, renderEmailText } from "@cofounderai/core/email/render";
import { prepareOutreachEmail } from "@cofounderai/core/privacy/suppression";
import { createClient } from "../../db/server";
import { getBusiness, getProduct, getWorkspace } from "../tenancy/queries";
import { authoriseCampaigns, getCampaignDetail, previewAudience, previewBlocker, writtenSegments } from "./campaigns";
import { addressOf, composeStep, scheduleLines, type StepRecipient } from "./compose";
import { getSenderMailbox, loadMailboxForSending } from "./mailbox";
import { sendViaSmtp, type SmtpDeps } from "./smtp";
import { GENERAL_SEGMENT, type CampaignStep, type LeftOutReason } from "./types";

/**
 * DISC-CAMP-P0-05.3: the preview a person confirms before a campaign can be activated,
 * and "Send me a test".
 *
 * The preview is not a mock-up. It is computed by the code that enrols and sends:
 *  - who would be enrolled, and the counted reasons for everyone left out, come from
 *    `previewAudience`, which is what `enrolAudience` runs at activation;
 *  - each email shown is `composeStep` for a real prospect of this workspace with their
 *    own values, the function the tick calls before it sends, with the From line from
 *    the connected mailbox and the unsubscribe footer `prepareOutreachEmail` produces;
 *  - a prospect whose email would be skipped is shown as skipped with the reason. A
 *    placeholder is never filled in to make an example look complete.
 *
 * "Send me a test" sends one previewed email to the mailbox's own From address and
 * nowhere else: there is no field for an address, and it never goes to the prospect. It
 * writes no enrollment, send or message row, is limited to a few an hour per campaign,
 * is recorded in the audit log, and says truthfully whether it was sent.
 */

/** How many prospects of each line of work can be stepped through. */
export const PREVIEW_PROSPECTS = 5;
export const TEST_SENDS_PER_HOUR = 5;

export type PreviewEmail =
  | { ok: true; prospectId: string; company: string; from: string; to: string; subject: string; text: string }
  | { ok: false; prospectId: string; company: string; reason: string };

export type PreviewLine = {
  segment: string;
  /** How many prospects would get this line of work's text. */
  prospects: number;
  /** The email for the prospect at the chosen position, or null when the line has fewer. */
  email: PreviewEmail | null;
};

export type CampaignPreview = {
  /** Prospects the campaign would write to: enrolled at activation, or already enrolled
   * and still in progress for a paused campaign. */
  audience: number;
  alreadyEnrolled: boolean;
  leftOut: Partial<Record<LeftOutReason, number>>;
  schedule: string[];
  steps: Pick<CampaignStep, "position" | "purpose">[];
  step: number;
  /** 0-based position of the prospect shown in each line of work. */
  index: number;
  /** The highest position any line of work has a prospect at, capped. */
  lastIndex: number;
  lines: PreviewLine[];
  confirmed: boolean;
};

export type PreviewResult = { status: "ready"; preview: CampaignPreview } | { status: "needs_setup" | "refused"; message: string };

type Member = { prospectId: string; contactId: string | null; recipient: "contact" | "company_email"; segment: string };

async function load(campaignId: string, choice: { step?: number; index?: number }) {
  const detail = await getCampaignDetail(campaignId);
  if (!detail) throw new Error("Campaign not found.");
  const businessId = await authoriseCampaigns(detail.campaign.workspace_id);
  const mailbox = await getSenderMailbox(detail.campaign.workspace_id);
  const blocker = previewBlocker(detail, mailbox?.status === "verified");
  if (blocker || !mailbox) return { blocked: blocker ?? { status: "needs_setup" as const, message: "Needs setup: connect a mailbox" } };

  const { campaign, steps, templates } = detail;
  const supabase = await createClient();
  let members: Member[];
  let leftOut: Partial<Record<LeftOutReason, number>> = {};
  if (campaign.status === "draft") {
    const audience = await previewAudience(campaign);
    const written = writtenSegments(detail);
    leftOut = audience.leftOut;
    members = audience.enrol.map((enrolee) => ({
      prospectId: enrolee.prospectId,
      contactId: enrolee.contactId,
      recipient: enrolee.recipient,
      segment: written.has(enrolee.lineOfWork) ? enrolee.lineOfWork : GENERAL_SEGMENT,
    }));
  } else {
    // A paused campaign: the people it is still writing to.
    const { data, error } = await supabase
      .from("outreach_enrollments")
      .select("prospect_id, contact_id, recipient, segment")
      .eq("campaign_id", campaign.id)
      .eq("status", "active")
      .order("created_at");
    if (error) throw error;
    members = ((data ?? []) as { prospect_id: string; contact_id: string | null; recipient: Member["recipient"]; segment: string }[]).map((row) => ({
      prospectId: row.prospect_id,
      contactId: row.contact_id,
      recipient: row.recipient,
      segment: row.segment,
    }));
  }

  const emailSteps = steps.filter((entry) => entry.channel === "email");
  const step = emailSteps.find((entry) => entry.position === choice.step) ?? emailSteps[0]!;
  const bySegment = new Map<string, Member[]>();
  for (const member of members) bySegment.set(member.segment, [...(bySegment.get(member.segment) ?? []), member]);
  const segments = [...bySegment.keys()].sort((a, b) =>
    a === GENERAL_SEGMENT ? -1 : b === GENERAL_SEGMENT ? 1 : bySegment.get(b)!.length - bySegment.get(a)!.length || a.localeCompare(b),
  );
  const lastIndex = Math.max(0, Math.min(PREVIEW_PROSPECTS, Math.max(0, ...[...bySegment.values()].map((list) => list.length))) - 1);
  const index = Math.min(Math.max(0, Number.isInteger(choice.index) ? (choice.index as number) : 0), lastIndex);

  const workspace = await getWorkspace(campaign.workspace_id);
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const business = product ? await getBusiness(product.business_id) : null;
  if (!product || !business) throw new Error("This workspace isn't linked to a business.");
  const sender = { fromName: mailbox.fromName, offeringName: product.name, businessName: business.name };

  const chosen = segments.map((segment) => bySegment.get(segment)![index]).filter((member): member is Member => Boolean(member));
  const [prospects, contacts] = await Promise.all([
    chosen.length
      ? supabase.from("prospects").select("id, company_name, industry, location, company_email").in("id", chosen.map((member) => member.prospectId))
      : { data: [], error: null },
    chosen.some((member) => member.contactId)
      ? supabase.from("contacts").select("id, email, first_name, email_status").in("id", chosen.filter((member) => member.contactId).map((member) => member.contactId as string))
      : { data: [], error: null },
  ]);
  if (prospects.error) throw prospects.error;
  if (contacts.error) throw contacts.error;

  const lines: (PreviewLine & { composed?: { to: string; subject: string; body: string; unsubscribeUrl: string } })[] = [];
  for (const segment of segments) {
    const member = bySegment.get(segment)![index];
    const prospect = member ? ((prospects.data ?? []) as StepRecipient["prospect"][]).find((row) => row.id === member.prospectId) : undefined;
    if (!member || !prospect) {
      lines.push({ segment, prospects: bySegment.get(segment)!.length, email: null });
      continue;
    }
    const recipient: StepRecipient = {
      prospect,
      contact: member.contactId ? (((contacts.data ?? []) as NonNullable<StepRecipient["contact"]>[]).find((row) => row.id === member.contactId) ?? null) : null,
      recipient: member.recipient,
      segment: member.segment,
    };
    const to = addressOf(recipient);
    // The same check the tick makes: is this address on the opt-out list, and if not,
    // what unsubscribe link does its email carry.
    const compliance = to ? await prepareOutreachEmail(businessId, to) : null;
    const composed = composeStep({ campaign, step, templates, recipient, suppressed: compliance?.suppressed === true, sender });
    if (!composed.ok || !compliance || compliance.suppressed) {
      lines.push({
        segment,
        prospects: bySegment.get(segment)!.length,
        email: { ok: false, prospectId: prospect.id, company: prospect.company_name, reason: composed.ok ? "Asked not to be emailed" : composed.reason },
      });
      continue;
    }
    lines.push({
      segment,
      prospects: bySegment.get(segment)!.length,
      email: {
        ok: true,
        prospectId: prospect.id,
        company: prospect.company_name,
        from: `${mailbox.fromName} <${mailbox.fromEmail}>`,
        to: composed.to,
        subject: composed.subject,
        text: renderEmailText(composed.body, compliance.unsubscribeUrl),
      },
      composed: { to: composed.to, subject: composed.subject, body: composed.body, unsubscribeUrl: compliance.unsubscribeUrl },
    });
  }

  return {
    detail,
    businessId,
    mailbox,
    brand: { brandName: product.name ?? business.name, websiteUrl: product.website ?? business.website ?? null },
    lines,
    preview: {
      audience: members.length,
      alreadyEnrolled: campaign.status !== "draft",
      leftOut,
      schedule: scheduleLines({ campaign, steps: emailSteps, mailboxDailyLimit: mailbox.dailyLimit }),
      steps: emailSteps.map((entry) => ({ position: entry.position, purpose: entry.purpose })),
      step: step.position,
      index,
      lastIndex,
      lines: lines.map(({ segment, prospects: count, email }) => ({ segment, prospects: count, email })),
      confirmed: Boolean(campaign.preview_confirmed_at),
    } satisfies CampaignPreview,
  };
}

export async function buildCampaignPreview(campaignId: string, choice: { step?: number; index?: number } = {}): Promise<PreviewResult> {
  const loaded = await load(campaignId, choice);
  return "blocked" in loaded ? loaded.blocked! : { status: "ready", preview: loaded.preview };
}

export type TestSendOutcome =
  | { status: "sent"; to: string }
  /** Not sent, or its outcome is not known. `message` says which. */
  | { status: "failed" | "unknown" | "refused"; message: string };

/**
 * "Send me a test": sends the previewed email for the prospect shown in one line of work
 * to the mailbox's own From address. The recipient is not an input.
 */
export async function sendCampaignTest(
  campaignId: string,
  choice: { segment: string; step?: number; index?: number },
  deps: SmtpDeps = {},
  now: Date = new Date(),
): Promise<TestSendOutcome> {
  const loaded = await load(campaignId, choice);
  if ("blocked" in loaded) return { status: "refused", message: loaded.blocked!.message };
  const line = loaded.lines.find((entry) => entry.segment === choice.segment);
  if (!line?.email) return { status: "refused", message: "There is no prospect to preview there." };
  if (!line.email.ok || !line.composed) return { status: "refused", message: `That email would not be sent: ${line.email.ok ? "" : line.email.reason}.` };

  const { campaign } = loaded.detail;
  const recent = (campaign.test_sent_at ?? []).filter((at) => now.getTime() - new Date(at).getTime() < 60 * 60 * 1000);
  if (recent.length >= TEST_SENDS_PER_HOUR) {
    return { status: "refused", message: `${TEST_SENDS_PER_HOUR} tests have been sent for this campaign in the last hour. Try again later.` };
  }
  // Counted before it is sent, so a failing mailbox cannot be hammered either.
  const supabase = await createClient();
  const { error: countError } = await supabase.from("outreach_campaigns").update({ test_sent_at: [...recent, now.toISOString()] }).eq("id", campaign.id);
  if (countError) throw countError;

  const mailbox = await loadMailboxForSending(campaign.workspace_id);
  if (!mailbox) return { status: "refused", message: "Needs setup: connect a mailbox" };
  // The test goes to the mailbox itself, so it carries that address's own unsubscribe
  // link, not the prospect's: pressing it must not opt the prospect out.
  const own = await prepareOutreachEmail(loaded.businessId, mailbox.fromEmail);
  if (own.suppressed) return { status: "refused", message: "Your own address is on your do-not-contact list, so the test can't be sent to it." };

  const result = await sendViaSmtp(
    mailbox.connection,
    {
      fromName: mailbox.fromName,
      fromEmail: mailbox.fromEmail,
      to: mailbox.fromEmail,
      subject: `[Test] ${line.composed.subject}`,
      headers: own.headers,
      text: renderEmailText(line.composed.body, own.unsubscribeUrl),
      html: renderEmailHtml({ ...loaded.brand, body: line.composed.body, replyToEmail: mailbox.fromEmail, unsubscribeUrl: own.unsubscribeUrl }),
    },
    deps,
  );

  try {
    await writeAuditLog({
      businessId: loaded.businessId,
      action: "discovery.campaign.test_sent",
      entityType: "discovery_outreach_campaign",
      entityId: campaign.id,
      // Which previewed email, and how it went. No address and no text.
      after: { outcome: result.status, step: loaded.preview.step, prospectId: line.email.prospectId },
    });
  } catch (auditError) {
    console.error("Could not record a campaign test:", auditError instanceof Error ? auditError.message : auditError);
  }
  if (result.status === "sent") return { status: "sent", to: mailbox.fromEmail };
  return { status: result.status, message: result.reason };
}

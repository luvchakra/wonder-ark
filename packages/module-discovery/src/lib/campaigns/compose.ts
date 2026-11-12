import { emailSendCheck } from "../messages/email-status";
import { MERGE_FIELD_LABEL, cityOf, renderTemplate, type MergeValues } from "./render";
import { STOP_REASON } from "./stops";
import { GENERAL_SEGMENT, WEEKDAY_LABEL, dailyCheckIn, type Campaign, type CampaignStep, type CampaignTemplate } from "./types";

/**
 * DISC-CAMP-P0-02.2 / 05.3: what one step's email to one prospect is, or why there is
 * none. One function, used by the tick when it sends and by the preview when it shows
 * what would be sent, so the preview cannot describe an email the tick would not send.
 * Pure: every value comes in as an argument.
 */

export type StepRecipient = {
  prospect: { id: string; company_name: string; industry: string | null; location: string | null; company_email: string | null };
  /** The contact written to, or null when the prospect's general company email is. */
  contact: { id: string; email: string | null; first_name: string | null; email_status: string | null } | null;
  recipient: "contact" | "company_email";
  /** The line of work whose text this prospect gets, or the general one. */
  segment: string;
};

export type Sender = { fromName: string; offeringName: string; businessName: string };

export type ComposedStep =
  | { ok: true; to: string; subject: string; body: string; segment: string }
  | {
      ok: false;
      /** What the send is recorded as when it is skipped. */
      code: "no_email" | "contact_deleted" | "invalid_address" | "unverified_address" | "suppressed" | "no_message" | "missing_merge_field" | "invalid_template";
      /** Why, in the page's words. */
      reason: string;
    };

/** The address a recipient is written to, or null when there is none. */
export function addressOf(recipient: Pick<StepRecipient, "prospect" | "contact" | "recipient">): string | null {
  const address = recipient.recipient === "contact" ? recipient.contact?.email : recipient.prospect.company_email;
  return address?.trim() || null;
}

export function composeStep(input: {
  campaign: Pick<Campaign, "include_unverified">;
  step: Pick<CampaignStep, "id">;
  templates: CampaignTemplate[];
  recipient: StepRecipient;
  /** Whether the address is on the business's opt-out list. */
  suppressed: boolean;
  sender: Sender;
}): ComposedStep {
  const { recipient, templates, step } = input;
  if (recipient.recipient === "contact" && !recipient.contact) return { ok: false, code: "contact_deleted", reason: STOP_REASON.contactDeleted };
  const to = addressOf(recipient);
  if (!to) return { ok: false, code: "no_email", reason: STOP_REASON.noEmail };

  const check = emailSendCheck(recipient.contact?.email_status as Parameters<typeof emailSendCheck>[0]);
  if (check === "blocked") return { ok: false, code: "invalid_address", reason: STOP_REASON.invalidAddress };
  if (check === "confirm" && !input.campaign.include_unverified) return { ok: false, code: "unverified_address", reason: STOP_REASON.unverifiedAddress };
  if (input.suppressed) return { ok: false, code: "suppressed", reason: STOP_REASON.suppressed };

  const template =
    templates.find((entry) => entry.step_id === step.id && entry.segment === recipient.segment) ??
    templates.find((entry) => entry.step_id === step.id && entry.segment === GENERAL_SEGMENT);
  if (!template) return { ok: false, code: "no_message", reason: STOP_REASON.noMessage };

  const values: MergeValues = {
    company: recipient.prospect.company_name,
    city: cityOf(recipient.prospect.location),
    line_of_work: recipient.prospect.industry,
    first_name: recipient.contact?.first_name ?? null,
    offering: input.sender.offeringName,
    sender_name: input.sender.fromName,
    business_name: input.sender.businessName,
  };
  const rendered = renderTemplate(template, values);
  if (!rendered.ok) {
    return rendered.reason === "missing_merge_field"
      ? { ok: false, code: "missing_merge_field", reason: `Not sent: this prospect has no value for ${rendered.missing.map((field) => MERGE_FIELD_LABEL[field]).join(", ")}` }
      : { ok: false, code: "invalid_template", reason: "Not sent: the step's text has a merge field that can't be filled" };
  }
  return { ok: true, to, subject: rendered.subject, body: rendered.body, segment: template.segment };
}

/**
 * The campaign's schedule in words: when emails go out, how many a day, and the gap
 * between the steps. Used by the preview and by the Activate dialog, built from the
 * campaign's own rows.
 */
export function scheduleLines(input: {
  campaign: Pick<Campaign, "send_days" | "send_from_hour" | "send_to_hour" | "timezone" | "daily_limit">;
  steps: Pick<CampaignStep, "position" | "delay_days">[];
  mailboxDailyLimit: number;
}): string[] {
  const { campaign, steps, mailboxDailyLimit } = input;
  const days = campaign.send_days.map((value) => WEEKDAY_LABEL[value - 1]).join(", ");
  const own = campaign.daily_limit ?? null;
  const check = dailyCheckIn(campaign);
  const gaps = [...steps]
    .sort((a, b) => a.position - b.position)
    .filter((step) => step.position > 1)
    .map((step) => `step ${step.position} ${step.delay_days} ${step.delay_days === 1 ? "day" : "days"} after step ${step.position - 1}`);
  return [
    `Emails go out on ${days}, between ${campaign.send_from_hour}:00 and ${campaign.send_to_hour}:00 (${campaign.timezone}), at the daily check at ${check.time}.`,
    own !== null && own < mailboxDailyLimit
      ? `At most ${own} emails a day for this campaign. The mailbox allows ${mailboxDailyLimit} a day across all of this offering's campaigns.`
      : `At most ${mailboxDailyLimit} emails a day, the mailbox's limit, shared by all of this offering's campaigns.`,
    steps.length === 1 ? "One email to each prospect, with no follow-up." : `${steps.length} emails to each prospect: ${gaps.join(", ")}.`,
  ];
}

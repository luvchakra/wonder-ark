import { emailSendCheck } from "../messages/email-status";
import { MERGE_FIELD_LABEL, cityOf, renderTemplate, type MergeValues } from "./render";
import { withOpening } from "./opening-text";
import { STOP_REASON } from "./stops";
import {
  GENERAL_SEGMENT,
  TASK_SKIP_LABEL,
  WEEKDAY_LABEL,
  dailyCheckIn,
  isTaskChannel,
  type Campaign,
  type CampaignStep,
  type CampaignTemplate,
  type StepChannel,
  type TaskChannel,
  type TaskSkipCode,
  type TemplateOrigin,
} from "./types";

/**
 * DISC-CAMP-P0-02.2 / 05.3: what one step's email to one prospect is, or why there is
 * none. One function, used by the tick when it sends and by the preview when it shows
 * what would be sent, so the preview cannot describe an email the tick would not send.
 * Pure: every value comes in as an argument.
 */

export type StepRecipient = {
  prospect: {
    id: string;
    company_name: string;
    industry: string | null;
    location: string | null;
    company_email: string | null;
    /** DISC-CAMP-P0-06.1: what a call, WhatsApp or LinkedIn step is done with. */
    phone?: string | null;
    linkedin_url?: string | null;
  };
  /** The contact written to, or null when the prospect's general company email is. */
  contact: {
    id: string;
    email: string | null;
    first_name: string | null;
    email_status: string | null;
    phone?: string | null;
    linkedin_url?: string | null;
  } | null;
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
  /**
   * DISC-CAMP-P0-03.2: the checked AI-written opening for this prospect, when the
   * campaign has "Personal opening line" on and this is its first step. Null or absent:
   * the reviewed text alone.
   */
  opening?: string | null;
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
  const body = input.opening ? withOpening(rendered.body, input.opening) : rendered.body;
  return { ok: true, to, subject: rendered.subject, body, segment: template.segment };
}

/** A stored phone number as it is shown and dialled, or null when it is not one. The
 * value is a prospect record's, so it is data: only digits and a leading "+" reach a link. */
export function phoneOf(value: string | null | undefined): { text: string; dial: string; international: boolean } | null {
  // eslint-disable-next-line no-control-regex
  const text = (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 30);
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  const international = text.startsWith("+");
  return { text, dial: `${international ? "+" : ""}${digits}`, international };
}

/** A stored LinkedIn address, or null when it is not a page on linkedin.com. Anything
 * else (another site, a script URL) is not turned into a link. */
export function linkedInOf(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.length > 300) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
    return `https://${host}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** What a task is done with: the number or page as text, and where its link goes, if anywhere. */
export type TaskDetail = { text: string; href: string | null };

export type ComposedTask =
  | { ok: true; channel: TaskChannel; body: string; segment: string; origin: TemplateOrigin; detail: TaskDetail }
  | {
      ok: false;
      /** `contact_deleted` stops the enrollment, as it does for an email. The rest pass
       * over this one step: the prospect moves on to the next. */
      code: TaskSkipCode | "contact_deleted";
      reason: string;
    };

/**
 * DISC-CAMP-P0-06.1: what a call, WhatsApp or LinkedIn step is for one prospect: the
 * draft a person works from, with the reviewed text's merge fields filled by the same
 * renderer as an email, and the number or page it is done with. Or why there is none.
 * Nothing here sends or dials anything. Pure, and used by the Today list, the preview
 * and the tick, so all three agree on who has a task and who is passed over.
 *
 * A call or a WhatsApp message needs a phone number: the enrolled contact's, else the
 * company's. Without one the step is passed over with the reason; it is never shown with
 * a blank. A LinkedIn message can still be sent by finding the company by name, so it is
 * shown without a page and says that none is stored.
 */
export function composeTask(input: {
  step: Pick<CampaignStep, "id" | "channel">;
  templates: CampaignTemplate[];
  recipient: StepRecipient;
  sender: Sender;
}): ComposedTask {
  const { recipient, templates, step } = input;
  if (!isTaskChannel(step.channel)) return { ok: false, code: "invalid_template", reason: TASK_SKIP_LABEL.invalid_template };
  if (recipient.recipient === "contact" && !recipient.contact) return { ok: false, code: "contact_deleted", reason: STOP_REASON.contactDeleted };

  const phone = phoneOf(recipient.contact?.phone) ?? phoneOf(recipient.prospect.phone);
  if (step.channel !== "linkedin" && !phone) return { ok: false, code: "no_phone", reason: TASK_SKIP_LABEL.no_phone };

  const template =
    templates.find((entry) => entry.step_id === step.id && entry.segment === recipient.segment) ??
    templates.find((entry) => entry.step_id === step.id && entry.segment === GENERAL_SEGMENT);
  if (!template) return { ok: false, code: "no_message", reason: TASK_SKIP_LABEL.no_message };

  const rendered = renderTemplate(
    template,
    {
      company: recipient.prospect.company_name,
      city: cityOf(recipient.prospect.location),
      line_of_work: recipient.prospect.industry,
      first_name: recipient.contact?.first_name ?? null,
      offering: input.sender.offeringName,
      sender_name: input.sender.fromName,
      business_name: input.sender.businessName,
    },
    { subject: false },
  );
  if (!rendered.ok) {
    return rendered.reason === "missing_merge_field"
      ? { ok: false, code: "missing_merge_field", reason: `This prospect has no value for ${rendered.missing.map((field) => MERGE_FIELD_LABEL[field]).join(", ")}` }
      : { ok: false, code: "invalid_template", reason: TASK_SKIP_LABEL.invalid_template };
  }

  let detail: TaskDetail;
  if (step.channel === "call") {
    detail = { text: phone!.text, href: `tel:${phone!.dial}` };
  } else if (step.channel === "whatsapp") {
    // Click-to-chat needs the country code. A number stored without one is shown as it
    // is; a country is never guessed for it.
    detail = { text: phone!.text, href: phone!.international ? `https://wa.me/${phone!.dial.slice(1)}?text=${encodeURIComponent(rendered.body)}` : null };
  } else {
    const page = linkedInOf(recipient.contact?.linkedin_url) ?? linkedInOf(recipient.prospect.linkedin_url);
    detail = page ? { text: page.replace(/^https:\/\/(www\.)?/, "").slice(0, 60), href: page } : { text: "no LinkedIn page is stored; find it by name", href: null };
  }
  return { ok: true, channel: step.channel, body: rendered.body, segment: template.segment, origin: template.origin, detail };
}

const TASK_IN_WORDS: Record<TaskChannel, string> = {
  call: "a call for you to make",
  whatsapp: "a WhatsApp message for you to send",
  linkedin: "a LinkedIn message for you to send",
};

/**
 * The campaign's schedule in words: when emails go out, how many a day, and the gap
 * between the steps. Used by the preview and by the Activate dialog, built from the
 * campaign's own rows.
 */
export function scheduleLines(input: {
  campaign: Pick<Campaign, "send_days" | "send_from_hour" | "send_to_hour" | "timezone" | "daily_limit">;
  steps: (Pick<CampaignStep, "position" | "delay_days"> & { channel?: StepChannel })[];
  mailboxDailyLimit: number;
}): string[] {
  const { campaign, steps, mailboxDailyLimit } = input;
  const days = campaign.send_days.map((value) => WEEKDAY_LABEL[value - 1]).join(", ");
  const own = campaign.daily_limit ?? null;
  const check = dailyCheckIn(campaign);
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  const tasks = sorted.filter((step) => isTaskChannel(step.channel ?? "email"));
  const gaps = sorted
    .filter((step) => step.position > 1)
    .map((step) => {
      const channel = step.channel ?? "email";
      const what = isTaskChannel(channel) ? ` (${TASK_IN_WORDS[channel]})` : tasks.length > 0 ? " (an email)" : "";
      return `step ${step.position}${what} ${step.delay_days} ${step.delay_days === 1 ? "day" : "days"} after step ${step.position - 1}`;
    });
  // DISC-CAMP-P0-06.1: a sequence with a step for a person says so, and that it waits.
  const sequence =
    tasks.length === 0
      ? steps.length === 1
        ? "One email to each prospect, with no follow-up."
        : `${steps.length} emails to each prospect: ${gaps.join(", ")}.`
      : `${steps.length} steps for each prospect: ${gaps.join(", ")}. WonderArk sends the emails. A step for you appears on the Today list when it is due; nothing is sent or dialled for it, and the steps after it wait until you mark it done.`;
  return [
    `Emails go out on ${days}, between ${campaign.send_from_hour}:00 and ${campaign.send_to_hour}:00 (${campaign.timezone}), at the daily check at ${check.time}.`,
    own !== null && own < mailboxDailyLimit
      ? `At most ${own} emails a day for this campaign. The mailbox allows ${mailboxDailyLimit} a day across all of this offering's campaigns.`
      : `At most ${mailboxDailyLimit} emails a day, the mailbox's limit, shared by all of this offering's campaigns.`,
    sequence,
  ];
}

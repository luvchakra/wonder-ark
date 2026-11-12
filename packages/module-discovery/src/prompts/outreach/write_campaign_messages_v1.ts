import { UNTRUSTED_RULES, untrusted } from "../shared/untrusted";
import type { StepPurpose } from "../../lib/campaigns/types";

export const WRITE_CAMPAIGN_MESSAGES_PROMPT_VERSION = "write_campaign_messages_v1";

/** The merge fields the model may use. `first_name` is left out on purpose: many
 * prospects are written to at a shared mailbox, and a message that needs a first name
 * would have to be skipped for them. A person can add it when editing. */
export const CAMPAIGN_PROMPT_FIELDS = ["company", "city", "line_of_work", "offering", "sender_name", "business_name"] as const;

const PURPOSE_BRIEF: Record<StepPurpose, string> = {
  intro: "The first email: who you are, the one problem you solve for this line of work, and one clear, low-effort next step.",
  follow_up: "A short follow-up to the earlier email: one new, specific reason it is worth a reply. Do not repeat the first email or apologise for writing.",
  last_note: "The last note: brief and polite, says this is the final email, and leaves the door open.",
  call: "Not an email.",
};

/**
 * DISC-CAMP-P0-03.1: one request writes every email step of a campaign for one line of
 * work, so a sequence reads as one thread and a campaign costs one call per line of
 * work rather than one per step.
 *
 * Everything that is not the platform's own instruction is fenced as quoted material:
 * the offering's profile (it began as a crawled website), the ideal customer's notes,
 * and the line of work itself, which is a prospect record's `industry` and may have
 * been written by a source or an import.
 */
export function writeCampaignMessagesPrompt(input: {
  offeringName: string;
  businessName: string;
  productProfile: unknown;
  idealCustomer: { painPoints: string[]; buyingSignals: string[] } | null;
  /** The line of work these messages are for, or null for the general text. */
  lineOfWork: string | null;
  steps: { position: number; purpose: StepPurpose; delayDays: number }[];
}): string {
  const fields = CAMPAIGN_PROMPT_FIELDS.map((field) => `{{${field}}}`).join(", ");
  const steps = input.steps
    .map((step) => `- Step ${step.position}${step.position === 1 ? "" : ` (sent ${step.delayDays} days after the one before)`}: ${PURPOSE_BRIEF[step.purpose]}`)
    .join("\n");

  return `You write short business-to-business outreach emails for a small business. Write one email for each step listed below. They are a sequence sent to the same company, so later ones follow from the first.

${UNTRUSTED_RULES}

Rules for every email:
- 50 to 120 words. Plain, specific and polite. No hype, no pressure, no invented facts.
- Mention only what the offering profile below supports. Never invent customers, numbers, prices, awards or features.
- Use these placeholders exactly as written where the detail belongs, and no others: ${fields}. They are filled in later for each recipient. Never write a placeholder in square brackets or any other form, and never write a recipient's name.
- Do not include any link, web address, phone number or attachment. The email's footer adds the sender's details and the unsubscribe link.
- A truthful subject line of at most 9 words that says what the email is about. No "Re:" or "Fwd:".
- End with ${"{{sender_name}}"} on its own line, then ${"{{business_name}}"}.

Steps to write:
${steps}

The offering is "${input.offeringName.replace(/"/g, "'").slice(0, 120)}", sold by "${input.businessName.replace(/"/g, "'").slice(0, 120)}".

${untrusted("offering profile", JSON.stringify(input.productProfile ?? {}, null, 2), 6000)}

${untrusted(
  "ideal customer notes",
  input.idealCustomer
    ? `Pain points: ${input.idealCustomer.painPoints.join("; ")}\nBuying signals: ${input.idealCustomer.buyingSignals.join("; ")}`
    : "",
  2000,
)}

${
  input.lineOfWork
    ? `These emails go to companies in one line of work, named in the block below. Write for that line of work specifically: the problem as such a business meets it, in its own everyday words.\n\n${untrusted("line of work", input.lineOfWork, 200)}`
    : "These emails go to companies whose line of work is not known or varies. Do not assume a line of work and do not use {{line_of_work}}."
}

Return one entry per step, with its step number, subject and body.`;
}

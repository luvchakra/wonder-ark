import { randomBytes } from "node:crypto";

/**
 * DISC-CONS-P0-03.x / 05.2: the deterministic rules for people who opted in. Pure apart
 * from token generation: what an email must look like, how a sign-up form is read, and
 * when a person may be messaged.
 */

export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 200;
export const MAX_ANSWER_LENGTH = 1000;
export const MAX_QUESTIONS = 2;
export const MAX_QUESTION_LENGTH = 200;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;

/** The consent sentence an importer confirms (B5.3.6), stored on each imported row. */
export const IMPORT_CONSENT_TEXT = "These people agreed to hear from me.";

/** The default consent line of a new sign-up page. The owner can edit it. */
export function defaultConsentText(businessName: string): string {
  return `I agree that ${businessName} may email me about this. I can unsubscribe at any time.`;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Trimmed and lower-cased, or null when it is not a plausible address. */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL.test(email) ? email : null;
}

export function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** Up to two non-empty questions, each one line. */
export function cleanQuestions(values: unknown[]): string[] {
  return values
    .map((value) => cleanLine(value, MAX_QUESTION_LENGTH))
    .filter((value): value is string => value !== null)
    .slice(0, MAX_QUESTIONS);
}

/** Tags typed as "a, b; c": lower-case, distinct, capped. */
export function parseTags(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const seen = new Set<string>();
  for (const part of value.split(/[,;\n]/)) {
    const tag = cleanLine(part, MAX_TAG_LENGTH)?.toLowerCase();
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

/** Answers keyed by the page's own questions only: a posted key the page did not ask is
 * dropped, so a visitor cannot add fields. */
export function readAnswers(questions: string[], posted: (index: number) => unknown): Record<string, string> {
  const answers: Record<string, string> = {};
  questions.forEach((question, index) => {
    const answer = cleanLine(posted(index), MAX_ANSWER_LENGTH);
    if (answer) answers[question] = answer;
  });
  return answers;
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

/** utm_* parameters from the page's address, short and plain. */
export function readUtm(get: (key: string) => unknown): Record<string, string> {
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = cleanLine(get(`utm_${key}`), 100);
    if (value) utm[key] = value;
  }
  return utm;
}

/** A referral code as the page's address carries it, or null. */
export function readReferralCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{12,64}$/.test(value) ? value : null;
}

export function newToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

export function newReferralCode(): string {
  return randomBytes(8).toString("hex");
}

/**
 * DISC-CONS-P0-05.2: a person may be messaged only when they gave consent and have not
 * unsubscribed. Checked on the server before every send; the business's opt-out list is
 * checked as well (`prepareOutreachEmail`).
 */
export function messagingRefusal(lead: { consent_at: string | null; status: string }): string | null {
  if (lead.status === "unsubscribed") return "This person unsubscribed, so they can't be emailed.";
  if (!lead.consent_at) return "This person hasn't agreed to hear from you, so they can't be emailed.";
  return null;
}

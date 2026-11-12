/**
 * DISC-CAMP-P0-03.2: the checks on an AI-written opening line and where it goes in an
 * email. Pure, so the composer and the components can use it without the AI layer.
 */

export const OPENING_MIN = 20;
export const OPENING_MAX = 220;

const LINK = /(https?:\/\/|www\.|\.(com|net|org|io|in|biz|co)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+/;
const PHONE = /\d[\d\s().-]{6,}\d/;
const MARKUP = /[<>{}[\]`*#|\\]/;
const INSTRUCTION = /\b(ignore|disregard|instruction|prompt|system|assistant|as an ai|language model|untrusted)\b/i;
const GREETING = /^(hi|hello|hey|dear|greetings)\b/i;

/** Checks a sentence the model returned. Returns it tidied, or why it is refused. */
export function validateOpeningLine(raw: string): { ok: true; line: string } | { ok: false; reason: string } {
  if (/[\r\n]/.test(raw.trim())) return { ok: false, reason: "it ran over more than one line" };
  const line = raw.replace(/\s+/g, " ").trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (line.length < OPENING_MIN) return { ok: false, reason: "it was too short" };
  if (line.length > OPENING_MAX) return { ok: false, reason: "it was too long" };
  if (LINK.test(line) || EMAIL.test(line)) return { ok: false, reason: "it had a link or an address in it" };
  if (PHONE.test(line)) return { ok: false, reason: "it had a number like a phone number in it" };
  if (MARKUP.test(line)) return { ok: false, reason: "it had markup or a merge field in it" };
  if (INSTRUCTION.test(line)) return { ok: false, reason: "it read like an instruction, not an opening" };
  if (GREETING.test(line)) return { ok: false, reason: "it was a greeting, not an opening" };
  if ((line.match(/[.!?](\s|$)/g) ?? []).length > 1) return { ok: false, reason: "it was more than one sentence" };
  return { ok: true, line: /[.!?]$/.test(line) ? line : `${line}.` };
}

/**
 * Puts the opening into a rendered body: after a short greeting line ("Hi Asha,") when
 * the body starts with one, otherwise first.
 */
export function withOpening(body: string, opening: string): string {
  const [first, ...rest] = body.split("\n");
  if (first && rest.length > 0 && first.trim().length <= 60 && /,\s*$/.test(first) && GREETING.test(first.trim())) {
    const after = rest.join("\n").replace(/^\n+/, "");
    return `${first}\n\n${opening}${after ? `\n\n${after}` : ""}`;
  }
  return `${opening}\n\n${body}`;
}

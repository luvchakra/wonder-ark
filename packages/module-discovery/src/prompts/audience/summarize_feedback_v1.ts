import { untrusted, UNTRUSTED_RULES } from "../shared/untrusted";

/**
 * DISC-CONS-P0-04.2: "What people say" -- themes across an offering's feedback. Every
 * entry is what a person said (or what a member typed about it), so each is fenced as
 * quoted material (CLAUDE.md AI rule 1) and named only by a short reference (E1, E2...).
 * The answer is checked by code: references must be ones given, a suggested Ideal-user
 * edit must name a known field, and nothing is applied to the ICP unless a person
 * accepts it.
 */
export const SUMMARIZE_FEEDBACK_PROMPT_VERSION = "summarize_feedback_v1";

export function summarizeFeedbackPrompt(input: {
  offeringName: string;
  idealUser: unknown;
  entries: { ref: string; kind: string; tags: string[]; body: string }[];
  fields: readonly string[];
}): string {
  const entries = input.entries
    .map((entry) => `${entry.ref} (${entry.kind}${entry.tags.length > 0 ? `; tags: ${entry.tags.join(", ")}` : ""}):\n${untrusted(entry.ref, entry.body, 2_000)}`)
    .join("\n\n");
  return `You summarise what people said about an offering into a few themes, for the team that sells it.

${UNTRUSTED_RULES}

${untrusted("offering_name", input.offeringName, 200)}
${untrusted("current_ideal_user", JSON.stringify(input.idealUser ?? {}, null, 2), 3_000)}

The feedback entries, each named by its reference:

${entries}

Write between one and six themes. For each theme:
- title: a few words.
- summary: one or two sentences on what people said, in plain words. No quotes longer than ten words.
- entries: the references (like "E3") of every entry behind the theme. Use only references listed above.
- suggestion: when the theme shows the current ideal user is missing something, the field to add to (one of: ${input.fields.join(", ")}) and up to five short items to add. Otherwise null.

Base every theme only on the entries. Do not invent people, numbers or claims. Never repeat an email address, phone number or link.`;
}

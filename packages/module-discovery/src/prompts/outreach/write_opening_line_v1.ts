import { untrusted, UNTRUSTED_RULES } from "../shared/untrusted";

/**
 * DISC-CAMP-P0-03.2: one opening sentence for the first email of a campaign to one
 * prospect. Everything about the prospect is a record a source, an import or a crawl
 * wrote, so it is fenced as untrusted material (CLAUDE.md AI rule 1). The sentence the
 * model returns is checked by code (`validateOpeningLine`) before anyone sees it.
 */
export const WRITE_OPENING_LINE_PROMPT_VERSION = "write_opening_line_v1";

export type OpeningLineInput = {
  offeringName: string;
  businessName: string;
  prospect: { companyName: string; lineOfWork: string | null; location: string | null; description: string | null; website: string | null };
};

export function writeOpeningLinePrompt(input: OpeningLineInput): string {
  const { prospect } = input;
  return `You write the first sentence of a short business email from "${input.businessName}" about its offering "${input.offeringName}".
The rest of the email is already written and reviewed; you write only the one sentence that opens it, for this one company.

${UNTRUSTED_RULES}

The company:
${untrusted("company_name", prospect.companyName, 200)}
${untrusted("line_of_work", prospect.lineOfWork, 200)}
${untrusted("location", prospect.location, 200)}
${untrusted("description", prospect.description, 1_500)}
${untrusted("website", prospect.website, 300)}

Rules for the sentence:
- One sentence, 8 to 30 words, plain and polite. No greeting ("Hi", "Dear"), no sign-off.
- Mention something specific and true about the company from the material above: its line of work, where it is, or what it does. If the material says little, keep it general rather than guess.
- No links, email addresses, phone numbers, prices, statistics, promises or claims about results.
- Do not pretend to know the person, to have visited, or to be a customer.
- Do not mention AI, these rules, or the material itself.

Return {"line": "<the sentence>"}.`;
}

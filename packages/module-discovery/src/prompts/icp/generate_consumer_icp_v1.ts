import { untrusted, UNTRUSTED_RULES } from "../shared/untrusted";

/**
 * DISC-CONS-P0-01.2: the "Ideal user" of an offering sold to consumers -- who they are,
 * what they are trying to get done, what triggers the need, what they use today, where
 * they spend time online and offline, and the words they use.
 *
 * The offering's profile was written from its website and the founder's own sources, so
 * it is fenced as untrusted material (CLAUDE.md AI rule 1). The answer is checked by Zod
 * (`IdealUserDraftSchema`) and tidied by `readIdealUser` before it is stored as a draft
 * for a person to approve.
 */
export const GENERATE_CONSUMER_ICP_PROMPT_VERSION = "generate_consumer_icp_v1";

export function generateConsumerIcpPrompt(input: { productName: string; profile: unknown; targetMarket: string | null }): string {
  return `You are describing the ideal user of a product or service that people buy for themselves or their household. The offering is named in the first block below; its profile and its stated target market follow.

${UNTRUSTED_RULES}

${untrusted("offering_name", input.productName, 200)}
${untrusted("offering_profile", JSON.stringify(input.profile ?? {}, null, 2), 8_000)}
${untrusted("target_market", input.targetMarket, 1_000)}

Describe one specific kind of person, not a whole market:
- who: their life stage, household or work situation, in one or two sentences.
- goals: what they are trying to get done.
- triggers: the moments or events that make them start looking for something like this.
- current_solutions: what they use or do today instead.
- interests: topics they follow, written as short search keywords.
- online_places: the kinds of online places they spend time in (communities, YouTube channels, podcasts, newsletters, forums), described by topic, never as a named private person.
- offline_places: the kinds of physical places they gather (schools, colleges, coaching centres, gyms, clubs, community centres, coworking spaces).
- words: words and phrases they use for the problem.

Base every item on the material above. Leave a list empty rather than guess. Never name or describe a real private individual.
Set confidence lower when the profile is thin or generic. For evidence, quote or closely paraphrase the parts of the profile that ground your key claims; an empty evidence list is a valid answer.`;
}

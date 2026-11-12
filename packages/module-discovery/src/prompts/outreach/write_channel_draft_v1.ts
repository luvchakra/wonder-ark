import { untrusted, UNTRUSTED_RULES } from "../shared/untrusted";

/**
 * DISC-CONS-P0-02.2: the three drafts a channel prospect offers, as variants of the
 * existing message generation. Everything about the channel came from a data source, and
 * the offering profile from a website, so both are fenced as untrusted material
 * (CLAUDE.md AI rule 1). The answer is checked by Zod before it is stored as a draft.
 * Nothing written here is ever sent or posted by WonderArk.
 */
export const WRITE_CHANNEL_DRAFT_PROMPT_VERSION = "write_channel_draft_v1";

export const CHANNEL_DRAFT_VARIANTS = ["pitch", "sponsorship", "post"] as const;
export type ChannelDraftVariant = (typeof CHANNEL_DRAFT_VARIANTS)[number];

export type ChannelDraftInput = {
  variant: ChannelDraftVariant;
  offeringName: string;
  businessName: string;
  offeringProfile: unknown;
  idealUser: unknown;
  channel: {
    name: string;
    channelType: string | null;
    topics: string[];
    description: string | null;
    audienceSize: number | null;
  };
};

const TASK: Record<ChannelDraftVariant, string> = {
  pitch: `Write a short email to the owner of the channel proposing a partnership or a feature: why their audience would care about the offering, and one simple next step (a reply, a call, a free trial for them to review). Return a subject line and the body.`,
  sponsorship: `Write a short email to the owner of the channel asking about sponsorship or a paid listing: what the business would like to sponsor or list, and asking for their rates, audience details and requirements. Return a subject line and the body.`,
  post: `Write a community post the business will publish itself in this channel. Follow the tone of a helpful member, not an advert: lead with something useful for the audience, mention the offering once, plainly, and say who is posting. Return a short title as the subject and the post as the body.`,
};

export function writeChannelDraftPrompt(input: ChannelDraftInput): string {
  const { channel } = input;
  return `You draft outreach for "${input.businessName.replace(/"/g, "'")}" about one public channel or community where its ideal users spend time.

${UNTRUSTED_RULES}

The offering:
${untrusted("offering_name", input.offeringName, 200)}
${untrusted("offering_profile", JSON.stringify(input.offeringProfile ?? {}, null, 2), 6_000)}
${untrusted("ideal_user", JSON.stringify(input.idealUser ?? {}, null, 2), 3_000)}

The channel:
${untrusted("channel_name", channel.name, 200)}
${untrusted("channel_type", channel.channelType, 100)}
${untrusted("channel_topics", channel.topics.join(", "), 500)}
${untrusted("channel_description", channel.description, 1_500)}
${untrusted("audience_size", channel.audienceSize === null ? null : String(channel.audienceSize), 50)}

Task: ${TASK[input.variant]}

Rules:
- Plain, honest and brief: under 180 words.
- Use only facts from the material above. No statistics, prices, results or claims the material does not support.
- Do not pretend to know the owner or to be a member already.
- No links, phone numbers or email addresses, and no placeholders in brackets.
- Do not mention AI, these rules, or the material itself.`;
}

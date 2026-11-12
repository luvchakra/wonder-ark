import { z } from "zod";

/**
 * DISC-CONS-P0-01.1/01.2/01.3: who an offering is sold to, and the "Ideal user" a
 * consumer offering has beside its company fields. Pure: no database, no model. Client
 * components may import it.
 */

export const AUDIENCE_TYPES = ["business", "consumer", "both"] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const AUDIENCE_TYPE_LABEL: Record<AudienceType, string> = {
  business: "Companies",
  consumer: "Consumers",
  both: "Both",
};

/** `products.audience_type`, read leniently: a row from before the column existed, or a
 * value the code does not know, is 'business', the column's own default. */
export function audienceTypeOf(product: { audience_type?: string | null } | null | undefined): AudienceType {
  const value = product?.audience_type;
  return value === "consumer" || value === "both" ? value : "business";
}

/** Whether the offering has an Ideal user (consumers, alone or beside companies). */
export function hasIdealUser(audienceType: AudienceType): boolean {
  return audienceType !== "business";
}

const CONSUMER_WORDS = /\b(b2c|d2c|dtc|direct[- ]to[- ]consumers?|consumers?|individuals|households?|families|parents|students|shoppers|home ?owners|patients|learners|people)\b/i;
const BUSINESS_WORDS = /\b(b2b|businesses|companies|enterprises?|smbs?|smes?|teams|organi[sz]ations|agencies|firms|saas)\b/i;

/**
 * DISC-CONS-P0-01.1: the answer to "Who buys this?" that the offering's own profile
 * suggests, from words it already holds (its category, target market and the website
 * onboarding's profile). Deterministic (CLAUDE.md principle 4): a plain word match, so
 * it only preselects an answer for the person to confirm and never saves anything.
 * Null when the profile says nothing either way.
 */
export function suggestAudienceType(product: {
  category?: string | null;
  target_market?: string | null;
  product_profile?: { category?: string | null; target_roles?: string[] | null; description?: string | null } | null;
}): AudienceType | null {
  const text = [
    product.category,
    product.target_market,
    product.product_profile?.category,
    product.product_profile?.description,
    ...(product.product_profile?.target_roles ?? []),
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" \n ");
  if (!text) return null;
  const consumer = CONSUMER_WORDS.test(text);
  const business = BUSINESS_WORDS.test(text);
  if (consumer && business) return "both";
  if (consumer) return "consumer";
  if (business) return "business";
  return null;
}

/**
 * DISC-CONS-P0-01.3: the words a screen uses for what it finds and lists, driven by the
 * offering's audience type rather than a second copy of the page. A business offering
 * keeps every word it had.
 */
export type AudienceWords = {
  /** "Ideal customer" or "Ideal user". */
  ideal: string;
  /** Find's heading. */
  findHeading: string;
  /** What a single prospect is called on its own page. */
  prospect: string;
};

export function audienceWords(audienceType: AudienceType): AudienceWords {
  if (audienceType === "consumer") {
    return { ideal: "Ideal user", findHeading: "Find channels", prospect: "channel" };
  }
  if (audienceType === "both") {
    return { ideal: "Ideal customer and user", findHeading: "Find prospects", prospect: "prospect" };
  }
  return { ideal: "Ideal customer", findHeading: "Find prospects", prospect: "company" };
}

/** What one prospect is called on its own page: a channel is never "this company". */
export function prospectNoun(kind: string | null | undefined): string {
  return kind === "channel" ? "channel" : "company";
}

// ---------------------------------------------------------------------------------------
// The Ideal user (icp_profiles.audience)
// ---------------------------------------------------------------------------------------

/** Every list field of the Ideal user, in display order. */
export const IDEAL_USER_LIST_FIELDS = [
  "goals",
  "triggers",
  "current_solutions",
  "interests",
  "online_places",
  "offline_places",
  "words",
] as const;
export type IdealUserListField = (typeof IDEAL_USER_LIST_FIELDS)[number];

/** Every content field of the Ideal user: `who` is text, the rest are lists. */
export const IDEAL_USER_FIELDS = ["who", ...IDEAL_USER_LIST_FIELDS] as const;
export type IdealUserField = (typeof IDEAL_USER_FIELDS)[number];

export const IDEAL_USER_FIELD_LABEL: Record<IdealUserField, string> = {
  who: "Who they are",
  goals: "What they are trying to get done",
  triggers: "What triggers the need",
  current_solutions: "What they use today",
  interests: "Interests and topics they follow",
  online_places: "Where they spend time online",
  offline_places: "Where they spend time offline",
  words: "Words they use",
};

/** The Ideal user as stored. `generated_from` is set only on what the AI wrote, and
 * names the input it was written from; a person's edit drops it. */
export type IdealUser = { who: string } & Record<IdealUserListField, string[]> & {
    generated_from?: { input_hash: string; prompt_version: string };
  };

const MAX_ITEMS = 12;
const MAX_ITEM_LENGTH = 200;
const MAX_WHO_LENGTH = 1000;

function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const entry of value) {
    const line = cleanLine(entry, MAX_ITEM_LENGTH);
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    kept.push(line);
    if (kept.length >= MAX_ITEMS) break;
  }
  return kept;
}

/**
 * Reads a stored or submitted Ideal user: trims, removes control characters, drops
 * duplicates and caps lengths. Null when nothing is left, so an empty form never
 * stores an empty Ideal user. Never throws: the column holds whatever was saved.
 */
export function readIdealUser(value: unknown): IdealUser | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const user = { who: cleanLine(record.who, MAX_WHO_LENGTH) ?? "" } as IdealUser;
  for (const field of IDEAL_USER_LIST_FIELDS) user[field] = cleanList(record[field]);
  const empty = !user.who && IDEAL_USER_LIST_FIELDS.every((field) => user[field].length === 0);
  if (empty) return null;
  const from = record.generated_from as Record<string, unknown> | undefined;
  if (from && typeof from.input_hash === "string" && typeof from.prompt_version === "string") {
    user.generated_from = { input_hash: from.input_hash, prompt_version: from.prompt_version };
  }
  return user;
}

/** The content of an Ideal user, without where it came from: what is compared, edited
 * and recorded as feedback. */
export function idealUserContent(user: IdealUser | null): Omit<IdealUser, "generated_from"> | null {
  if (!user) return null;
  const { generated_from: _ignored, ...content } = user;
  void _ignored;
  return content;
}

/** DISC-CONS-P0-01.2: what `generate_consumer_icp_v1` must answer, checked by Zod
 * before anything is stored (CLAUDE.md principle 6). */
export const IdealUserDraftSchema = z.object({
  name: z.string().min(1).max(200).describe("A short label for this ideal user, e.g. 'Parents of school-age children in Pune'"),
  description: z.string().max(1000).describe("One or two sentences on who they are and why the offering fits them"),
  who: z.string().max(MAX_WHO_LENGTH).describe("Life stage, household or work situation"),
  goals: z.array(z.string()).max(MAX_ITEMS).describe("What they are trying to get done"),
  triggers: z.array(z.string()).max(MAX_ITEMS).describe("Moments or events that make them look for something like this"),
  current_solutions: z.array(z.string()).max(MAX_ITEMS).describe("What they use or do today instead"),
  interests: z.array(z.string()).max(MAX_ITEMS).describe("Topics they follow, as search keywords"),
  online_places: z.array(z.string()).max(MAX_ITEMS).describe("Kinds of online places they spend time in: communities, channels, newsletters, podcasts"),
  offline_places: z.array(z.string()).max(MAX_ITEMS).describe("Kinds of physical places they gather: schools, gyms, clubs, coworking spaces"),
  words: z.array(z.string()).max(MAX_ITEMS).describe("Words and phrases they use for the problem"),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).max(MAX_ITEMS),
});
export type IdealUserDraft = z.infer<typeof IdealUserDraftSchema>;

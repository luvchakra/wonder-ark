import { cleanText, countryName, safeHttpUrl, searchMatchReason, type FieldSource } from "./suggestions";
import type { ChannelItem } from "./workslake-client";

/**
 * DISC-CONS-P0-02.1: turns one gateway channel record into a row for
 * `discovery.prospect_suggestions`, and reads a stored one back for the review list and
 * for approval. Pure: no database, no network, no model. Everything the gateway sends is
 * untrusted text, tidied and stored as data; the match reason is built from the person's
 * own search, never from the gateway's words (as for a business record).
 *
 * A channel is a named public outlet or gathering place, never a private person, and it
 * carries no personal email (the contract says so; nothing here reads one).
 */

export const CHANNEL_TYPE_LABEL: Record<string, string> = {
  youtube_channel: "YouTube channel",
  podcast: "Podcast",
  community: "Community",
  newsletter: "Newsletter",
  forum: "Forum",
  publication: "Publication",
  event: "Event",
  organisation: "Organisation",
};

export function channelTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return CHANNEL_TYPE_LABEL[type] ?? cleanText(type, 60);
}

const NUMBER = new Intl.NumberFormat("en-IN");
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DAY.format(date);
}

/** "120,000 subscribers (10 Nov 2026)". Null when the source gave no number: an
 * audience is never estimated. */
export function formatAudience(value: number | null | undefined, unit?: string | null, asOf?: string | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  const parts = [NUMBER.format(Math.round(value)), cleanText(unit ?? null, 40)].filter(Boolean).join(" ");
  const day = formatDay(asOf);
  return day ? `${parts} (${day})` : parts;
}

export type ChannelSuggestionRow = {
  workspace_id: string;
  kind: "channel";
  company_name: string;
  /** Left empty on purpose: a channel's address is on a shared host (youtube.com), and
   * the duplicate check matches on website domain, so every channel there would read as
   * one. The channel's own link is `source_url`. */
  website: null;
  industry: string | null;
  company_size: null;
  location: string | null;
  description: string | null;
  match_reason: string;
  source_url: string | null;
  source: string;
  source_name: string;
  source_ref: string | null;
  external_id: string;
  payload: ChannelItem;
};

function topicsOf(topics: string[]): string | null {
  const kept = topics
    .map((topic) => cleanText(topic, 60))
    .filter((topic): topic is string => topic !== null)
    .slice(0, 6);
  return kept.length > 0 ? kept.join(", ").slice(0, 300) : null;
}

export function toChannelSuggestionRow(
  workspaceId: string,
  item: ChannelItem,
  what: string,
  where: string,
): ChannelSuggestionRow | null {
  const name = cleanText(item.name, 200);
  const provider = cleanText(item.source.provider, 100);
  const sourceName = cleanText(item.source.name, 300);
  const externalId = cleanText(item.id, 300);
  if (!name || !provider || !sourceName || !externalId) return null;
  const channelUrl = safeHttpUrl(item.url);
  return {
    workspace_id: workspaceId,
    kind: "channel",
    company_name: name,
    website: null,
    // For a channel the "industry" column holds its topics, shown as "Topics".
    industry: topicsOf(item.topics),
    company_size: null,
    location: cleanText(item.location.text, 200) ?? countryName(item.location.country),
    description: cleanText(item.description, 2000),
    match_reason: searchMatchReason(what, where),
    source_url: channelUrl ?? safeHttpUrl(item.source.url),
    source: provider,
    source_name: sourceName,
    source_ref: safeHttpUrl(item.source.url) ?? channelUrl,
    external_id: externalId,
    payload: item,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What a stored channel record says about itself, read defensively from `payload`. */
export type StoredChannel = {
  channelType: string | null;
  audience: { value: number; unit: string | null; asOf: string | null } | null;
  topics: string[];
  url: string | null;
  contactUrl: string | null;
  observedAt: string | null;
};

export function channelOf(payload: unknown): StoredChannel | null {
  if (!isRecord(payload) || payload.kind !== "channel") return null;
  const audience = isRecord(payload.audience) ? payload.audience : null;
  const value = audience && typeof audience.value === "number" && Number.isFinite(audience.value) && audience.value >= 0 ? audience.value : null;
  return {
    channelType: typeof payload.channelType === "string" ? cleanText(payload.channelType, 60) : null,
    audience:
      value === null
        ? null
        : {
            value: Math.round(value),
            unit: typeof audience?.unit === "string" ? cleanText(audience.unit, 40) : null,
            asOf: typeof audience?.asOf === "string" ? audience.asOf : null,
          },
    topics: Array.isArray(payload.topics)
      ? payload.topics.map((topic) => cleanText(typeof topic === "string" ? topic : null, 60)).filter((t): t is string => t !== null).slice(0, 6)
      : [],
    url: safeHttpUrl(typeof payload.url === "string" ? payload.url : null),
    contactUrl: safeHttpUrl(typeof payload.contactUrl === "string" ? payload.contactUrl : null),
    observedAt: typeof payload.observedAt === "string" ? payload.observedAt : null,
  };
}

/**
 * DISC-CONS-P0-02.1: the columns a channel prospect takes from its suggestion: its type,
 * audience size and where each came from. `field_sources.audience_size` carries the date
 * the source measured the audience, so the prospect page can say "as of".
 */
export function channelProspectFields(suggestion: {
  payload?: unknown;
  source?: string | null;
  source_name?: string | null;
  source_ref?: string | null;
  industry?: string | null;
  location?: string | null;
  description?: string | null;
}): { channel_type: string | null; audience_size: number | null; field_sources: Record<string, FieldSource> } {
  const channel = channelOf(suggestion.payload);
  const base: Omit<FieldSource, "observedAt"> = {
    provider: suggestion.source ?? "",
    name: suggestion.source_name ?? suggestion.source ?? "",
    url: safeHttpUrl(suggestion.source_ref ?? null),
  };
  const sources: Record<string, FieldSource> = {};
  if (!channel || !base.provider) return { channel_type: channel?.channelType ?? null, audience_size: channel?.audience?.value ?? null, field_sources: sources };
  if (channel.channelType) sources.channel_type = { ...base, observedAt: channel.observedAt };
  if (channel.audience) sources.audience_size = { ...base, observedAt: channel.audience.asOf ?? channel.observedAt };
  for (const column of ["industry", "location", "description"] as const) {
    if (suggestion[column]) sources[column] = { ...base, observedAt: channel.observedAt };
  }
  return { channel_type: channel.channelType, audience_size: channel.audience?.value ?? null, field_sources: sources };
}

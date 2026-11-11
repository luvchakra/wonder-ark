import type { IcpPreFilterCandidate } from "../pipeline/icp-pre-filter";
import type { BusinessItem } from "./workslake-client";

/**
 * DISC-DATA-P0-03.2: turns one gateway business record into a row for
 * `discovery.prospect_suggestions`, the only door into the pipeline. Pure functions: no
 * database, no network, no model.
 *
 * Everything the gateway sends is untrusted text. Here it is only tidied (whitespace
 * collapsed, length capped, links kept only when they are plain http or https) and
 * stored as data. The one sentence this file writes itself, the match reason, is built
 * from the person's own search and the gateway's counts, never from the gateway's words.
 */

/** What a source supplied for one prospect column: `discovery.prospects.field_sources`. */
export type FieldSource = {
  provider: string;
  name: string;
  url: string | null;
  observedAt: string | null;
};

export type GatewaySuggestionRow = {
  workspace_id: string;
  kind: "company";
  company_name: string;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  location: string | null;
  description: string | null;
  match_reason: string;
  source_url: string | null;
  source: string;
  source_name: string;
  source_ref: string | null;
  external_id: string;
  payload: BusinessItem;
};

/** One line, no control characters, at most `max` characters. Null when nothing is left. */
export function cleanText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** A link is kept only if it is a plain http or https address: what the gateway sends is
 * shown as a link, and nothing else (a `javascript:` address, say) may be clicked. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function websiteOf(item: BusinessItem): string | null {
  const website = safeHttpUrl(item.website);
  if (website) return website;
  const domain = item.domain?.trim();
  return domain && DOMAIN.test(domain) ? `https://${domain.toLowerCase()}` : null;
}

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** "IN" -> "India". Null for anything that is not a region code. */
export function countryName(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toUpperCase();
  if (!trimmed || !/^[A-Z]{2}$/.test(trimmed)) return null;
  try {
    const name = REGION_NAMES.of(trimmed);
    return name && name !== trimmed ? name : null;
  } catch {
    return null;
  }
}

function joinDistinct(parts: (string | null | undefined)[], max: number): string | null {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const cleaned = cleanText(part, max);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if ([...seen].some((existing) => existing.includes(key))) continue;
    seen.add(key);
    kept.push(cleaned);
  }
  return kept.length > 0 ? kept.join(", ").slice(0, max) : null;
}

/** The place to show: the source's own text, else city, region and country. */
export function placeOf(item: BusinessItem): string | null {
  const { location } = item;
  return (
    cleanText(location.text, 200) ??
    joinDistinct([location.city, location.region, countryName(location.country) ?? location.country], 200)
  );
}

/**
 * What the ICP pre-filter may judge a gateway record on.
 *
 * Location carries everything known about the place, the country's name included, so a
 * record in "Kothrud, Pune" is not turned away by an ICP whose geography is "India".
 * Company size is left unknown on purpose: the pre-filter compares text, and a source's
 * range ("51-200") against an ICP's free text ("50-500 employees") would be refused
 * though it fits. The pre-filter never refuses on an unknown value.
 */
export function preFilterCandidate(item: BusinessItem): IcpPreFilterCandidate {
  const { location } = item;
  return {
    industry: cleanText(item.industry, 200),
    location: joinDistinct(
      [location.text, location.city, location.region, countryName(location.country), location.country],
      400,
    ),
    companySize: null,
  };
}

/** Why a search result is in the review list, in the person's own search words. */
export function searchMatchReason(what: string, where: string): string {
  const query = cleanText(what, 120) ?? "";
  const place = cleanText(where, 120);
  return place ? `Matches your search for "${query}" in ${place}.` : `Matches your search for "${query}".`;
}

/** Why a hiring-signal result is in the review list: counts only. The job titles the
 * gateway matched stay in the stored record and are shown as text beside it. */
export function hiringMatchReason(item: BusinessItem): string {
  const { matched, openJobs, newJobs7d } = item.signals;
  const count = matched ?? openJobs;
  const roles =
    count === null || count === undefined
      ? "Hiring for roles that match your keywords"
      : `${count} open role${count === 1 ? "" : "s"} match${count === 1 ? "es" : ""} your keywords`;
  return newJobs7d ? `${roles} (${newJobs7d} new this week).` : `${roles}.`;
}

export function toSuggestionRow(
  workspaceId: string,
  item: BusinessItem,
  matchReason: string,
): GatewaySuggestionRow | null {
  const name = cleanText(item.name, 200);
  const provider = cleanText(item.source.provider, 100);
  const sourceName = cleanText(item.source.name, 300);
  const externalId = cleanText(item.id, 300);
  // A record that cannot say what it is called, where it came from or what its id is
  // cannot be shown with its provenance, so it is not staged at all.
  if (!name || !provider || !sourceName || !externalId) return null;

  const sourceUrl = safeHttpUrl(item.source.url);
  return {
    workspace_id: workspaceId,
    kind: "company",
    company_name: name,
    website: websiteOf(item),
    industry: cleanText(item.industry, 200),
    company_size: cleanText(item.employeeRange, 100),
    location: placeOf(item),
    description: cleanText(item.description, 2000),
    match_reason: matchReason,
    source_url: sourceUrl,
    source: provider,
    source_name: sourceName,
    source_ref: sourceUrl,
    external_id: externalId,
    payload: item,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first category a stored gateway record carries, for the review list. Reads the
 * `payload` column defensively: it is whatever was stored, shown as text. */
export function categoryOf(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.categories)) return null;
  const first = payload.categories.find((entry): entry is string => typeof entry === "string");
  return cleanText(first, 80);
}

/** The job titles a hiring-signal record matched, for the review list. Shown as text. */
export function matchedTitlesOf(payload: unknown): string[] {
  if (!isRecord(payload) || !isRecord(payload.signals) || !Array.isArray(payload.signals.matchedTitles)) return [];
  return payload.signals.matchedTitles
    .filter((entry): entry is string => typeof entry === "string")
    .map((title) => cleanText(title, 80))
    .filter((title): title is string => title !== null)
    .slice(0, 3);
}

/** Prospect columns a gateway record can fill, and the gateway field each comes from. */
const PROSPECT_FIELD_ORIGIN = {
  website: "website",
  industry: "industry",
  company_size: "employeeRange",
  location: "location",
  description: "description",
  phone: "phone",
  company_email: "email",
} as const;

export type GatewayFilledColumn = keyof typeof PROSPECT_FIELD_ORIGIN;

/**
 * `field_sources` for a prospect made from a gateway suggestion: one entry per column
 * the source supplied a value for. A field the gateway says came from a different
 * source (its `provenance`) is credited to that one.
 */
export function fieldSourcesFor(
  filled: Partial<Record<GatewayFilledColumn, string | null>>,
  suggestion: { source: string; source_name: string | null; source_ref: string | null },
  payload: unknown,
): Record<string, FieldSource> {
  const observedAt = isRecord(payload) && typeof payload.observedAt === "string" ? payload.observedAt : null;
  const provenance = isRecord(payload) && isRecord(payload.provenance) ? payload.provenance : {};
  const fallback: FieldSource = {
    provider: suggestion.source,
    name: suggestion.source_name ?? suggestion.source,
    url: safeHttpUrl(suggestion.source_ref),
    observedAt,
  };

  const sources: Record<string, FieldSource> = {};
  for (const column of Object.keys(PROSPECT_FIELD_ORIGIN) as GatewayFilledColumn[]) {
    if (!filled[column]) continue;
    const other = provenance[PROSPECT_FIELD_ORIGIN[column]];
    const name = isRecord(other) ? cleanText(typeof other.name === "string" ? other.name : null, 300) : null;
    sources[column] =
      isRecord(other) && name
        ? {
            provider: cleanText(typeof other.provider === "string" ? other.provider : null, 100) ?? fallback.provider,
            name,
            url: safeHttpUrl(typeof other.url === "string" ? other.url : null),
            observedAt: typeof other.observedAt === "string" ? other.observedAt : observedAt,
          }
        : fallback;
  }
  return sources;
}

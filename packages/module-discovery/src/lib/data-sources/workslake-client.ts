import { z } from "zod";

/**
 * DISC-DATA-P0-02.1/02.2: the WorksLake gateway client -- Discovery's one outside data
 * connector (docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md, "Shared contract: the prospect
 * data API").
 *
 * Server-only. It reads the gateway's address and key from the environment, so it must
 * never be imported by a client component; import its types with `import type`.
 *
 * Rules this file keeps:
 *  - One host. Every request goes to WORKSLAKE_GATEWAY_URL and nowhere else. This module
 *    holds no data-provider key and calls no data provider.
 *  - The tenant is the caller's business id, resolved on the server and passed in as
 *    `tenantId`. Nothing here reads it from a request, a form or a cookie.
 *  - What comes back is untrusted text. Each response is validated against the contract's
 *    shape before any of it is used; names, descriptions and titles are data to store and
 *    show, never instructions.
 *  - Expected failures are a typed result, not an exception: `needs_setup`, `unavailable`,
 *    `quota`, `forbidden`.
 *  - No automatic retry. A POST here can spend the business's lookup units, and a retry
 *    after a timeout could spend them twice.
 *
 * The schemas mirror the contract exactly. They ignore fields the contract does not name
 * and refuse a response that is missing, or mistypes, one it does.
 */

export const GATEWAY_TIMEOUT_MS = 12_000;
export const GATEWAY_URL_ENV = "WORKSLAKE_GATEWAY_URL";
export const GATEWAY_KEY_ENV = "WORKSLAKE_GATEWAY_API_KEY";
/** The contract's page-size ceiling on every /v1/prospects route. */
export const GATEWAY_MAX_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------------------
// Contract: shared pieces
// ---------------------------------------------------------------------------------------

const text = z.string();
const nullableText = z.string().nullable();
const nullableNumber = z.number().nullable();

export const CHANNEL_TYPES = [
  "youtube_channel",
  "podcast",
  "community",
  "newsletter",
  "forum",
  "publication",
  "event",
  "organisation",
] as const;

export const EMAIL_STATUSES = ["verified", "risky", "invalid", "unverified"] as const;

/** `usage` on every route that can spend units. */
export const GatewayUsageSchema = z.object({
  unitsSpent: z.number(),
  tenantRemaining: z.object({ search: z.number(), paid: z.number() }),
});
export type GatewayUsage = z.infer<typeof GatewayUsageSchema>;

/** `source` on a search or signals result. */
export const GatewayItemSourceSchema = z.object({
  id: text,
  provider: text,
  name: text,
  url: nullableText,
  termsPending: z.boolean(),
});
export type GatewayItemSource = z.infer<typeof GatewayItemSourceSchema>;

/** The gateway's error body: `{ "error": { "code": "...", "message": "..." } }`. */
export const GatewayErrorSchema = z.object({
  error: z.object({ code: text, message: text }),
});

// ---------------------------------------------------------------------------------------
// Contract: POST /v1/prospects/search
// ---------------------------------------------------------------------------------------

export const GatewayLocationInputSchema = z.object({
  text: nullableText.optional(),
  country: nullableText.optional(),
  lat: nullableNumber.optional(),
  lon: nullableNumber.optional(),
  radiusKm: nullableNumber.optional(),
});
export type GatewayLocationInput = z.infer<typeof GatewayLocationInputSchema>;

export const SearchRequestSchema = z.object({
  kind: z.enum(["business", "channel"]),
  query: text,
  filters: z.object({
    categories: z.array(text),
    industries: z.array(text),
    employeeRanges: z.array(text),
    /** Sent only when the person asked for it; left out, it is no filter. */
    hasWebsite: z.boolean().optional(),
    channelTypes: z.array(z.enum(CHANNEL_TYPES)),
    minAudience: nullableNumber,
    languages: z.array(text),
  }),
  locations: z.array(GatewayLocationInputSchema),
  providers: z.array(text).min(1),
  limit: z.number().int().min(1).max(GATEWAY_MAX_PAGE_SIZE),
  cursor: nullableText,
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const BusinessItemSchema = z.object({
  id: text.min(1),
  kind: z.literal("business"),
  name: text.min(1),
  domain: nullableText,
  website: nullableText,
  /** The organisation's own published contact points, never a named person's. */
  phone: nullableText,
  email: nullableText,
  categories: z.array(text),
  industry: nullableText,
  employeeRange: nullableText,
  description: nullableText,
  location: z.object({
    text: nullableText,
    city: nullableText,
    region: nullableText,
    country: nullableText,
    postcode: nullableText,
    lat: nullableNumber,
    lon: nullableNumber,
  }),
  signals: z.object({
    openJobs: nullableNumber,
    newJobs7d: nullableNumber,
    /** Present on a /signals result only. */
    matched: nullableNumber.optional(),
    matchedTitles: z.array(text).optional(),
  }),
  source: GatewayItemSourceSchema,
  observedAt: text,
  /** Present where a field came from a different source than `source`. */
  provenance: z.record(z.string(), z.unknown()).optional(),
});
export type BusinessItem = z.infer<typeof BusinessItemSchema>;

export const ChannelItemSchema = z.object({
  id: text.min(1),
  kind: z.literal("channel"),
  channelType: z.enum(CHANNEL_TYPES),
  name: text.min(1),
  url: nullableText,
  topics: z.array(text),
  audience: z.object({ value: nullableNumber, unit: nullableText, asOf: nullableText }).nullable(),
  language: nullableText,
  location: z.object({ text: nullableText, country: nullableText }),
  contactUrl: nullableText,
  description: nullableText,
  source: GatewayItemSourceSchema,
  observedAt: text,
});
export type ChannelItem = z.infer<typeof ChannelItemSchema>;

export const ProspectItemSchema = z.discriminatedUnion("kind", [BusinessItemSchema, ChannelItemSchema]);
export type ProspectItem = z.infer<typeof ProspectItemSchema>;

export const PROVIDER_RUN_STATUSES = ["ok", "needs_setup", "unavailable", "quota"] as const;

const SearchMetadataSchema = z.object({
  matched: z.number(),
  /** One entry per provider asked. A provider that failed does not fail the request. */
  providers: z.array(z.object({ id: text, status: z.enum(PROVIDER_RUN_STATUSES), returned: z.number() })),
  asOf: text,
});

/** The envelope is checked as a whole; each result is checked on its own, so one record
 * that breaks the contract is dropped and counted (`unreadable`) rather than costing the
 * person every other result of a search they may have paid units for. */
const SearchEnvelopeSchema = z.object({
  requestId: text,
  kind: z.enum(["business", "channel"]),
  results: z.array(z.unknown()),
  nextCursor: nullableText,
  metadata: SearchMetadataSchema,
  usage: GatewayUsageSchema,
});

export type SearchResponse = Omit<z.infer<typeof SearchEnvelopeSchema>, "results"> & {
  results: ProspectItem[];
  /** How many results broke the contract's item shape and were dropped. */
  unreadable: number;
};

// ---------------------------------------------------------------------------------------
// Contract: POST /v1/prospects/enrich
// ---------------------------------------------------------------------------------------

export const ENRICH_FIELDS = [
  "industry",
  "employeeRange",
  "description",
  "phone",
  "email",
  "linkedinUrl",
  "hq",
] as const;

export const EnrichRequestSchema = z
  .object({
    domain: text.min(1).optional(),
    name: text.min(1).optional(),
    location: text.optional(),
    fields: z.array(z.enum(ENRICH_FIELDS)).min(1),
    allowPaid: z.boolean(),
  })
  .refine((request) => Boolean(request.domain || request.name), {
    message: "At least one of domain or name is required.",
  });
export type EnrichRequest = z.infer<typeof EnrichRequestSchema>;

const EnrichedFieldSchema = z.object({
  value: z.unknown().refine((value) => value !== null && value !== undefined, "A filled field has a value."),
  source: z.object({ provider: text, name: text, url: nullableText.optional() }),
  observedAt: text,
});

export const EnrichResponseSchema = z.object({
  requestId: text,
  domain: nullableText,
  /** A field the waterfall could not fill is null. */
  fields: z.record(z.string(), EnrichedFieldSchema.nullable()),
  usage: GatewayUsageSchema,
});
export type EnrichResponse = z.infer<typeof EnrichResponseSchema>;

// ---------------------------------------------------------------------------------------
// Contract: POST /v1/prospects/contacts
// ---------------------------------------------------------------------------------------

export const ContactsRequestSchema = z.object({
  domain: text.min(1),
  roles: z.array(text),
  limit: z.number().int().min(1).max(GATEWAY_MAX_PAGE_SIZE),
  verify: z.boolean(),
});
export type ContactsRequest = z.infer<typeof ContactsRequestSchema>;

export const ContactsResponseSchema = z.object({
  requestId: text,
  domain: text,
  contacts: z.array(
    z.object({
      firstName: nullableText,
      lastName: nullableText,
      title: nullableText,
      email: nullableText,
      emailStatus: z.enum(EMAIL_STATUSES),
      linkedinUrl: nullableText,
      source: z.object({
        provider: text,
        name: text,
        retrievedAt: text,
        termsPending: z.boolean(),
      }),
    }),
  ),
  generic: z.array(
    z.object({
      email: text,
      emailStatus: z.enum(EMAIL_STATUSES),
      source: z.object({ provider: text, name: text, url: nullableText.optional() }),
    }),
  ),
  usage: GatewayUsageSchema,
});
export type ContactsResponse = z.infer<typeof ContactsResponseSchema>;

// ---------------------------------------------------------------------------------------
// Contract: POST /v1/prospects/signals
// ---------------------------------------------------------------------------------------

export const SignalsRequestSchema = z.object({
  signal: z.literal("hiring"),
  keywords: z.array(text).min(1),
  locations: z.array(GatewayLocationInputSchema),
  sinceDays: z.number().int().min(1),
  limit: z.number().int().min(1).max(GATEWAY_MAX_PAGE_SIZE),
  cursor: nullableText,
});
export type SignalsRequest = z.infer<typeof SignalsRequestSchema>;

/** The contract says only that each result is a business item whose `signals` carries the
 * hiring counts. It does not spell out the rest of the envelope, so everything but
 * `results` is accepted when present and not required. */
const SignalsEnvelopeSchema = z.object({
  requestId: text.optional(),
  results: z.array(z.unknown()),
  nextCursor: nullableText.optional(),
  metadata: SearchMetadataSchema.optional(),
  usage: GatewayUsageSchema.optional(),
});

export type SignalsResponse = Omit<z.infer<typeof SignalsEnvelopeSchema>, "results"> & {
  results: BusinessItem[];
  unreadable: number;
};

// ---------------------------------------------------------------------------------------
// Contract: GET /v1/prospects/sources
// ---------------------------------------------------------------------------------------

export const SOURCE_STATUSES = ["active", "needs_setup", "paused", "unavailable"] as const;

const QuotaBucketSchema = z.object({ limit: z.number(), remaining: z.number() });

export const GatewayQuotaSchema = z.object({
  period: text,
  search: QuotaBucketSchema,
  paid: QuotaBucketSchema,
});
export type GatewayQuota = z.infer<typeof GatewayQuotaSchema>;

export const GatewaySourceSchema = z.object({
  id: text.min(1),
  label: text.min(1),
  kinds: z.array(text),
  status: z.enum(SOURCE_STATUSES),
  paid: z.boolean(),
  coverage: z.array(text),
  attribution: text,
});
export type GatewaySource = z.infer<typeof GatewaySourceSchema>;

export const SourcesResponseSchema = z.object({
  sources: z.array(GatewaySourceSchema),
  quota: GatewayQuotaSchema,
});
export type SourcesResponse = z.infer<typeof SourcesResponseSchema>;

// ---------------------------------------------------------------------------------------
// Contract: POST /v1/prospects/suppress
// ---------------------------------------------------------------------------------------

export const SuppressRequestSchema = z.object({
  emails: z.array(text),
  domains: z.array(text),
});
export type SuppressRequest = z.infer<typeof SuppressRequestSchema>;

export const SuppressResponseSchema = z.object({ accepted: z.number() });
export type SuppressResponse = z.infer<typeof SuppressResponseSchema>;

// ---------------------------------------------------------------------------------------
// Typed results
// ---------------------------------------------------------------------------------------

/**
 *  - needs_setup: the gateway's address or key is not set here, or the gateway answered
 *    503 PROVIDER_NEEDS_SETUP.
 *  - unavailable: a timeout, a network failure, a 5xx, or a response that does not match
 *    the contract.
 *  - quota:       429. `resetAt` is when the gateway said to try again, when it said.
 *  - forbidden:   401 or 403 -- the key is not accepted, or lacks the route's scope.
 */
export type GatewayFailureKind = "needs_setup" | "unavailable" | "quota" | "forbidden";

export type GatewayFailure = {
  ok: false;
  failure: GatewayFailureKind;
  /** The gateway's error code, or one of this client's own: NOT_CONFIGURED, TIMEOUT,
   * NETWORK, BAD_RESPONSE, BAD_REQUEST. For logs and the run ledger, never shown raw. */
  code: string;
  /** ISO time the quota resets, from Retry-After. Null unless `failure` is "quota". */
  resetAt: string | null;
  /** Whether a request left this server. False when settings were missing or the request
   * was refused before sending, so nothing was spent and there is no run to record. */
  called: boolean;
};

export type GatewayResult<T> = { ok: true; data: T } | GatewayFailure;

/** Who the call is for. `tenantId` is the business id, resolved on the server. */
export type GatewayCaller = { tenantId: string };

function failure(
  kind: GatewayFailureKind,
  code: string,
  called: boolean,
  resetAt: string | null = null,
): GatewayFailure {
  return { ok: false, failure: kind, code, resetAt, called };
}

// ---------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------

type GatewayConfig = { baseUrl: string; apiKey: string };

/**
 * Reads the two settings. Returns null when either is missing or the address is not one
 * a key may be sent to: it must be https, except a local address during development.
 * The address may be given with or without the trailing `/v1`.
 */
export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig | null {
  const rawUrl = env[GATEWAY_URL_ENV]?.trim();
  const apiKey = env[GATEWAY_KEY_ENV]?.trim();
  if (!rawUrl || !apiKey) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  if (url.username || url.password || url.search || url.hash) return null;

  const path = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
  return { baseUrl: `${url.origin}${path}/v1`, apiKey };
}

/** Whether both settings are present and usable. No request is made. */
export function isGatewayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readGatewayConfig(env) !== null;
}

// ---------------------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `Retry-After` is either a number of seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: Date = new Date()): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return new Date(now.getTime() + Number(trimmed) * 1000).toISOString();
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const parsed = GatewayErrorSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.error.code : null;
  } catch {
    return null;
  }
}

async function request(
  caller: GatewayCaller,
  method: "GET" | "POST",
  path: string,
  body: unknown,
): Promise<GatewayResult<unknown>> {
  const config = readGatewayConfig();
  if (!config) return failure("needs_setup", "NOT_CONFIGURED", false);
  // A missing or malformed tenant is a bug in the caller, not something to send and let
  // the gateway refuse: every request is counted against a tenant.
  if (!UUID.test(caller.tenantId)) return failure("unavailable", "TENANT_REQUIRED", false);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "X-Tenant-Id": caller.tenantId,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return failure("unavailable", name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "NETWORK", true);
  }

  if (response.ok) {
    try {
      return { ok: true, data: await response.json() };
    } catch {
      return failure("unavailable", "BAD_RESPONSE", true);
    }
  }

  const code = await readErrorCode(response);
  if (response.status === 401 || response.status === 403) {
    return failure("forbidden", code ?? `HTTP_${response.status}`, true);
  }
  if (response.status === 429) {
    return failure("quota", code ?? "QUOTA_EXCEEDED", true, parseRetryAfter(response.headers.get("Retry-After")));
  }
  if (response.status === 503 && code === "PROVIDER_NEEDS_SETUP") {
    return failure("needs_setup", code, true);
  }
  return failure("unavailable", code ?? `HTTP_${response.status}`, true);
}

function parseWith<T>(schema: z.ZodType<T>, result: GatewayResult<unknown>): GatewayResult<T> {
  if (!result.ok) return result;
  const parsed = schema.safeParse(result.data);
  return parsed.success ? { ok: true, data: parsed.data } : failure("unavailable", "BAD_RESPONSE", true);
}

/** Checks a request against the contract before it is sent, so a malformed one never
 * leaves this server (and never spends a unit). */
function checkRequest<T>(schema: z.ZodType<T>, input: unknown): T | GatewayFailure {
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : failure("unavailable", "BAD_REQUEST", false);
}

function isFailure(value: unknown): value is GatewayFailure {
  return typeof value === "object" && value !== null && (value as GatewayFailure).ok === false;
}

function readItems<T>(schema: z.ZodType<T>, raw: unknown[]): { items: T[]; unreadable: number } {
  const items: T[] = [];
  let unreadable = 0;
  for (const entry of raw) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
    else unreadable += 1;
  }
  return { items, unreadable };
}

// ---------------------------------------------------------------------------------------
// One function per contract route
// ---------------------------------------------------------------------------------------

/** POST /v1/prospects/search -- organisations or audience channels. A live provider is
 * called only when it is named in `providers`. */
export async function searchProspects(
  caller: GatewayCaller,
  input: SearchRequest,
): Promise<GatewayResult<SearchResponse>> {
  const body = checkRequest(SearchRequestSchema, input);
  if (isFailure(body)) return body;

  const envelope = parseWith(SearchEnvelopeSchema, await request(caller, "POST", "/prospects/search", body));
  if (!envelope.ok) return envelope;

  const { items, unreadable } = readItems(ProspectItemSchema, envelope.data.results);
  return { ok: true, data: { ...envelope.data, results: items, unreadable } };
}

/** POST /v1/prospects/enrich -- fills blanks for one organisation. */
export async function enrichOrganisation(
  caller: GatewayCaller,
  input: EnrichRequest,
): Promise<GatewayResult<EnrichResponse>> {
  const body = checkRequest(EnrichRequestSchema, input);
  if (isFailure(body)) return body;
  return parseWith(EnrichResponseSchema, await request(caller, "POST", "/prospects/enrich", body));
}

/** POST /v1/prospects/contacts -- people to write to at one organisation. Always spends
 * paid units, so call it only on a person's explicit action. */
export async function findContacts(
  caller: GatewayCaller,
  input: ContactsRequest,
): Promise<GatewayResult<ContactsResponse>> {
  const body = checkRequest(ContactsRequestSchema, input);
  if (isFailure(body)) return body;
  return parseWith(ContactsResponseSchema, await request(caller, "POST", "/prospects/contacts", body));
}

/** POST /v1/prospects/signals -- companies hiring for the given keywords. */
export async function hiringSignals(
  caller: GatewayCaller,
  input: SignalsRequest,
): Promise<GatewayResult<SignalsResponse>> {
  const body = checkRequest(SignalsRequestSchema, input);
  if (isFailure(body)) return body;

  const envelope = parseWith(SignalsEnvelopeSchema, await request(caller, "POST", "/prospects/signals", body));
  if (!envelope.ok) return envelope;

  const { items, unreadable } = readItems(BusinessItemSchema, envelope.data.results);
  return { ok: true, data: { ...envelope.data, results: items, unreadable } };
}

/** GET /v1/prospects/sources -- what this key can use right now, and the tenant's quota. */
export async function listSources(caller: GatewayCaller): Promise<GatewayResult<SourcesResponse>> {
  return parseWith(SourcesResponseSchema, await request(caller, "GET", "/prospects/sources", undefined));
}

/** POST /v1/prospects/suppress -- removal requests. */
export async function suppress(
  caller: GatewayCaller,
  input: SuppressRequest,
): Promise<GatewayResult<SuppressResponse>> {
  const body = checkRequest(SuppressRequestSchema, input);
  if (isFailure(body)) return body;
  return parseWith(SuppressResponseSchema, await request(caller, "POST", "/prospects/suppress", body));
}

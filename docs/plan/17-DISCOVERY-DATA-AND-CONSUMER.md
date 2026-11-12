# Discovery build spec for Claude Code

2026-11-11 · @Kunal

## How to use this spec

This is the implementation contract for two repos. Part A is built in `luvchakra/wonder-jobs` (WonderWorks) by its shared-layer session. Part B is built in `luvchakra/wonder-ark` (WonderArk). Save this file in both repos before starting:

- `wonder-jobs`: `docs/PROSPECT_DATA_API.md`
- `wonder-ark`: `docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md`

Each repo's own `CLAUDE.md` wins over this file wherever they disagree. A session builds only the work package it is given, reads the real code before changing it, and reports anything in this spec that does not match the repo.

### Decisions locked by the owner on 11 Nov 2026

1. **WonderArk may read WorksLake.** WonderArk becomes the first outside consumer of the gateway.
2. **All data work happens in WonderWorks.** Collection, storage, provider calls (Apollo, Hunter, Google Places, government data), enrichment and contact finding all run in WonderWorks. WonderArk holds no provider keys and calls no data provider. It has exactly one connector: the WorksLake gateway.
3. **Consumer discovery ships this week.** The Discovery module must work for offerings sold to consumers as well as to companies.

### What decision 2 changes from the earlier plan

The earlier plan had each WonderArk business bring its own provider keys. That is withdrawn. Provider keys are now platform keys held in WonderWorks, so three things become WonderWorks's job: paying for provider usage, enforcing a quota per WonderArk business, and holding the terms record for each provider. Section "Terms-pending register" lists what the owner still has to confirm.

## Architecture

WonderArk asks; WonderWorks finds. WonderArk sends a search, an enrichment request or a contact request to the WorksLake gateway and stores only what comes back, inside the requesting workspace.

```text
WonderArk (wonder-ark)                     WonderWorks (wonder-jobs)
Discovery module                           WorksLake gateway, /v1

 Find page ------> gateway client --HTTPS--> POST /v1/prospects/search
                                              |- stored datasets: businesses, channels
                                              |- live official APIs: Google Places, Apollo,
                                              |   YouTube, Podcast Index (platform keys)
 Approve --------> gateway client ---------> POST /v1/prospects/enrich
                                              |- waterfall: company directory, Wikidata,
                                              |   stored datasets, the company's own site, Apollo
 Find contacts --> gateway client ---------> POST /v1/prospects/contacts
                                              |- live lookups: Hunter, Apollo. Never stored in the lake
 Signals --------> gateway client ---------> POST /v1/prospects/signals   (hiring counts)
 Source list ----> gateway client ---------> GET  /v1/prospects/sources

 suggestions -> review -> prospects         collectors on the GitHub runner:
 -> outreach -> results (unchanged)          OpenStreetMap, Overture, Foursquare, data.gov.in
                                            platform keys, per-tenant quotas, usage ledger,
                                            terms register, owner decisions
```

Rules that follow from this split:

- WonderArk never holds a provider key and never calls a provider. A repo-wide check enforces it (B8).
- WonderWorks never stores a WonderArk tenant's prospects, approvals or messages. It sees an opaque tenant id for quotas and usage only.
- Named people are never collected into WorksLake. A contact lookup is a live call made for one tenant, and the result is stored only in that tenant's WonderArk workspace. This keeps the WonderWorks rule "never collect private individuals' personal profiles".
- Everything returned carries its source, its attribution text and a link back, so WonderArk can show provenance as both repos' rules require.

## Shared contract: the prospect data API

Both repos build against this contract. WonderWorks serves it; WonderArk consumes it. If a session needs to change a shape, it changes this section in the same pull request and says so, because the other repo depends on it.

### Conventions

- Base: the existing gateway root, `/v1`, served by the WonderWorks app. New routes live under `/v1/prospects/`. Existing routes and their behaviour do not change.
- Auth: `Authorization: Bearer <key>`, as today. The WonderArk key belongs to consumer `wonderark`.
- Scopes (new): `read:businesses`, `read:channels`, `read:signals`, `lookup:enrich`, `lookup:contacts`. A key without the scope gets 403.
- Tenant: every request carries `X-Tenant-Id`, an opaque id of the WonderArk business (its `business_id`). WonderWorks uses it only for quotas and usage. Missing header: 400 `TENANT_REQUIRED`.
- Errors: the gateway's existing shape, `{ "error": { "code": "...", "message": "..." } }`. New codes: `TENANT_REQUIRED` (400), `QUOTA_EXCEEDED` (429, with `Retry-After`), `PROVIDER_NEEDS_SETUP` (503), `PROVIDER_UNAVAILABLE` (502).
- Paging: the existing signed opaque cursor. Page size at most 50 on these routes.
- Every item carries `source` and, where a field came from a different source, `provenance`. Missing values are `null`, never guessed.

### POST /v1/prospects/search

Finds organisations (`kind: "business"`) or audience channels (`kind: "channel"`).

```json
{
  "kind": "business",
  "query": "electrician",
  "filters": {
    "categories": ["electrician", "hvac"],
    "industries": [],
    "employeeRanges": [],
    "hasWebsite": true,
    "channelTypes": [],
    "minAudience": null,
    "languages": []
  },
  "locations": [{ "text": "Pune", "country": "IN", "lat": null, "lon": null, "radiusKm": null }],
  "providers": ["stored"],
  "limit": 25,
  "cursor": null
}
```

`providers` is a list of ids from `GET /v1/prospects/sources`. `"stored"` means every stored dataset the key may read, and is the default. A live provider is called only when named. Response:

```json
{
  "requestId": "req_...",
  "kind": "business",
  "results": [
    {
      "id": "businesses_3f9a...",
      "kind": "business",
      "name": "Shree Electricals",
      "domain": "shree-electricals.example",
      "website": "https://shree-electricals.example",
      "phone": null,
      "email": null,
      "categories": ["electrician"],
      "industry": null,
      "employeeRange": null,
      "description": null,
      "location": { "text": "Kothrud, Pune", "city": "Pune", "region": null, "country": "IN", "postcode": "411038", "lat": 18.5, "lon": 73.8 },
      "signals": { "openJobs": null, "newJobs7d": null },
      "source": { "id": "src_...", "provider": "stored", "name": "OpenStreetMap contributors (ODbL)", "url": "https://www.openstreetmap.org/node/123", "termsPending": false },
      "observedAt": "2026-11-09T02:23:00Z",
      "provenance": {}
    }
  ],
  "nextCursor": null,
  "metadata": { "matched": 1, "providers": [{ "id": "stored", "status": "ok", "returned": 1 }], "asOf": "2026-11-11T13:00:00Z" },
  "usage": { "unitsSpent": 0, "tenantRemaining": { "search": 480, "paid": 50 } }
}
```

`email` and `phone` on a business are the organisation's own published contact points (a shop number, an `info@` mailbox), never a named person's. A provider that fails does not fail the request: it appears in `metadata.providers` with `status` `needs_setup`, `unavailable` or `quota`, and the other providers' results are still returned.

A channel result has the same envelope and these fields in place of the business ones:

```json
{
  "id": "channels_81bc...",
  "kind": "channel",
  "channelType": "youtube_channel",
  "name": "Example Home Organising",
  "url": "https://www.youtube.com/@example",
  "topics": ["home organisation", "family routines"],
  "audience": { "value": 120000, "unit": "subscribers", "asOf": "2026-11-10" },
  "language": "en",
  "location": { "text": null, "country": "IN" },
  "contactUrl": null,
  "description": "...",
  "source": { "id": "youtube", "provider": "youtube", "name": "YouTube Data API", "url": "https://www.youtube.com/@example", "termsPending": true },
  "observedAt": "2026-11-11T13:00:00Z"
}
```

`channelType` is one of `youtube_channel`, `podcast`, `community`, `newsletter`, `forum`, `publication`, `event`, `organisation`. A channel is a named public outlet or gathering place. It is never a private person's profile, and it carries no personal email.

### POST /v1/prospects/enrich

Fills blanks for one organisation. Request: `{ "domain": "acme.example", "name": "Acme", "location": "Pune", "fields": ["industry", "employeeRange", "description", "phone", "email", "linkedinUrl", "hq"], "allowPaid": false }`. At least one of `domain` or `name` is required. Response:

```json
{
  "requestId": "req_...",
  "domain": "acme.example",
  "fields": {
    "industry": { "value": "Software", "source": { "provider": "wikidata", "name": "Wikidata", "url": "https://www.wikidata.org/wiki/Q1" }, "observedAt": "2026-10-30T00:00:00Z" },
    "employeeRange": null
  },
  "usage": { "unitsSpent": 0, "tenantRemaining": { "search": 480, "paid": 50 } }
}
```

A field the waterfall could not fill is `null`. With `allowPaid: false`, paid providers are skipped.

### POST /v1/prospects/contacts

Finds people to write to at one organisation. Request: `{ "domain": "acme.example", "roles": ["Head of Identity", "CISO"], "limit": 3, "verify": true }`. Response:

```json
{
  "requestId": "req_...",
  "domain": "acme.example",
  "contacts": [
    { "firstName": "A", "lastName": "B", "title": "Head of Identity", "email": "a.b@acme.example", "emailStatus": "verified", "linkedinUrl": null, "source": { "provider": "hunter", "name": "Hunter", "retrievedAt": "2026-11-11T13:00:00Z", "termsPending": true } }
  ],
  "generic": [{ "email": "info@acme.example", "emailStatus": "unverified", "source": { "provider": "site", "name": "acme.example", "url": "https://acme.example/contact" } }],
  "usage": { "unitsSpent": 4, "tenantRemaining": { "search": 480, "paid": 46 } }
}
```

`emailStatus` is `verified`, `risky`, `invalid` or `unverified`. This route always spends paid units, so WonderArk calls it only on an explicit user action.

### POST /v1/prospects/signals

Companies showing a buying signal. Version 1 has one signal, hiring. Request: `{ "signal": "hiring", "keywords": ["identity governance", "Saviynt", "SailPoint"], "locations": [{ "country": "IN" }], "sinceDays": 30, "limit": 25, "cursor": null }`. Each result is a business item whose `signals` holds `{ "openJobs": 4, "newJobs7d": 1, "matched": 2, "matchedTitles": ["IAM Engineer", "Identity Governance Lead"] }`. No posting text, apply link or poster is returned.

### GET /v1/prospects/sources

What this key can use right now. WonderArk builds its source picker from this and nothing else.

```json
{
  "sources": [
    { "id": "stored", "label": "WorksLake business data", "kinds": ["business", "channel"], "status": "active", "paid": false, "coverage": ["IN"], "attribution": "OpenStreetMap contributors (ODbL); Overture Maps Foundation" },
    { "id": "google_places", "label": "Google Places", "kinds": ["business"], "status": "needs_setup", "paid": true, "coverage": ["global"], "attribution": "Google" }
  ],
  "quota": { "period": "month", "search": { "limit": 500, "remaining": 480 }, "paid": { "limit": 50, "remaining": 50 } }
}
```

`status` is `active`, `needs_setup`, `paused` or `unavailable`.

### POST /v1/prospects/suppress

Removal requests. Request: `{ "emails": ["a.b@acme.example"], "domains": [] }`. WonderWorks keeps a hashed suppression list and drops matching people from every later `contacts` response for every tenant. Returns `{ "accepted": 1 }`.

## Part A: WonderWorks (repo `wonder-jobs`)

Part A turns the gateway into the prospect data service described in the contract. It is shared-layer work: the gateway (`apps/data-gateway`, `apps/web/src/server/gateway`), WorksLake core and the admin belong to the shared-layer session.

### Guardrails for every Part A package

- **No regression.** The nine existing datasets, `POST /v1/search`, the `/v1/workslake/:module/listings` compatibility route, source ids, the warm pool and every candidate-facing screen behave exactly as before. The `workslake` consumer's results do not change.
- **Strict separation.** `businesses` and `channels` never appear in a WonderWorks module's search, and the nine modules never appear in a `/v1/prospects/` response unless a source is explicitly bound to both.
- **Follow the repo's source rules.** Each new source or provider gets its permission evidence, a row in `docs/EXTERNAL_DATA_SOURCES.md`, and "terms pending: ..." where terms are not confirmed. A provider that needs a key is registered in `server/jobslake/platformKeys.ts` and shows "Needs setup" until the owner sets it on Admin, Keys. Anything waiting on the owner becomes a line in `server/jobslake/decisions.ts::OWNER_DECISIONS` in the same pull request.
- **No personal profiles in the lake.** Stored datasets hold organisations and public outlets only. People returned by `contacts` are never written to `gateway_listings` or any WorksLake table. The usage ledger records counts, not names or emails.
- **Technical barriers are final.** No login, paywall, CAPTCHA, IP block or rate limit is bypassed. Robots rules are honoured for crawled pages.
- **Fetching the open web** (the company's own site in `enrich`) goes through the existing SSRF check in `domain/jobslake/ssrf.ts`, with byte, redirect and time limits.
- **The gateway keeps no third-party runtime dependencies.** Collection scripts on the GitHub runner may use extra tools; the app and gateway code may not add them without the owner's say.
- **Repo process.** Tracker ids from the shared-layer range, one change note per change in `docs/changes/`, one open pull request at a time, `npm run gateway:check` and the affected web tests green before merge.

### A1. Outside consumer, scopes, tenants and quotas

Goal: a `wonderark` key works, is limited to prospect routes, and is metered per WonderArk business.

1. Allow outside consumers in the hosted gateway. Today `issueKey` in `core.mjs` refuses any consumer other than `workslake` unless `GATEWAY_ALLOW_EXTERNAL_CONSUMERS` is `1`. Make this an admin setting in line with the repo's move away from deployment variables, default off, and turn it on.
2. Extend scope validation, which today accepts only `read:<module>`, to accept the five new scopes in the contract. A `wonderark` key is issued with those five and none of the nine module scopes.
3. Require `X-Tenant-Id` on `/v1/prospects/` routes. Add the tenant to the usage record (`day, consumerId, keyId, tenant, route, units, results`).
4. Quotas: per tenant per calendar month, two buckets. `search` counts free requests (stored datasets and free APIs). `paid` counts units spent on paid providers. Limits are admin settings with defaults of 500 and 50. Over the limit returns 429 `QUOTA_EXCEEDED`. The existing per-key rate limit stays.
5. A platform-wide monthly cap on paid units across all tenants, so one provider bill cannot run away. Reaching it marks paid providers `quota` in `metadata.providers`.
6. Mark the five `osm-services-*` sources `externalRedistributionAllowed: true` (owner approved, 11 Nov 2026) and record that approval in their permission evidence. A registered source keeps the definition it was added with, so update the stored source as well as its file. Leave every other source's flag as it is.

Done when: a `wonderark` key returns 403 on `POST /v1/search` for `jobs`; the same key with a tenant header gets results from `/v1/prospects/search`; the 501st search in a month for one tenant returns 429 while another tenant still succeeds; `workslake` behaviour is unchanged in the existing gateway tests.

### A2. Datasets `businesses` and `channels`

Goal: two new stored datasets that only prospect routes can read.

1. Add `businesses` and `channels` as gateway datasets. Read `core.mjs` first and choose the smaller change: new entries in `MODULES` that are excluded from every WonderWorks module list, admin module card and the compatibility route, or a separate `PROSPECT_DATASETS` list handled beside it. Either way the listings table, source registry, test, activate and pause flow are reused.
2. A source may bind to more than one dataset. Bind the `osm-services-*`, Houzz and other organisation sources to `businesses` as well as their current module, each binding explicit in the source definition.
3. Normalise a stored listing into the contract's business shape: `organization` or `title` to `name`; `organizationDomain` to `domain`; `attributes.website`, `attributes.phone`; `attributes.craft` or the source's category to `categories`; `location` plus `attributes.city`, `suburb`, `postcode`, `lat`, `lon`.
4. Search filters: `categories` (exact match on normalised tags), `hasWebsite`, text `query` (existing word match), `locations` (existing text match; add radius match when `lat`, `lon` and `radiusKm` are given and the row has coordinates).
5. Deduplicate at read time across sources: same `domain`; otherwise same normalised name and postcode. Keep the richest record and list the others' sources in `provenance`.
6. Check the listings table's indexes before loading more data. Word search uses `ilike` on `search_text` with an exact count. Add a trigram index, and replace the exact count with a capped count on prospect routes if query time exceeds one second at the planned volume.

Done when: `POST /v1/prospects/search` with `kind: "business"`, `categories: ["electrician"]` and Pune returns OpenStreetMap businesses in the contract shape with attribution; the same businesses still appear in Talent & Services exactly as before; no `businesses` row is reachable from `/v1/search` or the compatibility route.

### A3. Live providers behind `search`

Goal: official APIs that add coverage when the caller names them.

| Provider id | Kind | Call | Key in `platformKeys.ts` | Paid | Units |
| --- | --- | --- | --- | --- | --- |
| `google_places` | business | Places API (New) Text Search with a field mask limited to name, address, location, website, phone, types | `GOOGLE_PLACES_API_KEY` | Yes | 1 per page |
| `apollo` | business | Organisation search by industry, size, location, keywords | `APOLLO_API_KEY` | Yes | 1 per page |
| `data_gov_in` | business | Company master data resource, filtered by state, status and industry code | `DATA_GOV_IN_API_KEY` | No | 0 |
| `youtube` | channel | Channel search by keyword and region, then channel statistics | `YOUTUBE_API_KEY` | No | 0 |
| `podcast_index` | channel | Podcast search by term | `PODCAST_INDEX_KEY`, `PODCAST_INDEX_SECRET` | No | 0 |

1. One adapter file per provider behind a common interface: `search(plan) -> { items, next }`, `status()`. An adapter without its key reports `needs_setup`; a failed call reports `unavailable`. Neither throws past the route.
2. Live results are mapped to the contract shape and returned. They are not written to the listings table.
3. A response cache per provider, keyed by the request hash, with a per-provider lifetime that is an admin setting. Defaults: `google_places` 0 (no cache) until the owner confirms its terms; others 24 hours.
4. Timeouts of 8 seconds per provider, run in parallel, results merged after the stored results and deduplicated by the A2 rule.
5. Before writing each adapter, read the provider's current API reference and terms. This spec's parameter names are from memory and may be out of date. Record what the terms say about storage, display and passing results to another product in the provider's row in `docs/EXTERNAL_DATA_SOURCES.md`.

Done when: with no keys set, `GET /v1/prospects/sources` lists each provider as `needs_setup` and `search` still returns stored results; with a key set, naming the provider adds its results with correct attribution and spends the stated units.

### A4. `enrich`, `contacts`, `suppress`

Goal: fill an organisation's blanks from the cheapest source first, and find people only on request.

`enrich` waterfall, per field, stopping at the first value:

1. WorksLake's company directory (`server/jobslake/companies.ts`): reported facts, then Wikidata facts.
2. Stored `businesses` rows with the same domain.
3. The organisation's own website: the home page and one contact or about page, read for schema.org `Organization` or `LocalBusiness` data, a published phone and a generic mailbox. Robots honoured, SSRF check applied, two pages at most.
4. Apollo organisation enrichment, only when `allowPaid` is true.

Each filled field returns its source and observation date. Results may be cached by domain for 30 days, except values from paid providers, which follow that provider's cache setting.

`contacts`:

1. Generic mailboxes from step 3 above, free.
2. Hunter domain search for named people, filtered to the requested roles.
3. Apollo people search by title when Hunter returns fewer than `limit`.
4. When `verify` is true, pass each email through Hunter's verifier and set `emailStatus`.
5. Drop anyone on the suppression list. Return nothing about them, including that they were dropped.
6. Write no person to any WorksLake table or log. The usage ledger records the tenant, route, units and count only.

`suppress` stores a salted hash of each email and each domain. Add an owner decision for who may call it and how a person outside WonderArk asks to be removed.

Done when: `enrich` for a domain already in the company directory returns directory and Wikidata values at zero units; `contacts` without a Hunter or Apollo key returns generic mailboxes only and reports the providers as `needs_setup`; a suppressed email never appears again for any tenant; a test proves no contact field reaches storage or logs.

### A5. Open-data collection into `businesses`

Goal: enough stored organisations in India that a stored search is useful without any paid call.

1. **Overture Maps Places** and **Foursquare Open Source Places.** Both publish bulk Parquet files under permissive licences. Add a collection script beside `apps/data-gateway/scripts/osm-collect.mjs`, run by a GitHub workflow monthly and on demand. It reads the latest release, keeps rows for the configured countries (start with `IN`) and a category allowlist, drops rows with neither website nor phone, and delivers batches to the app's existing ingest route.
2. Category allowlist, version 1, in a config file the owner can edit: trades and field services (electrician, plumber, HVAC, carpenter, painter, appliance repair, pest control, cleaning), retail and wholesale, manufacturing and workshops, professional services (accounting, legal, consulting, agencies), clinics, education (schools, colleges, coaching centres), fitness and community places (gyms, clubs, community centres, coworking spaces).
3. A row cap per source per country, an admin setting, default 300,000, so storage and query time stay known. Log how many rows were dropped by the cap.
4. Map each row to the stored listing shape with its own stable id, source attribution and the release date as `observedAt`. Retention matches the refresh interval plus a margin.
5. Register both as sources with permission evidence quoting their licences, `externalRedistributionAllowed: true`, bound to `businesses` only.
6. `data_gov_in` stays a live provider (A3). Do not bulk-load it this week.

Done when: after one run, a stored search for a category in three Indian cities returns results from at least two sources with duplicates merged, and the admin shows row counts per source.

### A6. Channels for consumer discovery

Goal: `kind: "channel"` returns public outlets and gathering places where an offering's consumers already are.

1. Live providers `youtube` and `podcast_index` from A3 serve online channels.
2. Bind WorksLake's existing `events` sources to `channels` as `channelType: "event"`, where each source's flag allows outside use. Do not change those sources' behaviour in Events.
3. Gathering places come from `businesses` with a category group. Add a `filters.categoryGroup` value `gathering_places` covering schools, colleges, coaching centres, gyms, clubs, community centres and coworking spaces. WonderArk asks for it when the audience is consumers.
4. `community`, `newsletter`, `forum` and `publication` types need sources. Research and add what has an official API or an open feed. Candidates to check, none verified for this spec: Reddit's subreddit search (its API terms restrict commercial use, so expect terms pending), Stack Exchange sites, Hacker News search, newsletter and blog directories with feeds. Record every source considered, including the ones refused, in `docs/EXTERNAL_DATA_SOURCES.md`.
5. Out of reach and to be recorded as such: Facebook groups, Instagram, WhatsApp and Telegram groups, LinkedIn. They need a login or forbid collection.
6. A channel record holds the outlet's public name, link, topic tags, audience size where the API states it, language and country. It holds no personal email and no private person's profile. A solo creator's public channel counts as an outlet; add an owner decision confirming that reading.

Done when: `kind: "channel"` with a topic query returns YouTube channels and podcasts with audience sizes when keys are set, events from stored data without keys, and each result carries its source and `termsPending` flag.

### A7. Hiring signals

Goal: `POST /v1/prospects/signals` returns companies hiring for given keywords.

1. Find where WorksLake keeps recent postings per company. The company directory already holds `openJobs` and `newJobs7d` per domain, refreshed daily. Matching by keyword needs posting titles: use the store the daily refresh reads, or the gateway's `jobs` listings, whichever holds titles with a company domain.
2. Return per company: the business shape from the directory, plus counts and up to five distinct matched titles. Never return descriptions, apply links, salaries or the source of an individual posting.
3. Add an owner decision: "Hiring signals use job titles from sources reviewed for WonderWorks only". Until it is confirmed, mark results `termsPending: true`.

Done when: a keyword query returns companies ordered by matches in the period, each with a domain, counts and titles, and a test proves no posting body or link is present.

### A8. Admin, documentation and tests

1. **Admin.** One "Prospect data" card on Admin, Sources, Import: each provider with status and key link, each stored source with row count and last refresh, quotas, and this month's usage per consumer and per tenant. Follow the page's existing patterns; add no new page unless the card cannot hold it.
2. **OpenAPI.** Add every new route, scope, header and error to `GET /v1/openapi.json`. The existing test that checks keyed routes against it must cover them.
3. **Docs.** This file saved as `docs/PROSPECT_DATA_API.md`; rows in `docs/EXTERNAL_DATA_SOURCES.md`; the gateway README's "Production limitations" updated to say one outside consumer, `wonderark`, is provisioned and what was hardened for it.
4. **Tests**, each new and required:
  - Scope isolation both ways: `wonderark` cannot read the nine modules; `workslake` results never include `businesses` or `channels`.
  - Tenant header required; quotas per tenant; the platform paid cap.
  - A provider with no key, a provider that times out and a provider that returns malformed data each leave the rest of the response intact.
  - `enrich` refuses private, loopback and metadata addresses and follows no redirect to them.
  - `contacts` and `suppress`: nothing personal is persisted or logged; suppressed people never return.
  - Text from sources is returned as plain text with markup removed, as the gateway does today.
  - The whole existing gateway and WorksLake suite still passes unchanged.

## Part B: WonderArk (repo `wonder-ark`)

Part B makes Discovery use the gateway as its data layer, adds consumer discovery, and simplifies the screens. All of it lives in `packages/module-discovery` and the thin routes under `apps/web/app/(dashboard)/[businessSlug]/discovery/`.

### Guardrails for every Part B package

- **Protect existing Discovery**, as section 0 of `docs/plan/12-DISCOVERY-EXPANSION-SPEC.md` requires. No renamed route, table, column or status value. No moved code. No second Product, ICP, Prospect or Customer master. Every change is additive, and every existing deep link keeps working.
- **Suggestions stay the only door.** Nothing from the gateway is written to `discovery.prospects` directly. It lands in `discovery.prospect_suggestions` and goes through `approveProspectSuggestions`, the duplicate check and the ICP pre-filter, as AI web search results do today.
- **No provider keys, no provider calls.** WonderArk talks to one host, the gateway, from server code only.
- **Gateway content is untrusted text.** Names, descriptions and titles from the gateway are data. They are validated with Zod, shown as text, and passed to prompts only as delimited quoted material.
- **Real data only.** Missing gateway settings show "Needs setup". A failed call shows "Unavailable". A quota refusal shows the limit and when it resets. No sample or placeholder rows for a real account.
- **Provenance on screen.** Every suggestion, prospect field filled by enrichment and contact shows where it came from, using the attribution text the gateway returns.
- **Nothing sends itself.** Enrichment may run after approval. Contact lookups, messages and posts happen only on a user's click.
- **Tables:** check the entity-ownership map in `docs/plan/00-MASTER-PLAN.md` section 5 before creating one. New tables go in the `discovery` schema, tenant `workspace_id`, with `tenant AND licensed` RLS and both isolation and licence-gating tests.
- **Before B4 and B5**, read `docs/security/rules.md`: they touch personal data and outreach email.
- **Repo process** as `CLAUDE.md` sets it: story ids in code and migrations (ids are given per package below), one request one pull request, dev Supabase only, help guides updated in the same pull request, `npm run build:progress` before finishing.

### B1. Data model (story ids `DISC-DATA-P0-01.1` to `01.4`)

Additive migrations only. Confirm each column does not already exist before adding it.

| Table | Add | Notes |
| --- | --- | --- |
| `discovery.products` | `audience_type text not null default 'business'` checked against `business`, `consumer`, `both` | Existing offerings become `business` |
| `discovery.prospect_suggestions` | `kind text not null default 'company'` (`company`, `channel`); `source text`; `source_name text`; `source_ref text`; `external_id text`; `payload jsonb` | Unique on `(workspace_id, source, external_id)` where `external_id` is not null. Existing AI rows get `source = 'web_search'` |
| `discovery.prospects` | `kind` as above; `source`, `source_name`, `source_ref`; `phone text`; `channel_type text`; `audience_size integer`; `field_sources jsonb not null default '{}'` | `company_name` holds a channel's name when `kind = 'channel'` |
| `discovery.contacts` | `email_status text` (`verified`, `risky`, `invalid`, `unverified`); `source text`; `source_retrieved_at timestamptz` | Hand-entered contacts stay null |
| `discovery.saved_searches` (new) | `id, workspace_id, kind, request jsonb, enabled, last_run_at, next_run_at, last_result jsonb, created_at` | One per offering in version 1 |

`payload` stores the validated gateway item so approval can copy fields without a second call. `field_sources` maps a prospect column to `{ provider, name, url, observedAt }`.

Done when: migrations apply on the dev project, existing Discovery tests pass untouched, and new isolation and licence tests cover `saved_searches`.

### B2. Gateway client and source layer (`DISC-DATA-P0-02.1` to `02.3`)

1. `packages/module-discovery/src/lib/data-sources/workslake-client.ts`, server-only. Reads `WORKSLAKE_GATEWAY_URL` and `WORKSLAKE_GATEWAY_API_KEY`; add both names to `apps/web/.env.example`. Sends `X-Tenant-Id` with the business id resolved on the server, never one supplied by the browser.
2. One function per contract route: `searchProspects`, `enrichOrganisation`, `findContacts`, `hiringSignals`, `listSources`, `suppress`. Each validates the response with Zod schemas that mirror the contract, with a 12-second timeout and no automatic retry on a POST that spends units.
3. A typed result, not exceptions, for the expected failures: `needs_setup` (settings missing or 503 `PROVIDER_NEEDS_SETUP`), `unavailable` (timeout, 5xx, bad shape), `quota` (429, with reset time), `forbidden` (401 or 403).
4. `lib/data-sources/index.ts` exposes one list of sources to the UI: the gateway's sources from `listSources`, plus two local ones that already exist, `web_search` (the current `discoverProspects`) and `file_import`.
5. Every gateway call passes the existing usage check in `lib/usage/limits.ts` first and is recorded in the run history with source, result count and units spent, so History and Usage show gateway runs beside AI runs.
6. Tests use recorded fixtures built from the contract's examples. Fixtures live under the test folder and are never imported by product code.

Done when: with no settings, the source list shows the gateway as "Needs setup" and web search and import still work; with settings, `listSources` drives the list; each failure type has a test.

### B3. Find (`DISC-DATA-P0-03.1` to `03.3`)

One Find screen at the existing `prospects/discover` route replaces today's single-source search form.

1. Controls, in this order and no others above the fold: what (keywords or categories, prefilled from the approved ICP's industries), where (prefilled from its geographies), source (a single select from B2's list, defaulting to WorksLake business data), and one primary button, Find. Size and other filters sit in a collapsed "More filters".
2. For a paid source the button shows the cost before the click, for example "Find (uses 1 of 50 paid lookups)", from the quota the gateway returns.
3. Results go into `prospect_suggestions` with `source`, `source_name`, `source_ref`, `external_id` and `payload`. Rows that fail the ICP pre-filter or match an existing prospect are not inserted; the run summary says how many were skipped and why.
4. The review list ("To review") shows each suggestion's name, place, category, one match reason and a source badge, with Approve and Discard. On phones it is cards, not a table.
5. A second entry point, "Companies hiring for...", calls `hiringSignals` with keywords prefilled from the ICP's buying signals and existing tools. It appears only when the gateway lists the signal as available.
6. The existing web search stays available as the source "Web search (AI)" and behaves as it does now, including its lock and cost cap.
7. Count the controls on the page before and after, as `CLAUDE.md` requires. The number must go down.

Done when: choosing WorksLake business data, "electrician" and Pune adds reviewable suggestions with an OpenStreetMap badge; approving one creates a prospect carrying the same source; running the same search twice adds no duplicates.

### B4. Enrichment and contacts (`DISC-DATA-P0-04.1` to `04.3`)

1. **Enrich on approval.** Approving a company suggestion queues one enrichment job through the existing domain-events drain. The job calls `enrichOrganisation` with `allowPaid: false`, fills only columns that are empty, never overwrites a value a person typed, and records each filled column in `field_sources`. A failed job leaves the prospect as it was and shows "Enrichment unavailable" with a Retry action on the prospect page.
2. **Fill more (paid).** One action on the prospect page, "Fill missing details", repeats the call with `allowPaid: true` and shows the units it will spend.
3. **Find contacts.** One action on the prospect page. It asks for up to three people in the roles from the approved ICP, with `verify: true`. Each returned person becomes a `discovery.contacts` row with `email_status`, `source` and `source_retrieved_at`. Generic mailboxes fill `prospects.company_email` when it is empty.
4. **Sending rules.** A draft to an address marked `invalid` cannot be sent. A draft to `risky` or `unverified` asks for one confirmation. The existing unsubscribe handling in `lib/messages/send.ts` is unchanged.
5. **Removal.** Deleting a contact because the person asked to be removed also calls `suppress`, so the gateway never returns them again. Offer this as a distinct choice in the delete dialog: "They asked not to be contacted".
6. Show the source beside every enriched field and contact: "Industry: Software, from Wikidata".

Done when: approving a company with a known domain fills blank fields within a minute and shows each field's source; "Find contacts" adds people with a verification mark and spends paid units once, even if clicked twice; a suppressed person does not return on a later lookup.

### B5. Consumer discovery (`DISC-CONS-P0-01.1` to `05.2`)

Consumer discovery finds where an offering's users gather and collects people who choose to sign up. It never builds lists of private individuals. Three parts: channels to reach, people who opted in, and what those people say.

**B5.1 Audience type and ideal user**

1. Offering setup asks one question, "Who buys this?", with Companies, Consumers or Both. It writes `products.audience_type`. Where the website onboarding already produced a profile, preselect the answer from it and let the user confirm.
2. For `consumer` and `both`, the ICP step produces an "Ideal user" as well: who they are (life stage, household or work situation), what they are trying to get done, what triggers the need, what they use today, where they spend time online and offline, and words they use. Store it on the existing ICP record in a new `audience jsonb` column beside the company fields, with the same draft, approve and version flow. Add a prompt `generate_consumer_icp_v1` under `src/prompts/`, called through the existing AI layer, cached in `core.ai_runs`.
3. `discovery.offering_feedback.field_name` is a closed list of the fourteen company ICP fields. Extend the check and its hand-kept twin `ICP_CONTENT_FIELDS` with the consumer fields, in one migration.
4. Every screen that says "company" for a consumer offering uses "channel" or "person" as fits. Drive wording from `audience_type`; do not fork pages.

**B5.2 Find channels**

1. For `consumer`, Find's default source search is `kind: "channel"`, with topics prefilled from the Ideal user's interests and places. A second choice, "Places they gather", sends `kind: "business"` with `filters.categoryGroup: "gathering_places"`. For `both`, a toggle switches between Companies and Channels.
2. Channel suggestions show name, type, audience size with its date, topics, one match reason and the source badge. Approving creates a prospect with `kind = 'channel'`, `channel_type` and `audience_size`.
3. A channel prospect's page offers three drafts through the existing message generation, each a new prompt variant: a partnership or feature pitch to the channel's owner, a sponsorship or listing enquiry, and a community post the user publishes themselves. The post draft is saved in the existing `discovery.marketing_content` tables, not a new table, and is labelled AI-generated.
4. WonderArk never posts to a community, group or channel. The post draft has a Copy action and a "Mark as posted" action with the link the user pastes back. Say so in the help guide.
5. Pipeline stages for a channel reuse the existing statuses and outcome. Label `won` as "Live" for channels.

**B5.3 Waitlist: people who opt in**

1. New table `discovery.audience_leads` after checking the ownership map: `id, workspace_id, email, name, answers jsonb, consent_text, consent_at, source` (`waitlist`, `import`, `manual`), `referrer_lead_id, utm jsonb, status` (`new`, `contacted`, `interviewed`, `active`, `unsubscribed`), `party_id, tags text[], created_at`. Unique on `(workspace_id, lower(email))`. Do not reuse `discovery.interest_signups`; that table is WonderArk's own pre-account landing list and has no tenant.
2. A public sign-up page per offering, following the existing public token routes under `apps/web/app/p/`: offering name, one line of value, email, optional name, up to two questions the owner writes, a consent line the owner can edit, and a Join button. It writes through a server action with the service role, like `interest_signups`, after validating the token.
3. Abuse controls: a honeypot field, a per-address and per-token rate limit, email format and length checks, and no reflection of whether an email already exists.
4. Each lead gets a personal referral link. A sign-up through it sets `referrer_lead_id`. Results show referrals per lead.
5. A confirmation email goes out through the existing send path with an unsubscribe link. Unsubscribing sets `status = 'unsubscribed'` and blocks every later send.
6. Import: the existing file import accepts a people list for a consumer offering. The importer must confirm "These people agreed to hear from me" before rows are saved, and the confirmation text is stored as `consent_text`.
7. On first contact, sync the lead to `core.parties` with `kind = 'person'`, following `lib/prospects/party-sync.ts`.
8. The sign-up page shows "Powered by WonderArk" and a privacy line naming the business as the party collecting the data. Marketing copy says "DPDP-ready" at most, per `CLAUDE.md`.

**B5.4 Feedback**

1. New table `discovery.audience_feedback`, append-only like `prospect_feedback`: `id, workspace_id, lead_id null, prospect_id null, kind` (`interview`, `survey`, `comment`), `body, tags text[], created_at`. One of `lead_id` or `prospect_id` is required.
2. On a lead: "Log a conversation" (free text and tags) and "Send questions" (a short survey by email, using the answers format from the sign-up page).
3. "What people say": an AI summary of themes across feedback for the offering, with each theme linking to the entries behind it. Feedback text is quoted material in the prompt. The summary is labelled AI-generated and cached by input hash.
4. Corrections flow back: from a theme, "Update Ideal user" opens the ICP with a suggested edit the user accepts or rejects. Nothing changes the ICP on its own.

**B5.5 People in the Prospects tab**

For a consumer offering the Prospects tab has two lists, Channels and People. People lists `audience_leads` with status, tags, source and referral count, as cards on phones. Messaging a person uses the existing send path and is allowed only when `consent_at` is set and status is not `unsubscribed`.

Done when, for a consumer offering: setup yields an approved Ideal user; Find returns channel suggestions from the gateway and approves them as channel prospects; a pitch and a post draft can be generated and the post is never sent by the system; the public page records a lead with consent and a working referral link; an unsubscribed lead cannot be messaged; logged feedback produces a themes summary with links to its entries; isolation and licence tests cover both new tables, and a test proves the public page cannot write to another workspace.

### B6. Navigation and the Today list (`DISC-NAV-P0-01.1` to `01.3`)

Interface only. No route, table or status changes.

1. In `components/tenancy/product-nav.tsx`, replace the nine ongoing tabs with four. Every existing page stays at its current path and is reached from its new parent.

| Tab | Lands on | Also holds |
| --- | --- | --- |
| Setup | Overview | ICP and Ideal user, personas |
| Find | `prospects/discover` | To review, Import, History |
| Prospects | `prospects` | Opportunities and Watchlist as saved filters above the list; People for consumer offerings |
| Results | Performance | Conversions, Usage, "What people say" |

1. The staged setup tabs shown before an offering's overview is complete keep their current behaviour.
2. A Today list at the top of Prospects, built only from existing data: replies waiting for an answer, follow-ups due, suggestions waiting for review, and new sign-ups for consumer offerings. Each row has one action that opens the right page. An empty list says so in one line.
3. Labels: "ICP" becomes "Ideal customer"; the Discovery tab becomes "Find"; "Prospect suggestions" becomes "To review". Update `docs/user-guides/` and `packages/core/src/help/faq.ts`, then `npm run build:help`.
4. Sidebar: Marketing and Funding are unchanged.
5. Follow `docs/design/claude-ui-design-rules.md` and `docs/DESIGN.md`. Record the visible control count per changed page before and after in the pull request; each must go down.

Done when: apps/web/`tests/menu-routes.test.ts` passes; every one of the 15 offering pages still opens from a link in the new nav; the Today list's counts match the underlying lists in a test.

### B7. Saved searches (`DISC-DATA-P0-05.1`)

1. On Find, after a successful run, one action: "Run this weekly". It stores the request in `discovery.saved_searches`. One saved search per offering in version 1; saving a second replaces the first after confirmation.
2. A cron route in the style of the existing ones under `apps/web/app/api/cron/`, guarded by `CRON_SECRET`, enqueues due searches through the domain-events drain. Each run uses free sources only, passes the usage check, inserts new suggestions and records the run in History.
3. A run is idempotent: the unique key on suggestions prevents duplicates, and a retried job does not double-count usage.
4. The saved search shows its last run, result count and next run, and can be paused.

Done when: a saved search adds only new suggestions on its second run, a failed gateway call is recorded as failed without retries piling up, and a paused search does not run.

### B8. Tests and checks across Part B

- Tenant isolation and licence gating for `saved_searches`, `audience_leads`, `audience_feedback`.
- Gateway client: each failure type; a malformed response; a response containing text that looks like instructions, which must appear only as quoted data in any prompt.
- No provider access: a test that fails if the repo's environment example or source names any provider key or host other than the gateway's (Apollo, Hunter, Google Places, YouTube, Podcast Index, data.gov.in).
- Approval: a gateway suggestion becomes a prospect with source fields copied; a duplicate is refused; an ICP pre-filter failure is skipped and counted.
- Enrichment never overwrites a user-entered value; a double click on "Find contacts" spends units once.
- Public sign-up: rate limit, honeypot, cross-workspace write refused, unsubscribe blocks sending.
- Help links check, typecheck, boundary lint, and `npm run build:progress`.

## Build order and session prompts

Four pull requests in each repo, run as two parallel tracks. WonderArk builds against fixtures of the contract until the real gateway key exists, so neither track waits for the other.

This is more work than the first plan: all provider work moved into WonderWorks and consumer discovery was added. Expect it to fill every evening through Saturday. The cut order at the end says what to drop first.

| When | WonderWorks (`wonder-jobs`, shared-layer session) | WonderArk (`wonder-ark`) | Checkpoint |
| --- | --- | --- | --- |
| Wed night | PR 1: A1 and A2 | PR 1: B1, B2 and B3, tested on fixtures | Gateway serves `businesses` to a `wonderark` key |
| Thu | PR 2: A3 and A4 | Owner sets the gateway URL and key in WonderArk. PR 2: B4 | First real search, approval and enrichment end to end |
| Fri | PR 3: A6, then A5 | PR 3: B5 | A consumer offering finds channels and collects a sign-up |
| Sat morning | PR 4: A7 and A8's admin card | PR 4: B6 and B7 | Four tabs live; hiring signals answer |
| Sat afternoon | Fixes only | Use it for WonderID, WonderArk's own trades customers and WonderHome | A written list of gaps |
| Sat evening | Fixes only | Top three gaps only | Usage limits reset at 11:30 pm |

A8's tests and documentation ride with the package they cover; they are not a separate pull request.

### Steps only the owner can do

1. In WonderWorks admin: turn on outside consumers, issue the `wonderark` key (shown once), and set quotas.
2. In WonderArk's Vercel project and local `.env.local`: `WORKSLAKE_GATEWAY_URL` and `WORKSLAKE_GATEWAY_API_KEY`.
3. In WonderWorks Admin, Keys: sign up for and paste the provider keys as each adapter lands. Until then that provider shows "Needs setup" and everything else works.
4. Work through the new owner decisions on Admin, Sources, Import.
5. If the two repos' Supabase projects sit on different accounts, each session needs its own project-scoped Supabase connection, as set up earlier for WonderHome.

### Prompts to paste

WonderWorks, each of the four sessions (change the package list):

```text
Read CLAUDE.md, then docs/PROSPECT_DATA_API.md (the build spec; save it there first if missing).
You are the shared-layer session. Build only Part A packages A1 and A2.
Before coding, read the gateway code the packages touch (apps/data-gateway/src/core.mjs, handler.mjs,
apps/web/src/server/gateway) and tell me in five lines or fewer anything in the spec that does not match
the code. Then proceed without waiting unless a mismatch breaks the shared contract.
Keep every guardrail in "Guardrails for every Part A package". Existing behaviour for the workslake
consumer must not change. Add the tests listed under A8 for these packages. Record terms pending and owner
decisions as the spec and CLAUDE.md require. One pull request; merge when green.
Finish with one line: what is live, and what only I can do next.
```

WonderArk, PR 1:

```text
Read CLAUDE.md, section 0 of docs/plan/12-DISCOVERY-EXPANSION-SPEC.md, then
docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md (the build spec; save it there first if missing).
Build only Part B packages B1, B2 and B3, story ids as given in the spec.
The gateway is not reachable yet: build the client against fixtures made from the contract's JSON examples,
kept under tests only. Without gateway settings the product must show "Needs setup", never sample data.
Keep every guardrail in "Guardrails for every Part B package". Check the entity-ownership map before
creating a table. Additive migrations only, on the dev Supabase project.
Tell me in five lines or fewer anything in the spec that does not match the repo, then proceed.
One pull request; merge when green. Finish with one line: what to check, and what only I can do next.
```

WonderArk, PRs 2 to 4: the same prompt with the package list changed to `B4`, then `B5`, then `B6 and B7`, and this line in place of the fixtures paragraph:

```text
The gateway is live: WORKSLAKE_GATEWAY_URL and WORKSLAKE_GATEWAY_API_KEY are set for dev.
Verify against the real gateway before claiming a flow works. Read docs/security/rules.md first.
```

### Cut order if time runs short

Drop in this order: A7 hiring signals; B7 saved searches; Foursquare (keep Overture); the Apollo adapter; B5.4's themes summary. Do not cut tenant isolation tests, consent recording, suppression, or the "no provider keys in WonderArk" check.

## Terms-pending register and open questions

Holding every provider key in WonderWorks means WonderWorks passes provider data on to WonderArk businesses. Each row below is built and kept live under the repo's "terms pending" rule, and each becomes an entry in `OWNER_DECISIONS` for the owner to confirm.

| Item | What to confirm | Behaviour until confirmed |
| --- | --- | --- |
| Apollo | Whether results may be passed to other businesses through your product. [One API guide says resale through your own product needs a custom contract](https://www.cleanlist.ai/blog/2026-10-15-apollo-api-guide) | Live calls only, no storage, `termsPending: true` |
| Hunter | The same question for found and verified emails | Live calls only, no storage, `termsPending: true` |
| Google Places | What may be stored, for how long, and what attribution a result needs when shown without a Google map | No cache, no storage, attribution shown |
| OpenStreetMap | Attribution wording in WonderArk, and the share-alike condition if its data is merged into a combined dataset. The Overpass server choice is already an open decision | Attribution shown; merged at read time only |
| Overture and Foursquare | Attribution wording | Attribution shown |
| YouTube, Podcast Index, any community source | Storage and display terms of each API | Live calls, 24-hour cache, `termsPending: true` |
| Hiring signals | Whether job titles from sources reviewed for WonderWorks may be shown in WonderArk as counts and titles | Counts and titles only, `termsPending: true` |
| Named contacts | The lawful basis for business outreach to named people under India's DPDP Act and, for people in the EU or UK, GDPR; and a public way to ask for removal | Lookups on user action only, nothing stored in WonderWorks, suppression list live |
| Solo creators as channels | That a public channel run by one person counts as an outlet, not a personal profile | Outlet name and public link only |
| Gateway hardening | The README says no outside consumer before a shared rate limiter and licence reviews | One outside consumer, `wonderark`, with per-tenant quotas |

### Open questions for the owner

1. **Who pays for paid lookups, and what does each WonderArk business get?** Free tiers will not stretch across tenants: [Hunter's free plan is 50 credits a month](https://help.hunter.io/en/articles/6001212-plans-overview) and [Apollo's is 900 a year](https://www.enrich.so/blog/apollo-pricing-breakdown), for the whole platform. The spec defaults to 50 paid units per business per month and a platform cap. Set the real numbers, and decide whether paid lookups belong to a WonderArk plan tier.
2. **Which countries does open-data collection cover after India?**
3. **Where does the public sign-up page live?** The spec uses WonderArk's existing public routes. A custom domain per business would be a later feature.
4. **Should your own apps push sign-ups in directly?** WonderHome, WonderJobs and Wonder Creator could send their waitlists to WonderArk through a keyed endpoint. It is left out of this week; say if you want it added after B5.

Figures in this section come from pages found by search on 11 Nov 2026, not from the vendors' own pricing pages. Confirm them before budgeting.

---

<!--
Everything above this line is the spec as supplied on 2026-11-11 and is kept verbatim: it
is shared with `wonder-jobs`, and the "Shared contract" section may only change in both
repos together. What follows is this repo's own: a machine-readable story index for
`scripts/build-progress-tracker.mjs` (the same arrangement as §31a of
`16-BRANDING-BACKLOG.md`) and notes on where the build differs from the spec. A package
adds its stories here when it is built.
-->

## Part B story index (wonder-ark)

### DISC-DATA-P0-01.1 — Offering audience type (B1)
### DISC-DATA-P0-01.2 — Source fields on suggestions and prospects (B1)
### DISC-DATA-P0-01.3 — Contact email status and source (B1)
### DISC-DATA-P0-01.4 — Saved searches table and access rules (B1)
### DISC-DATA-P0-02.1 — WorksLake gateway client (B2)
### DISC-DATA-P0-02.2 — One list of prospect sources (B2)
### DISC-DATA-P0-02.3 — Usage check and run history for gateway calls (B2)
### DISC-DATA-P0-03.1 — Find screen (B3)
### DISC-DATA-P0-03.2 — Staging results and the review list (B3)
### DISC-DATA-P0-03.3 — Approval carries the source and refuses duplicates (B3)
### DISC-DATA-P0-04.1 — Enrich on approval and Fill missing details (B4)
### DISC-DATA-P0-04.2 — Find contacts, address status and sending rules (B4)
### DISC-DATA-P0-04.3 — Removal: "They asked not to be contacted" (B4)
### DISC-DATA-P0-05.1 — Weekly saved search (B7)
### DISC-NAV-P0-01.1 — Four-tab offering navigation (B6)
### DISC-NAV-P0-01.2 — Today list at the top of Prospects (B6)
### DISC-NAV-P0-01.3 — Plain labels: Ideal customer, Find, To review (B6)

## Part B implementation notes (wonder-ark)

Where B1 to B3, as built, differ from the text above. The live repo wins (`CLAUDE.md`).

- **`discovery.products` is keyed by `business_id`**, and `discovery.workspaces` by `product_id`; a workspace is one offering's workspace. `saved_searches` is therefore unique on `workspace_id` ("one per offering").
- **The suggestions unique key is a plain index** on `(workspace_id, source, external_id)`, not a partial one. Postgres treats nulls as distinct, so rows without an `external_id` never collide, and a plain index is one `insert ... on conflict do nothing` can name.
- **The ICP pre-filter runs when results are staged**, not at approval. In the repo it is a pipeline check (`lib/pipeline/icp-pre-filter.ts`) and `approveProspectSuggestions` never called it. It is applied to industry, place and the ICP's exclusions; company size is left unknown because a source's range and an ICP's free text cannot be compared as text. The duplicate check runs at both points.
- **Run history is `discovery.ai_runs`.** History lists AI Discovery runs (`pipeline_runs`) and shows the `ai_runs` rows inside each; Usage reads `ai_runs`. Gateway runs are written there with three added nullable columns (`source`, `result_count`, `units_spent`), so they count toward the monthly run allowance like any other run. `listSources` is not recorded or usage-checked: it spends nothing and runs when the page opens.
- **"Companies hiring for..." is an entry in the Source picker**, not a second form, so the page's control count goes down. The contract does not say how `GET /v1/prospects/sources` lists a signal; the entry appears for a source whose `kinds` includes `"signal"` and stays hidden until the gateway sends one.
- **A row carries one control, its checkbox**; Approve and Discard act on the ticked rows (`CLAUDE.md`, Minimal UI: a list item carries at most one action).
- **The Find button says a source uses paid lookups and how many are left**, not "uses 1 of 50": the contract gives no unit cost per search.

B6, as built:

- **The list of tabs lives in `packages/core/src/lib/offering-nav.ts`**, not in `product-nav.tsx`: the Discovery sidebar reads it too, and core cannot import a module. The sidebar's Customer Acquisition group now lists the same four tabs (it listed nine entries, two of which opened the overview).
- **A tab shows its pages on a second row.** Setup: Overview, Ideal customer (personas are on that page). Find: Search, Import, History, Definitions. Prospects: All, Opportunities, Watchlist. Results: Performance, Conversions, Usage. "To review" is a section of the Search page, so it has no link of its own; the Today list links to it.
- **The table above does not place the Discovery definitions page** (`/discovery`). It sits under Find as "Definitions", since "the Discovery tab becomes Find".
- **"Follow-ups due" has no stored date to read.** It is derived: a prospect in the Sent stage with no reply and no activity for `STAGE_STUCK_THRESHOLD_DAYS` (7), the rule the list already shows as "Needs next step". Its link opens the list with `?stage=sent&due=1`, a filter added to `listProspects` so the count and the list cannot differ.
- **Left for B5:** People under Prospects, new sign-ups in the Today list, "What people say" under Results. No placeholder was built for any of them.
- **"ICP" in body copy** on the Ideal customer page (its buttons, empty state, clone dialog and version history) now says "ideal customer" (2026-11-12). Identifiers, routes and AI Discovery's stage names keep `icp`.

B4, as built:

- **No migration.** B1's columns carry everything. A lookup's state is read from the run ledger (`discovery.ai_runs`), keyed by a hash that names the prospect and, for a paid lookup, the one click that asked for it. That is also what makes a replayed job or a second click find the first and ask nothing.
- **"Spends once" is the ledger key plus the existing per-workspace lock** (`prospect_discovery_locks`, built so "two overlapping discovery runs for the same workspace can't both bill"). The click's key is made by the server when the prospect page renders. A paid lookup, an AI web search and another paid lookup therefore never run at the same moment for one offering; the second is refused with "Nothing was spent".
- **The drain runs once a day**, so "fills blank fields within a minute" needs more than the queue. Approval publishes `discovery.prospect.enrichment_requested` (retried by the drain, parked without a licence) and also attempts the lookup straight after the response, as the CRM auto-reply does. The queued job finds a lookup that already succeeded and does not repeat it.
- **Every approval queues enrichment the same way** (changed 2026-11-12; at first only the To review list did). `lib/data-sources/approval.ts::approveSuggestionsAndQueueEnrichment` is what the To review action, AI Discovery's automatic approval (`lib/pipeline/handlers.ts`) and first-setup auto-populate (`lib/ai-approval/auto-populate.ts`) all call: one `discovery.prospect.enrichment_requested` event per approved company, with the prospect as the lookup's ledger key. Only the To review action also attempts the lookup straight after the response; the two AI paths go on to research the prospect and leave the lookup to the drain, so their run time does not grow.
- **A paid lookup shows what is left, not what it will cost.** The contract gives no price for an enrich or contacts call before it runs. The button opens a confirmation that reads the business's remaining paid lookups from `GET /v1/prospects/sources` at that moment; the result then says how many units were used. The prospect page makes no gateway call until a button is pressed.
- **`metadata.providers` on enrich and contacts** is read leniently (`providerIssuesOf`): an entry the client cannot read is left out rather than failing an answer the business may have paid for. It is what lets the page say "No named contacts: the contact providers need setup."
- **Enriched values are read by column**: `hq` as a string, or an object's `text`, else its city, region and country; `linkedinUrl` only as a plain http(s) link; `email` only as an address. A field whose source has no name is not stored.
- **Editing clears provenance.** Changing a value a source filled removes its `field_sources` entry; changing a found contact's address clears its `email_status`.
- **"They asked not to be contacted" keeps the contact if the gateway cannot take the request**, and says why, so the request is not lost. The address goes to two lists (changed 2026-11-12; at first only the gateway's): first the business's own opt-out list, `core.communication_suppressions`, through `core/privacy/suppression.ts::suppressEmailOnRequest` (the caller's own session, reason `manual`, hash only), which every outreach send already checks in `prepareOutreachEmail`; then the gateway's. If the gateway cannot take it, the address is already blocked for the business and the message says so.
- **`contacts.source` holds the source's name** as the gateway gave it (for example "Hunter"), since the table has one source column and that is what is shown.
- **The prospect page reads before it edits.** Details are a read-only list with each value's source; the edit form and the add-contact form are folded. Sources are shown as text; the links are the company's website and profiles and the record at the prospect's own source.

B7, as built:

- **No migration.** `discovery.saved_searches` and its access rules came with B1 (`20261111100000`); `scripts/test-discovery-saved-searches-rls.mjs` covers isolation and licence gating.
- **What is stored is the Find form's own search** (`sourceId`, `what`, `where`, and the two "More filters" values), not the gateway request, so each run goes through `runFind` like a person's search: the source is looked up in the gateway's list at that moment, and the usage check, ICP pre-filter and duplicate check all apply.
- **"Free sources only" is checked twice.** Saving is refused for a paid source, the AI web search or the file import. At run time a source the gateway now lists as paid is refused before the search, so a source that changes later never spends paid lookups.
- **The cron route only queues** (`/api/cron/run-saved-searches`, 05:50 UTC, ten minutes before the drain). It claims a due search by moving `next_run_at` a week on only if it still holds the date that was read, then publishes `discovery.saved_search.run_requested`; a failed publish puts the date back. The drain runs once a day, so a run starts up to a day after it falls due.
- **Idempotency is the ledger.** A run is recorded in `discovery.ai_runs` under the saved search and its due date. A redelivered event finds that row, succeeded or failed, and asks the gateway nothing; the suggestions' unique key does the rest.
- **A failed run is not retried.** The handler records the failure on the saved search (`last_result`) and returns; next week's run is the retry. Only a database error throws for the drain to retry. A request refused before it left the server (source not set up, allowance used) writes no ledger row, as elsewhere, and is still recorded on the saved search.
- **Known limit:** if the gateway answered but staging then failed on a database error, the drain's retry finds the ledger row and skips, so that week's results wait for the next run.
- **Find gains two conditional controls**, so its count cannot go down: "Run this weekly" in the result of a search that just ran on a free source (hidden when that search is already the weekly one), and Pause or Resume on the weekly search's line. A page with neither state has the same five controls as before.
- **Saved searches are for companies in this version** (`kind = 'company'`). Channel searches arrive with B5.2.


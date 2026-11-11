-- DISC-DATA-P0-01.1/01.2/01.3/01.4: the data model for Discovery's prospect data sources
-- (docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md, Part B, package B1).
--
-- Discovery gets one outside data connector, the WorksLake gateway. What it returns lands
-- in discovery.prospect_suggestions and goes through the same review as an AI web-search
-- result, so a suggestion, and the prospect it becomes, now says where it came from.
--
-- Additive only: no column, table or status value is renamed, dropped or rewritten, and
-- every default keeps the rows that exist today valid.
--
-- Grants: covered by the schema-wide default privileges on `discovery`
-- (20260907120000_grant_schema_privileges.sql).

-- ---------------------------------------------------------------------------------------
-- DISC-DATA-P0-01.1: who an offering is sold to
-- ---------------------------------------------------------------------------------------

-- Every offering that exists today is sold to companies, so 'business' is both the
-- default and the truth for existing rows.
alter table discovery.products
  add column audience_type text not null default 'business'
    check (audience_type in ('business', 'consumer', 'both'));

-- ---------------------------------------------------------------------------------------
-- DISC-DATA-P0-01.2: where a suggestion, and the prospect it becomes, came from
-- ---------------------------------------------------------------------------------------

--   kind         'company' (an organisation) or 'channel' (a named public outlet).
--   source       the id of the source that found it: 'web_search' for the AI web search,
--                otherwise the gateway's provider id (for example 'stored').
--   source_name  the attribution text to show beside it, as the source gave it.
--   source_ref   a link back to the record at the source.
--   external_id  the source's own id for the record.
--   payload      the validated gateway item, kept so approval can copy fields without a
--                second call.
alter table discovery.prospect_suggestions
  add column kind text not null default 'company' check (kind in ('company', 'channel')),
  add column source text,
  add column source_name text,
  add column source_ref text,
  add column external_id text,
  add column payload jsonb check (payload is null or jsonb_typeof(payload) = 'object');

-- Every suggestion staged before this migration came from the AI web search, the only
-- source there was.
update discovery.prospect_suggestions set source = 'web_search' where source is null;

-- Running the same search twice must not stage the same record twice. A plain unique
-- index, not a partial one `where external_id is not null`: Postgres already treats nulls
-- as distinct, so rows without an external_id (AI web search) never collide, and a plain
-- index is one `insert ... on conflict (workspace_id, source, external_id) do nothing`
-- can name, which a partial index is not.
create unique index prospect_suggestions_source_external_id_key
  on discovery.prospect_suggestions (workspace_id, source, external_id);

--   company_name holds a channel's name when kind = 'channel'.
--   field_sources maps a prospect column to { provider, name, url, observedAt } for each
--   value a source supplied; a value a person typed has no entry.
alter table discovery.prospects
  add column kind text not null default 'company' check (kind in ('company', 'channel')),
  add column source text,
  add column source_name text,
  add column source_ref text,
  add column phone text,
  add column channel_type text,
  add column audience_size integer check (audience_size is null or audience_size >= 0),
  add column field_sources jsonb not null default '{}'::jsonb
    check (jsonb_typeof(field_sources) = 'object');

-- ---------------------------------------------------------------------------------------
-- DISC-DATA-P0-01.3: how a contact's email was found and checked
-- ---------------------------------------------------------------------------------------

-- All three stay null for a contact a person typed in.
alter table discovery.contacts
  add column email_status text
    check (email_status in ('verified', 'risky', 'invalid', 'unverified')),
  add column source text,
  add column source_retrieved_at timestamptz;

-- ---------------------------------------------------------------------------------------
-- DISC-DATA-P0-01.4: a search an offering wants run again
-- ---------------------------------------------------------------------------------------

-- Not in the entity-ownership map (00-MASTER-PLAN.md §5), and no existing table holds a
-- stored search request. One per offering in version 1, hence unique (workspace_id): a
-- workspace is one offering's go-to-market workspace. This migration adds the table and
-- its access rules only; nothing reads or runs it yet.
create table discovery.saved_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  kind text not null default 'company' check (kind in ('company', 'channel')),
  -- The search exactly as it was asked, so a later run repeats what the person chose.
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id)
);

create index saved_searches_due_idx on discovery.saved_searches (next_run_at) where enabled;

alter table discovery.saved_searches enable row level security;

-- `tenant AND licensed` (ADR-4, ADR-8): readable_/writable_workspace_ids() return only
-- workspaces of businesses the caller belongs to that hold a Discovery licence, and the
-- writable set excludes a licence in its read-only grace period (ADR-9).
create policy "members can view saved searches in their workspaces"
  on discovery.saved_searches for select
  using (workspace_id in (select discovery.readable_workspace_ids()));
create policy "members can create saved searches in their workspaces"
  on discovery.saved_searches for insert
  with check (workspace_id in (select discovery.writable_workspace_ids()));
create policy "members can update saved searches in their workspaces"
  on discovery.saved_searches for update
  using (workspace_id in (select discovery.writable_workspace_ids()))
  with check (workspace_id in (select discovery.writable_workspace_ids()));
create policy "members can delete saved searches in their workspaces"
  on discovery.saved_searches for delete
  using (workspace_id in (select discovery.writable_workspace_ids()));

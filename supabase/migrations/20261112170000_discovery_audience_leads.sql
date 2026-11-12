-- DISC-CONS-P0-03.1/03.2/03.3/04.1/04.2/05.2: consumer discovery, the people side
-- (docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md, Part B, packages B5.3, B5.4 and B5.5).
--
-- People who chose to hear from a business: they sign up on the offering's public page,
-- or the business imports a list it confirms they agreed to. Consumer discovery never
-- builds lists of private individuals.
--
-- Checked 00-MASTER-PLAN.md §5 first. "Party" is core.parties (a lead links to one on
-- first contact, role 'lead'); none of a waitlist, a person's consent, their feedback or
-- a themes summary is listed, so these are new tables. discovery.interest_signups is
-- WonderArk's own pre-account landing list with no tenant and is not reused.
--
-- Every table is `tenant AND licensed` through readable_/writable_workspace_ids(), as the
-- outreach tables are. The public sign-up page has no session: it writes through the
-- service role after resolving the workspace from the page's token on the server. anon
-- has no privilege on any of these tables.

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-03.2: the public sign-up page, one per offering
-- ---------------------------------------------------------------------------------------

create table discovery.audience_signup_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references discovery.workspaces (id) on delete cascade,
  -- The page's address (/p/w/<token>). Random, made by the app; it grants nothing but
  -- the right to sign up to this offering's list.
  token text not null unique check (token ~ '^[a-f0-9]{32,64}$'),
  enabled boolean not null default true,
  value_line text check (value_line is null or length(value_line) <= 200),
  -- Up to two questions the owner writes, as an array of strings.
  questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 2),
  consent_text text not null check (length(consent_text) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger audience_signup_pages_set_updated_at
  before update on discovery.audience_signup_pages
  for each row execute function discovery.set_updated_at();

alter table discovery.audience_signup_pages enable row level security;

create policy "members can view audience signup pages in their workspaces"
  on discovery.audience_signup_pages for select
  using (workspace_id in (select discovery.readable_workspace_ids()));
create policy "members can create audience signup pages in their workspaces"
  on discovery.audience_signup_pages for insert
  with check (workspace_id in (select discovery.writable_workspace_ids()));
create policy "members can update audience signup pages in their workspaces"
  on discovery.audience_signup_pages for update
  using (workspace_id in (select discovery.writable_workspace_ids()))
  with check (workspace_id in (select discovery.writable_workspace_ids()));

revoke all on discovery.audience_signup_pages from anon;

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-03.1: people who opted in
-- ---------------------------------------------------------------------------------------

create table discovery.audience_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  email text not null check (length(email) between 3 and 254 and position('@' in email) > 1),
  name text check (name is null or length(name) <= 200),
  -- Answers to the sign-up page's questions: { "<question>": "<answer>" }.
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  -- The exact consent line the person agreed to, and when.
  consent_text text check (consent_text is null or length(consent_text) <= 500),
  consent_at timestamptz,
  source text not null check (source in ('waitlist', 'import', 'manual')),
  referrer_lead_id uuid,
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object'),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'interviewed', 'active', 'unsubscribed')),
  party_id uuid references core.parties (id) on delete set null,
  tags text[] not null default '{}',
  -- The person's own referral link (/p/w/<page token>?ref=<code>), shared publicly.
  referral_code text not null unique check (referral_code ~ '^[a-f0-9]{12,64}$'),
  -- The person's private token, carried only in emails to them: unsubscribe and answer
  -- questions. Members cannot read it (column privileges below).
  lead_token text not null unique check (lead_token ~ '^[a-f0-9]{32,64}$'),
  -- Claimed (set once, compare-and-set) before the confirmation email is sent, so a
  -- retried or repeated sign-up never sends a second one.
  confirmation_sent_at timestamptz,
  -- Questions sent with "Send questions" and not yet answered: { questions, sent_at }.
  survey jsonb check (survey is null or jsonb_typeof(survey) = 'object'),
  created_at timestamptz not null default now(),
  -- A waitlist or imported person must carry their consent; a person added by hand may
  -- not have given it, and then cannot be messaged (checked in code before every send).
  check (source = 'manual' or (consent_at is not null and consent_text is not null)),
  unique (id, workspace_id),
  -- A referrer is always someone on the same offering's list: a sign-up through a link
  -- can never point into another workspace.
  foreign key (referrer_lead_id, workspace_id)
    references discovery.audience_leads (id, workspace_id) on delete set null (referrer_lead_id)
);

create unique index audience_leads_workspace_email_key on discovery.audience_leads (workspace_id, lower(email));
create index audience_leads_referrer_idx on discovery.audience_leads (referrer_lead_id) where referrer_lead_id is not null;
create index audience_leads_party_idx on discovery.audience_leads (party_id) where party_id is not null;
create index audience_leads_workspace_created_idx on discovery.audience_leads (workspace_id, created_at desc);

alter table discovery.audience_leads enable row level security;

create policy "members can view audience leads in their workspaces"
  on discovery.audience_leads for select
  using (workspace_id in (select discovery.readable_workspace_ids()));
create policy "members can create audience leads in their workspaces"
  on discovery.audience_leads for insert
  with check (workspace_id in (select discovery.writable_workspace_ids()));
create policy "members can update audience leads in their workspaces"
  on discovery.audience_leads for update
  using (workspace_id in (select discovery.writable_workspace_ids()))
  with check (workspace_id in (select discovery.writable_workspace_ids()));
create policy "members can delete audience leads in their workspaces"
  on discovery.audience_leads for delete
  using (workspace_id in (select discovery.writable_workspace_ids()));

-- The private token is the service role's only. Members read every other column.
revoke all on discovery.audience_leads from anon, authenticated;
grant select (
  id, workspace_id, email, name, answers, consent_text, consent_at, source, referrer_lead_id,
  utm, status, party_id, tags, referral_code, confirmation_sent_at, survey, created_at
) on discovery.audience_leads to authenticated;
grant insert, update, delete on discovery.audience_leads to authenticated;
grant all on discovery.audience_leads to service_role;

-- Unsubscribing is final for the business: a member cannot move a person out of
-- 'unsubscribed', nor give them consent again. Only the person can, by signing up again
-- on the public page (the service role, with a new consent). A trigger, because RLS does
-- not see the old row's value.
create function discovery.audience_leads_keep_unsubscribed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'unsubscribed'
     and current_user in ('authenticated', 'anon')
     and (new.status <> 'unsubscribed' or new.consent_at is distinct from old.consent_at) then
    raise exception 'This person unsubscribed. Only they can sign up again.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger audience_leads_keep_unsubscribed
  before update on discovery.audience_leads
  for each row execute function discovery.audience_leads_keep_unsubscribed();

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-03.2: abuse control for the public page
-- ---------------------------------------------------------------------------------------

-- Fixed-window counters keyed by what is limited (a page, or a page and an address's
-- hash). No address is stored here.
create table discovery.audience_signup_attempts (
  key text not null check (length(key) <= 200),
  window_start timestamptz not null,
  attempts integer not null default 0,
  primary key (key, window_start)
);

alter table discovery.audience_signup_attempts enable row level security;
revoke all on discovery.audience_signup_attempts from anon, authenticated;
grant all on discovery.audience_signup_attempts to service_role;

-- Atomic check-and-count, as core.check_api_rate_limit() does for the API. False once
-- `p_limit` attempts were made in the current window. Service role only.
create function discovery.take_signup_attempt(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  delete from discovery.audience_signup_attempts where key = p_key and window_start < now() - interval '1 day';
  insert into discovery.audience_signup_attempts (key, window_start, attempts)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
    do update set attempts = discovery.audience_signup_attempts.attempts + 1
  returning attempts into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function discovery.take_signup_attempt(text, integer, integer) from public, anon, authenticated;
grant execute on function discovery.take_signup_attempt(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-04.1: what people say, append-only
-- ---------------------------------------------------------------------------------------

create table discovery.audience_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  lead_id uuid,
  prospect_id uuid references discovery.prospects (id) on delete cascade,
  kind text not null check (kind in ('interview', 'survey', 'comment')),
  body text not null check (length(body) between 1 and 10000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (lead_id is not null or prospect_id is not null),
  -- A lead's feedback stays in the lead's own workspace.
  foreign key (lead_id, workspace_id) references discovery.audience_leads (id, workspace_id) on delete cascade
);

create index audience_feedback_workspace_created_idx on discovery.audience_feedback (workspace_id, created_at desc);
create index audience_feedback_lead_idx on discovery.audience_feedback (lead_id) where lead_id is not null;
create index audience_feedback_prospect_idx on discovery.audience_feedback (prospect_id) where prospect_id is not null;

-- A prospect's feedback stays in the prospect's own workspace (prospects have no
-- (id, workspace_id) key to point a foreign key at, so a trigger checks it).
create function discovery.audience_feedback_prospect_same_workspace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.prospect_id is not null and not exists (
    select 1 from discovery.prospects p where p.id = new.prospect_id and p.workspace_id = new.workspace_id
  ) then
    raise exception 'The prospect does not belong to this workspace.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger audience_feedback_prospect_same_workspace
  before insert on discovery.audience_feedback
  for each row execute function discovery.audience_feedback_prospect_same_workspace();

alter table discovery.audience_feedback enable row level security;

-- Select and insert only: a recorded conversation or answer is a fact, never rewritten.
create policy "members can view audience feedback in their workspaces"
  on discovery.audience_feedback for select
  using (workspace_id in (select discovery.readable_workspace_ids()));
create policy "members can create audience feedback in their workspaces"
  on discovery.audience_feedback for insert
  with check (workspace_id in (select discovery.writable_workspace_ids()));

revoke all on discovery.audience_feedback from anon;
revoke update, delete, truncate on discovery.audience_feedback from authenticated;

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-04.2: "What people say", the AI themes summary, cached by input hash
-- ---------------------------------------------------------------------------------------

-- One row per distinct input (the feedback summarised, the prompt version and the
-- model): the same feedback is summarised once. `themes` is the code-checked summary;
-- each theme names the feedback entries behind it. ai_run_id ties it to its ledger row.
create table discovery.audience_themes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  input_hash text not null,
  prompt_version text not null,
  themes jsonb not null check (jsonb_typeof(themes) = 'array'),
  entry_count integer not null check (entry_count >= 0),
  ai_run_id uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, input_hash)
);

create index audience_themes_workspace_created_idx on discovery.audience_themes (workspace_id, created_at desc);

alter table discovery.audience_themes enable row level security;

create policy "members can view audience themes in their workspaces"
  on discovery.audience_themes for select
  using (workspace_id in (select discovery.readable_workspace_ids()));
create policy "members can create audience themes in their workspaces"
  on discovery.audience_themes for insert
  with check (workspace_id in (select discovery.writable_workspace_ids()));

revoke all on discovery.audience_themes from anon;
revoke update, delete, truncate on discovery.audience_themes from authenticated;

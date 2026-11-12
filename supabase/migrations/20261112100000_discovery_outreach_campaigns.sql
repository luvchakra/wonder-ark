-- DISC-CAMP-P0-01.1 / DISC-CAMP-P0-02.4: outreach campaigns in Discovery
-- (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md).
--
-- A campaign is a short sequence of messages a workspace sends to its own prospects
-- through a mailbox it connected. Nothing here sends anything: these are the tables, the
-- access rules, the audit trail and the one function through which a send is claimed.
--
-- What the database itself guarantees, whatever the application does:
--   * every table is `tenant AND licensed` (ADR-4, ADR-8): read with Discovery licensed,
--     write with the licence active and discovery.manage;
--   * a campaign cannot become active without a verified mailbox, and only the service
--     role can mark a mailbox verified;
--   * the mailbox password cannot be selected by a signed-in user at all;
--   * a send exists only as a row claimed through discovery.claim_outreach_send(), one
--     per (enrollment, step), counted against the mailbox's daily limit under a
--     per-workspace lock; its outcome is final; members cannot write it;
--   * launch, pause, resume, every claim and every outcome are in core.audit_log.
--
-- Not in the entity-ownership map (00-MASTER-PLAN.md §5); the row is added with
-- DISC-CAMP-P0-01.2. The map's "Message template -> core.message_templates" is a
-- business's named, reusable templates (FSM's settings list them) and is not gated by
-- the Discovery licence; a step's text belongs to one campaign, step and line of work,
-- so it lives here. platform.email_templates (20260912410000) records the same split.
--
-- Additive only. Grants: the schema-wide default privileges on `discovery`
-- (20260907120000_grant_schema_privileges.sql), narrowed below where a table must not be
-- written, or a column not read, by a signed-in user.

-- ---------------------------------------------------------------------------------------
-- The mailbox a workspace sends from (DISC-CAMP-P0-02.4)
-- ---------------------------------------------------------------------------------------

create table discovery.sender_mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references discovery.workspaces (id) on delete cascade,
  from_name text not null check (length(from_name) between 1 and 100),
  from_email text not null check (from_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(from_email) <= 254),
  smtp_host text not null check (length(smtp_host) between 1 and 253),
  -- 465 (TLS from the start) or 587 (STARTTLS). Nothing else is ever connected to.
  smtp_port integer not null check (smtp_port in (465, 587)),
  username text not null check (length(username) between 1 and 320),
  -- Encrypted by packages/core/src/crypto/api-key.ts. Never selectable by a member.
  secret_encrypted text not null,
  -- Optional: reading replies and bounces. TLS on 993 only.
  imap_host text check (imap_host is null or length(imap_host) between 1 and 253),
  imap_port integer check (imap_port is null or imap_port = 993),
  check ((imap_host is null) = (imap_port is null)),
  status text not null default 'unverified' check (status in ('unverified', 'verified', 'failed')),
  last_error text check (last_error is null or length(last_error) <= 500),
  verified_at timestamptz,
  -- The highest IMAP UID already looked at, so a message is read once.
  last_seen_uid bigint,
  last_seen_uid_validity bigint,
  -- Sends a day across all of the workspace's campaigns. The business's own mail
  -- provider's terms apply to what it sends, which is why this is low.
  daily_limit integer not null default 30 check (daily_limit between 1 and 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A member may save the mailbox's settings, never vouch for it. Changing where or as whom
-- it connects makes it unverified again; only the service role (after "Send a test to
-- me" was accepted by the server) sets it verified or moves the read position.
create function discovery.enforce_sender_mailbox_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_member boolean := auth.uid() is not null;
begin
  if tg_op = 'INSERT' then
    if v_member then
      new.status := 'unverified';
      new.verified_at := null;
      new.last_error := null;
      new.last_seen_uid := null;
      new.last_seen_uid_validity := null;
    end if;
    return new;
  end if;

  if new.workspace_id <> old.workspace_id then
    raise exception 'A mailbox cannot be moved to another workspace.' using errcode = '42501';
  end if;
  if new.smtp_host is distinct from old.smtp_host or new.smtp_port is distinct from old.smtp_port
     or new.username is distinct from old.username or new.secret_encrypted is distinct from old.secret_encrypted
     or new.from_email is distinct from old.from_email then
    new.status := 'unverified';
    new.verified_at := null;
    new.last_error := null;
  elsif v_member then
    new.status := old.status;
    new.verified_at := old.verified_at;
    new.last_error := old.last_error;
  end if;
  if new.imap_host is distinct from old.imap_host then
    new.last_seen_uid := null;
    new.last_seen_uid_validity := null;
  elsif v_member then
    new.last_seen_uid := old.last_seen_uid;
    new.last_seen_uid_validity := old.last_seen_uid_validity;
  end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger sender_mailboxes_rules before insert or update on discovery.sender_mailboxes
  for each row execute function discovery.enforce_sender_mailbox_rules();
revoke execute on function discovery.enforce_sender_mailbox_rules() from public, anon, authenticated;

alter table discovery.sender_mailboxes enable row level security;

create policy "members can view the sender mailbox of their workspaces"
  on discovery.sender_mailboxes for select
  using (workspace_id in (select discovery.readable_workspace_ids()));
create policy "members can connect a sender mailbox in their workspaces"
  on discovery.sender_mailboxes for insert
  with check (workspace_id in (select discovery.writable_workspace_ids()));
create policy "members can update the sender mailbox of their workspaces"
  on discovery.sender_mailboxes for update
  using (workspace_id in (select discovery.writable_workspace_ids()))
  with check (workspace_id in (select discovery.writable_workspace_ids()));
create policy "members can remove the sender mailbox of their workspaces"
  on discovery.sender_mailboxes for delete
  using (workspace_id in (select discovery.writable_workspace_ids()));

-- The password is write-only for a signed-in user: every column but secret_encrypted is
-- readable. `select *` as a member is refused rather than returning the ciphertext.
revoke all on discovery.sender_mailboxes from anon, authenticated;
grant insert, update, delete on discovery.sender_mailboxes to authenticated;
grant select (
  id, workspace_id, from_name, from_email, smtp_host, smtp_port, username, imap_host, imap_port,
  status, last_error, verified_at, last_seen_uid, last_seen_uid_validity, daily_limit, created_by, created_at, updated_at
) on discovery.sender_mailboxes to authenticated;
grant all on discovery.sender_mailboxes to service_role;

-- ---------------------------------------------------------------------------------------
-- Campaigns, their steps and the text of each step
-- ---------------------------------------------------------------------------------------

create table discovery.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  -- draft: nothing sends. active: the tick may send. paused: nothing sends until resumed.
  -- completed: nothing sends again.
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  pause_reason text check (pause_reason is null or length(pause_reason) <= 300),
  -- Who to enrol: { linesOfWork: text[], minFitScore: number | null }.
  audience jsonb not null default '{}'::jsonb check (jsonb_typeof(audience) = 'object'),
  -- ISO weekdays (1 = Monday) and the hours, in `timezone`, between which the tick sends.
  send_days smallint[] not null default '{1,2,3,4,5}'
    check (cardinality(send_days) between 1 and 7 and send_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  send_from_hour smallint not null default 9 check (send_from_hour between 0 and 23),
  send_to_hour smallint not null default 18 check (send_to_hour between 1 and 24),
  check (send_to_hour > send_from_hour),
  timezone text not null default 'UTC',
  auto_enroll boolean not null default false,
  personal_opening boolean not null default false,
  include_unverified boolean not null default false,
  -- What the last enrolment did: { enrolled, leftOut: { reason: count }, at }.
  last_enrollment jsonb check (last_enrollment is null or jsonb_typeof(last_enrollment) = 'object'),
  launched_at timestamptz,
  launched_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- So a child row's (campaign_id, workspace_id) can only name a campaign of that workspace.
  unique (id, workspace_id)
);

create index outreach_campaigns_workspace_id_idx on discovery.outreach_campaigns (workspace_id);
create index outreach_campaigns_active_idx on discovery.outreach_campaigns (status) where status = 'active';

create function discovery.business_id_of_workspace(p_workspace_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.business_id from discovery.workspaces w join discovery.products p on p.id = w.product_id
  where w.id = p_workspace_id;
$$;
revoke execute on function discovery.business_id_of_workspace(uuid) from public, anon, authenticated;
grant execute on function discovery.business_id_of_workspace(uuid) to service_role;

-- Launching is the opt-in, and it has conditions the page cannot be trusted to hold.
create function discovery.enforce_outreach_campaign_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A campaign starts as a draft.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.workspace_id <> old.workspace_id then
    raise exception 'A campaign cannot be moved to another workspace.' using errcode = '42501';
  end if;
  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'A completed campaign cannot be started again.' using errcode = '42501';
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'A launched campaign cannot go back to draft.' using errcode = '42501';
  end if;
  if new.status = 'active' and old.status <> 'active' then
    if not exists (select 1 from discovery.sender_mailboxes m
                   where m.workspace_id = new.workspace_id and m.status = 'verified') then
      raise exception 'Connect and verify a mailbox before launching a campaign.' using errcode = '42501';
    end if;
    if not exists (select 1 from discovery.outreach_campaign_steps s where s.campaign_id = new.id) then
      raise exception 'A campaign needs at least one step before it is launched.' using errcode = '42501';
    end if;
    if old.status = 'draft' then
      new.launched_at := now();
      new.launched_by := auth.uid();
    end if;
    new.pause_reason := null;
  end if;
  if new.status <> 'draft' then
    new.launched_at := coalesce(new.launched_at, old.launched_at);
    new.launched_by := coalesce(old.launched_by, new.launched_by);
  end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger outreach_campaigns_rules before insert or update on discovery.outreach_campaigns
  for each row execute function discovery.enforce_outreach_campaign_rules();
revoke execute on function discovery.enforce_outreach_campaign_rules() from public, anon, authenticated;

-- Launch, pause, resume and completion, with who did it (null for an automatic pause).
create function discovery.audit_outreach_campaign() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
begin
  if new.status is not distinct from old.status then return null; end if;
  v_action := case
    when new.status = 'active' and old.status = 'draft' then 'launched'
    when new.status = 'active' then 'resumed'
    else new.status
  end;
  perform core.append_audit_log(
    discovery.business_id_of_workspace(new.workspace_id), auth.uid(),
    'discovery_outreach_campaign.' || v_action, 'discovery_outreach_campaign', new.id,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status, 'pauseReason', new.pause_reason, 'workspaceId', new.workspace_id)
  );
  return null;
end; $$;
create trigger outreach_campaigns_audit after update on discovery.outreach_campaigns
  for each row execute function discovery.audit_outreach_campaign();
revoke execute on function discovery.audit_outreach_campaign() from public, anon, authenticated;

create table discovery.outreach_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  workspace_id uuid not null,
  -- At most five steps.
  position smallint not null check (position between 1 and 5),
  channel text not null default 'email' check (channel in ('email', 'call', 'whatsapp', 'linkedin')),
  -- Days after the step before it. The first step has none; the rest wait at least two.
  delay_days smallint not null default 0 check (delay_days between 0 and 60),
  check ((position = 1 and delay_days = 0) or (position > 1 and delay_days >= 2)),
  purpose text not null check (purpose in ('intro', 'follow_up', 'last_note', 'call')),
  created_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references discovery.outreach_campaigns (id, workspace_id) on delete cascade,
  unique (campaign_id, position),
  unique (id, campaign_id)
);
create index outreach_campaign_steps_workspace_id_idx on discovery.outreach_campaign_steps (workspace_id);

create table discovery.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  step_id uuid not null,
  workspace_id uuid not null,
  -- A line of work, as the prospects' own `industry` reads, or 'general'.
  segment text not null check (length(segment) between 1 and 200),
  subject text check (subject is null or length(subject) <= 200),
  body text not null check (length(body) between 1 and 5000),
  -- Shown beside the text (CLAUDE.md, AI rule 9).
  origin text not null check (origin in ('ai_generated', 'user_modified', 'user_provided')),
  ai_run_id uuid references discovery.ai_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references discovery.outreach_campaigns (id, workspace_id) on delete cascade,
  foreign key (step_id, campaign_id) references discovery.outreach_campaign_steps (id, campaign_id) on delete cascade,
  unique (step_id, segment)
);
create index outreach_templates_campaign_id_idx on discovery.outreach_templates (campaign_id);
create index outreach_templates_workspace_id_idx on discovery.outreach_templates (workspace_id);
create index outreach_templates_ai_run_id_idx on discovery.outreach_templates (ai_run_id);
create trigger outreach_templates_set_updated_at before update on discovery.outreach_templates
  for each row execute function discovery.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Who is in a campaign, and what was sent to them
-- ---------------------------------------------------------------------------------------

create table discovery.outreach_enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  workspace_id uuid not null,
  -- Deleting the prospect removes its enrollment, which stops it.
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  -- Deleting the contact leaves the enrollment with no one to write to; the tick stops it.
  contact_id uuid references discovery.contacts (id) on delete set null,
  segment text not null default 'general' check (length(segment) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'replied', 'completed', 'stopped')),
  stop_reason text check (stop_reason is null or length(stop_reason) <= 200),
  next_step_position smallint not null default 1 check (next_step_position between 1 and 6),
  next_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references discovery.outreach_campaigns (id, workspace_id) on delete cascade,
  unique (campaign_id, prospect_id),
  unique (id, campaign_id)
);
-- A prospect is in at most one active campaign per workspace.
create unique index outreach_enrollments_one_active_per_prospect
  on discovery.outreach_enrollments (workspace_id, prospect_id) where status = 'active';
create index outreach_enrollments_due_idx on discovery.outreach_enrollments (status, next_due_at);
create index outreach_enrollments_prospect_id_idx on discovery.outreach_enrollments (prospect_id);
create index outreach_enrollments_contact_id_idx on discovery.outreach_enrollments (contact_id);
create index outreach_enrollments_workspace_id_idx on discovery.outreach_enrollments (workspace_id);

-- The prospect and the contact must be the workspace's own.
create function discovery.enforce_outreach_enrollment_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from discovery.prospects p where p.id = new.prospect_id and p.workspace_id = new.workspace_id) then
    raise exception 'Prospect not found in this workspace.' using errcode = '23503';
  end if;
  if new.contact_id is not null and not exists (
       select 1 from discovery.contacts c
       where c.id = new.contact_id and c.workspace_id = new.workspace_id and c.prospect_id = new.prospect_id) then
    raise exception 'Contact not found on this prospect.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    if new.campaign_id <> old.campaign_id or new.workspace_id <> old.workspace_id or new.prospect_id <> old.prospect_id then
      raise exception 'An enrollment cannot be moved.' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  return new;
end; $$;
create trigger outreach_enrollments_rules before insert or update on discovery.outreach_enrollments
  for each row execute function discovery.enforce_outreach_enrollment_rules();
revoke execute on function discovery.enforce_outreach_enrollment_rules() from public, anon, authenticated;

create table discovery.outreach_sends (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  step_id uuid not null,
  campaign_id uuid not null,
  workspace_id uuid not null,
  -- requested: claimed and counted, not yet sent. If it stays here the send's outcome is
  --            unknown, and it is never retried automatically.
  -- sent: the mail server accepted it. failed: it did not go, or its outcome is unknown.
  -- skipped: not sent, with the reason.
  status text not null check (status in ('requested', 'sent', 'failed', 'skipped')),
  reason text check (reason is null or length(reason) <= 200),
  check (status not in ('failed', 'skipped') or reason is not null),
  -- Set when a bounce or complaint for this send arrived later.
  bounced_at timestamptz,
  message_id uuid references discovery.messages (id) on delete set null,
  -- The day, in the campaign's timezone, the daily limit counts this send in.
  local_day date not null,
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (campaign_id, workspace_id) references discovery.outreach_campaigns (id, workspace_id) on delete cascade,
  foreign key (enrollment_id, campaign_id) references discovery.outreach_enrollments (id, campaign_id) on delete cascade,
  foreign key (step_id, campaign_id) references discovery.outreach_campaign_steps (id, campaign_id) on delete cascade,
  unique (enrollment_id, step_id)
);
create index outreach_sends_workspace_day_idx on discovery.outreach_sends (workspace_id, local_day);
create index outreach_sends_campaign_id_idx on discovery.outreach_sends (campaign_id);
create index outreach_sends_step_id_idx on discovery.outreach_sends (step_id);
create index outreach_sends_message_id_idx on discovery.outreach_sends (message_id);

-- An outcome is final: requested -> sent | failed | skipped, nothing else, and the row
-- never moves. Recording a later bounce is the one change allowed after that.
create function discovery.enforce_outreach_send_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.enrollment_id <> old.enrollment_id or new.step_id <> old.step_id or new.campaign_id <> old.campaign_id
     or new.workspace_id <> old.workspace_id or new.local_day <> old.local_day then
    raise exception 'A send record cannot be moved.' using errcode = '42501';
  end if;
  if old.status <> 'requested' and new.status is distinct from old.status then
    raise exception 'A send''s outcome is final.' using errcode = '42501';
  end if;
  if old.status = 'requested' and new.status <> 'requested' then
    new.finished_at := now();
  end if;
  return new;
end; $$;
create trigger outreach_sends_rules before update on discovery.outreach_sends
  for each row execute function discovery.enforce_outreach_send_rules();
revoke execute on function discovery.enforce_outreach_send_rules() from public, anon, authenticated;

-- Every campaign send is in core.audit_log: when it was claimed, how it ended, and a
-- bounce reported later. No address and no message text.
create function discovery.audit_outreach_send() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := new.status;
  elsif old.status = 'requested' and new.status <> 'requested' then
    v_event := new.status;
  elsif old.bounced_at is null and new.bounced_at is not null then
    v_event := 'bounced';
  else
    return null;
  end if;
  perform core.append_audit_log(
    discovery.business_id_of_workspace(new.workspace_id), null,
    'discovery_outreach_send.' || v_event, 'discovery_outreach_send', new.id,
    case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) else null end,
    jsonb_build_object(
      'campaignId', new.campaign_id, 'enrollmentId', new.enrollment_id, 'stepId', new.step_id,
      'messageId', new.message_id, 'status', new.status, 'reason', new.reason, 'localDay', new.local_day
    )
  );
  return null;
end; $$;
create trigger outreach_sends_audit after insert or update on discovery.outreach_sends
  for each row execute function discovery.audit_outreach_send();
revoke execute on function discovery.audit_outreach_send() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Access rules: tenant AND licensed (ADR-4, ADR-8)
-- ---------------------------------------------------------------------------------------

alter table discovery.outreach_campaigns enable row level security;
alter table discovery.outreach_campaign_steps enable row level security;
alter table discovery.outreach_templates enable row level security;
alter table discovery.outreach_enrollments enable row level security;
alter table discovery.outreach_sends enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['outreach_campaigns', 'outreach_campaign_steps', 'outreach_templates', 'outreach_enrollments'] loop
    execute format(
      'create policy "members can view %1$s in their workspaces" on discovery.%1$I for select
         using (workspace_id in (select discovery.readable_workspace_ids()))', t);
    execute format(
      'create policy "members can create %1$s in their workspaces" on discovery.%1$I for insert
         with check (workspace_id in (select discovery.writable_workspace_ids()))', t);
    execute format(
      'create policy "members can update %1$s in their workspaces" on discovery.%1$I for update
         using (workspace_id in (select discovery.writable_workspace_ids()))
         with check (workspace_id in (select discovery.writable_workspace_ids()))', t);
    execute format(
      'create policy "members can delete %1$s in their workspaces" on discovery.%1$I for delete
         using (workspace_id in (select discovery.writable_workspace_ids()))', t);
  end loop;
end $$;

-- Sends: members read; nobody but the service role writes. The privileges are revoked so
-- an attempt errors instead of silently matching nothing.
create policy "members can view outreach_sends in their workspaces"
  on discovery.outreach_sends for select
  using (workspace_id in (select discovery.readable_workspace_ids()));
revoke all on discovery.outreach_sends from anon, authenticated;
grant select on discovery.outreach_sends to authenticated;
grant all on discovery.outreach_sends to service_role;

-- ---------------------------------------------------------------------------------------
-- The one way a send comes to exist
-- ---------------------------------------------------------------------------------------

-- Idempotent per (enrollment, step): an existing row is returned with created = false, so
-- a retry, an overlapping tick or a redelivered event stops there. Otherwise every
-- condition is re-read under a per-workspace lock. A condition that may change (the
-- campaign is paused, the day's limit is used up, the mailbox is not verified) writes
-- nothing and returns status 'deferred' with the reason: the step stays due. p_skip_reason
-- records a send the caller already knows must not happen (a suppressed address, a
-- missing merge field), which is final for that step.
create function discovery.claim_outreach_send(p_enrollment_id uuid, p_step_id uuid, p_skip_reason text default null)
returns table (id uuid, status text, reason text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment discovery.outreach_enrollments;
  v_campaign discovery.outreach_campaigns;
  v_step discovery.outreach_campaign_steps;
  v_existing discovery.outreach_sends;
  v_row discovery.outreach_sends;
  v_business_id uuid;
  v_limit integer;
  v_day date;
  v_deferred text;
begin
  select * into v_enrollment from discovery.outreach_enrollments e where e.id = p_enrollment_id;
  if not found then
    raise exception 'Enrollment not found.' using errcode = '23503';
  end if;
  select * into v_step from discovery.outreach_campaign_steps s
  where s.id = p_step_id and s.campaign_id = v_enrollment.campaign_id;
  if not found then
    raise exception 'Step not found in this campaign.' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('discovery.outreach_sends:' || v_enrollment.workspace_id::text, 0));

  select * into v_existing from discovery.outreach_sends s
  where s.enrollment_id = p_enrollment_id and s.step_id = p_step_id;
  if found then
    return query select v_existing.id, v_existing.status, v_existing.reason, false;
    return;
  end if;

  -- Re-read under the lock: a pause or a stop may have landed while this call waited.
  select * into v_enrollment from discovery.outreach_enrollments e where e.id = p_enrollment_id;
  select * into v_campaign from discovery.outreach_campaigns c where c.id = v_enrollment.campaign_id;
  v_business_id := discovery.business_id_of_workspace(v_enrollment.workspace_id);

  begin
    v_day := (now() at time zone v_campaign.timezone)::date;
  exception when others then
    v_day := (now() at time zone 'UTC')::date;
  end;

  if v_business_id is null or not exists (
       select 1 from core.licenses l
       where l.business_id = v_business_id and l.module_key = 'discovery' and l.status = 'active') then
    v_deferred := 'not_licensed';
  elsif v_campaign.status <> 'active' then
    v_deferred := 'campaign_not_active';
  elsif v_enrollment.status <> 'active' then
    v_deferred := 'enrollment_not_active';
  elsif v_enrollment.next_step_position <> v_step.position then
    v_deferred := 'not_next_step';
  elsif p_skip_reason is null then
    select m.daily_limit into v_limit from discovery.sender_mailboxes m
    where m.workspace_id = v_enrollment.workspace_id and m.status = 'verified';
    if v_limit is null then
      v_deferred := 'mailbox_not_verified';
    elsif (select count(*) from discovery.outreach_sends s
           where s.workspace_id = v_enrollment.workspace_id and s.local_day = v_day and s.status <> 'skipped') >= v_limit then
      v_deferred := 'daily_limit';
    end if;
  end if;

  if v_deferred is not null then
    return query select null::uuid, 'deferred'::text, v_deferred, false;
    return;
  end if;

  insert into discovery.outreach_sends (enrollment_id, step_id, campaign_id, workspace_id, status, reason, local_day, finished_at)
  values (
    p_enrollment_id, p_step_id, v_enrollment.campaign_id, v_enrollment.workspace_id,
    case when p_skip_reason is null then 'requested' else 'skipped' end, p_skip_reason, v_day,
    case when p_skip_reason is null then null else now() end
  )
  returning * into v_row;

  return query select v_row.id, v_row.status, v_row.reason, true;
end;
$$;

revoke execute on function discovery.claim_outreach_send(uuid, uuid, text) from public, anon, authenticated;
grant execute on function discovery.claim_outreach_send(uuid, uuid, text) to service_role;

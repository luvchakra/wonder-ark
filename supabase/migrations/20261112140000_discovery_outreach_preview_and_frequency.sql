-- DISC-CAMP-P0-05.3 / DISC-CAMP-P0-05.4: preview before activation, and a campaign's own
-- frequency (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md).
--
-- 05.3  A campaign is activated only after a person looked at its preview and confirmed
--       it. The confirmation is a fact on the campaign, held by the database: activation
--       is refused without it, and any change to what was previewed (who is enrolled,
--       the schedule, the steps, a step's text, the address emails come from) clears
--       it, whichever code path made the change.
-- 05.4  A campaign may send fewer emails a day than its mailbox allows. Its own limit
--       is counted in the claim, under the same lock as the mailbox's, so both hold.
--       A follow-up may come as soon as one day after the email before it.
--
-- New columns, replaced functions and one relaxed check. Every existing row stays valid.
-- (20261112100000 to 20261112130000 are applied and frozen, so this is its own file.)

-- ---------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------

alter table discovery.outreach_campaigns
  -- When a person confirmed the preview, and who. Null: not confirmed, or changed since.
  add column preview_confirmed_at timestamptz,
  add column preview_confirmed_by uuid,
  -- Emails a day for this campaign. Null: the mailbox's own limit.
  add column daily_limit integer check (daily_limit is null or daily_limit between 1 and 200),
  -- When "Send me a test" was last used, newest last, at most the last few. Rate limit only.
  add column test_sent_at timestamptz[] not null default '{}';

-- A campaign that is already launched was launched under the earlier rule (Launch and its
-- confirmation dialog). It is treated as confirmed then, by whoever launched it, so it
-- can be paused and resumed. A draft has no confirmation.
update discovery.outreach_campaigns
set preview_confirmed_at = launched_at, preview_confirmed_by = launched_by
where status <> 'draft' and launched_at is not null;

-- A follow-up waits at least one day (it was two) and at most thirty.
alter table discovery.outreach_campaign_steps drop constraint outreach_campaign_steps_check;
alter table discovery.outreach_campaign_steps
  add constraint outreach_campaign_steps_check
    check ((position = 1 and delay_days = 0) or (position > 1 and delay_days between 1 and 30)) not valid;
-- `not valid`: a step saved under the earlier 2-to-60 rule is kept as it is; every new
-- or changed step is held to 1 to 30.

-- ---------------------------------------------------------------------------------------
-- The campaign's rules: activation needs a confirmed preview, and a change clears it
-- ---------------------------------------------------------------------------------------

create or replace function discovery.enforce_outreach_campaign_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A campaign starts as a draft.' using errcode = '42501';
    end if;
    -- A new campaign has nothing to have been previewed.
    new.preview_confirmed_at := null;
    new.preview_confirmed_by := null;
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

  -- What the preview showed. If any of it changes, the preview no longer describes the
  -- campaign, so its confirmation goes, even if this same update tries to set one.
  if new.audience is distinct from old.audience
     or new.send_days is distinct from old.send_days
     or new.send_from_hour is distinct from old.send_from_hour
     or new.send_to_hour is distinct from old.send_to_hour
     or new.timezone is distinct from old.timezone
     or new.auto_enroll is distinct from old.auto_enroll
     or new.include_unverified is distinct from old.include_unverified
     or new.personal_opening is distinct from old.personal_opening
     or new.daily_limit is distinct from old.daily_limit then
    new.preview_confirmed_at := null;
    new.preview_confirmed_by := null;
  elsif new.preview_confirmed_at is not null and old.preview_confirmed_at is null then
    -- Confirming: it is the person doing it, now. A member cannot confirm as someone else.
    new.preview_confirmed_at := now();
    new.preview_confirmed_by := coalesce(auth.uid(), new.preview_confirmed_by);
  elsif new.preview_confirmed_at is not null then
    -- An existing confirmation cannot be re-dated or re-attributed.
    new.preview_confirmed_at := old.preview_confirmed_at;
    new.preview_confirmed_by := old.preview_confirmed_by;
  else
    new.preview_confirmed_by := null;
  end if;

  if new.status = 'active' and old.status <> 'active' then
    if new.preview_confirmed_at is null then
      raise exception 'Preview the campaign and confirm it before activating it.' using errcode = '42501';
    end if;
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
revoke execute on function discovery.enforce_outreach_campaign_rules() from public, anon, authenticated;

-- A change to a step or to a step's text is a change to what was previewed.
create function discovery.clear_outreach_preview_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign_id uuid;
begin
  if tg_op = 'DELETE' then
    v_campaign_id := old.campaign_id;
  else
    v_campaign_id := new.campaign_id;
  end if;
  -- An update that leaves what the preview showed as it was is not a change to it. (Nested
  -- so a column is only read on the table that has it.)
  if tg_op = 'UPDATE' then
    if tg_table_name = 'outreach_templates' then
      if new.subject is not distinct from old.subject and new.body is not distinct from old.body
         and new.segment is not distinct from old.segment then
        return null;
      end if;
    elsif tg_table_name = 'outreach_campaign_steps' then
      if new.position = old.position and new.channel = old.channel and new.delay_days = old.delay_days then
        return null;
      end if;
    end if;
  end if;
  update discovery.outreach_campaigns
  set preview_confirmed_at = null, preview_confirmed_by = null
  where id = v_campaign_id and preview_confirmed_at is not null;
  return null;
end; $$;
revoke execute on function discovery.clear_outreach_preview_confirmation() from public, anon, authenticated;

create trigger outreach_campaign_steps_clear_preview
  after insert or update or delete on discovery.outreach_campaign_steps
  for each row execute function discovery.clear_outreach_preview_confirmation();
create trigger outreach_templates_clear_preview
  after insert or update or delete on discovery.outreach_templates
  for each row execute function discovery.clear_outreach_preview_confirmation();

-- The preview shows who each email is from. A different From name or address means the
-- campaigns of that workspace that are not running were previewed with another one.
create function discovery.clear_outreach_preview_on_mailbox_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.from_email is distinct from old.from_email or new.from_name is distinct from old.from_name then
    update discovery.outreach_campaigns
    set preview_confirmed_at = null, preview_confirmed_by = null
    where workspace_id = new.workspace_id and status in ('draft', 'paused') and preview_confirmed_at is not null;
  end if;
  return null;
end; $$;
revoke execute on function discovery.clear_outreach_preview_on_mailbox_change() from public, anon, authenticated;

create trigger sender_mailboxes_clear_preview
  after update on discovery.sender_mailboxes
  for each row execute function discovery.clear_outreach_preview_on_mailbox_change();

-- ---------------------------------------------------------------------------------------
-- The claim: the campaign's own daily limit, beside the mailbox's
-- ---------------------------------------------------------------------------------------

-- As before (20261112100000), with one more condition: a campaign that has its own limit
-- and has reached it for the day is deferred with 'campaign_daily_limit'. The mailbox's
-- limit is checked first and still counts every campaign of the workspace.
create or replace function discovery.claim_outreach_send(p_enrollment_id uuid, p_step_id uuid, p_skip_reason text default null)
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
    elsif v_campaign.daily_limit is not null
          and (select count(*) from discovery.outreach_sends s
               where s.campaign_id = v_campaign.id and s.local_day = v_day and s.status <> 'skipped') >= v_campaign.daily_limit then
      v_deferred := 'campaign_daily_limit';
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

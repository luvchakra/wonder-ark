-- PLATFORM-P1-13.1 / PLATFORM-P1-13.2 -- the public Careers pages and their WonderJobs
-- connection (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §43).
--
-- WonderJobs (https://jobs.wonderapps.biz) owns the jobs, the applications, every email,
-- reminders, decisions and deletion. This app only shows its data and forwards what an
-- applicant submits, so nothing here stores an applicant's details. Three things live
-- here:
--
--   1. `platform.careers_connection` -- the career-site key (wjcs_...), encrypted by the
--      application (AES-256-GCM, packages/core/src/crypto/api-key.ts, same helper and key
--      as every other stored secret) plus its last four characters for the mask. RLS on,
--      no policies, no grant to anon/authenticated: only the service role reads it, on the
--      server, immediately before calling WonderJobs (same shape as
--      platform.ai_provider_keys). A superadmin sees configured + last four through
--      careers_connection_status().
--   2. set_careers_key() / clear_careers_key() -- the only writes. Superadmin-checked,
--      and each records who and when in platform.audit_log with the last four
--      characters only, never the key or its ciphertext.
--   3. `platform.careers_rate_limits` -- an hourly per-client counter for the public apply
--      and withdraw forms. It holds a SHA-256 of the client address, never the address,
--      and windows older than a day are deleted as new ones are counted.
--
-- `careers` also joins the reserved business slugs: /careers is now a public top-level
-- route on the main address, and a business slugged `careers` would be shadowed by it.
-- Same shape as 20261010160000 (which reserved `legal`).

-- ---------------------------------------------------------------------------------------
-- Reserve `careers` as a business slug.
-- ---------------------------------------------------------------------------------------

update core.business_settings
set slug = slug || '-business'
where slug = 'careers'
  and not exists (select 1 from core.business_settings other where other.slug = 'careers-business');

-- Mirrors packages/core/src/lib/org-address.ts RESERVED_PREFIXES; keep the list in step.
create or replace function core.business_slug_problem(p_slug text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_slug is null then 'An address is required.'
    when p_slug <> lower(p_slug) then 'Use lowercase letters.'
    when length(p_slug) < 3 or length(p_slug) > 32 then 'Use 3 to 32 characters.'
    when p_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then 'Use letters, digits and hyphens, starting and ending with a letter or digit.'
    when p_slug like '%--%' then 'No double hyphens.'
    when p_slug = any (array[
      'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password', 'onboarding',
      'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing', 'invite', 'legal', 'careers',
      'www', 'app', 'admin', 'administrator', 'platform-admin', 'signin', 'sign-in', 'sign-up',
      'sso', 'oauth', 'mail', 'email', 'smtp', 'static', 'assets', 'cdn', 'media', 'files',
      'status', 'docs', 'support', 'billing', 'wonderark', 'wonderapps', 'root', 'system',
      'internal', 'test', 'demo', 'dev', 'staging', 'prod', 'production', 'localhost',
      'security', 'account', 'accounts', 'console', 'organizations', 'no-access', 'not-found',
      'service-unavailable', 'go', 'organization-not-found', 'organization-paused'
    ]) then 'That address is reserved.'
    else null
  end
$$;

-- ---------------------------------------------------------------------------------------
-- The career-site key.
-- ---------------------------------------------------------------------------------------

create table platform.careers_connection (
  id boolean primary key default true check (id),
  encrypted_key text not null,
  key_last4 text not null check (key_last4 ~ '^[A-Za-z0-9_-]{4}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table platform.careers_connection enable row level security;
revoke all on platform.careers_connection from public, anon, authenticated;
grant all on platform.careers_connection to service_role;

create function platform.careers_connection_status()
returns table (configured boolean, key_last4 text, updated_at timestamptz, updated_by uuid)
language plpgsql
stable
security definer
set search_path = platform
as $$
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
    select true, c.key_last4, c.updated_at, c.updated_by from platform.careers_connection c where c.id;
end;
$$;

create function platform.set_careers_key(p_encrypted_key text, p_key_last4 text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.careers_connection;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_encrypted_key is null or btrim(p_encrypted_key) = '' then
    raise exception 'A key is required.' using errcode = '22023';
  end if;
  if p_key_last4 is null or p_key_last4 !~ '^[A-Za-z0-9_-]{4}$' then
    raise exception 'The key''s last four characters are invalid.' using errcode = '22023';
  end if;

  select * into v_before from platform.careers_connection where id for update;

  insert into platform.careers_connection (id, encrypted_key, key_last4, updated_at, updated_by)
  values (true, p_encrypted_key, p_key_last4, now(), auth.uid())
  on conflict (id) do update
    set encrypted_key = excluded.encrypted_key, key_last4 = excluded.key_last4,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  -- The audit entry carries the last four characters only -- never the key or its ciphertext.
  perform platform.write_platform_audit_log(
    auth.uid(),
    case when v_before.id is null then 'created' else 'updated' end,
    'careers_connection',
    'wonderjobs',
    'high',
    null,
    case when v_before.id is null then null else jsonb_build_object('key_last4', v_before.key_last4) end,
    jsonb_build_object('key_last4', p_key_last4)
  );
end;
$$;

create function platform.clear_careers_key()
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.careers_connection;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  delete from platform.careers_connection where id returning * into v_before;
  if v_before.id is null then
    return;
  end if;

  perform platform.write_platform_audit_log(
    auth.uid(),
    'deleted',
    'careers_connection',
    'wonderjobs',
    'high',
    null,
    jsonb_build_object('key_last4', v_before.key_last4),
    null
  );
end;
$$;

revoke execute on function platform.careers_connection_status() from public, anon;
revoke execute on function platform.set_careers_key(text, text) from public, anon;
revoke execute on function platform.clear_careers_key() from public, anon;
grant execute on function platform.careers_connection_status() to authenticated;
grant execute on function platform.set_careers_key(text, text) to authenticated;
grant execute on function platform.clear_careers_key() to authenticated;

-- ---------------------------------------------------------------------------------------
-- Per-client rate limit for the public apply and withdraw forms.
-- ---------------------------------------------------------------------------------------

create table platform.careers_rate_limits (
  bucket text not null check (bucket in ('apply', 'status')),
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (bucket, client_hash, window_start)
);
create index careers_rate_limits_window_idx on platform.careers_rate_limits (window_start);

alter table platform.careers_rate_limits enable row level security;
revoke all on platform.careers_rate_limits from public, anon, authenticated;
grant all on platform.careers_rate_limits to service_role;

-- Atomic count-and-check for the current hour. Returns false once `p_limit` is passed.
-- Called by the server with the service role only: visitors are signed out.
create function platform.check_careers_rate_limit(p_bucket text, p_client_hash text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  delete from platform.careers_rate_limits where window_start < v_window - interval '1 day';

  insert into platform.careers_rate_limits (bucket, client_hash, window_start, request_count)
  values (p_bucket, p_client_hash, v_window, 1)
  on conflict (bucket, client_hash, window_start)
    do update set request_count = platform.careers_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function platform.check_careers_rate_limit(text, text, integer) from public, anon, authenticated;
grant execute on function platform.check_careers_rate_limit(text, text, integer) to service_role;

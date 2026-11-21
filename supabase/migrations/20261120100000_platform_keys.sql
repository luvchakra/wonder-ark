-- PLATFORM-P1-14.1 ("Platform Keys"): the platform's own keys and settings, set on the
-- Platform Admin portal instead of as deployment environment variables.
--
-- Until now every platform-wide credential except the AI provider keys
-- (platform.ai_provider_keys, PLATFORM-P0-09.2) lived only in the deployment's environment:
-- the email-sending key, the WorksLake gateway address and key, the payment provider's
-- keys and each webhook's secret. Changing one meant a hosting-dashboard edit and a
-- redeploy, and nothing recorded who changed it or why.
--
-- `platform.platform_keys` holds one row per named value. The value is encrypted by the
-- application (`encryptApiKey`, AES-256-GCM, the same module every stored secret uses)
-- before it reaches Postgres, so the plaintext never appears in a WAL record, a slow-query
-- log or a function argument. Beside it sit a display hint (the last four characters of a
-- secret, or the whole of a value that is not secret, such as a host name) and a
-- non-reversible fingerprint, which are all the admin page and the audit trail ever show.
--
-- Same lockdown as platform.ai_provider_keys:
--   - no SELECT/INSERT/UPDATE/DELETE grant or policy for `authenticated` at all, not even
--     for a SUPERADMIN. The running application reads values with the service role only
--     (packages/core/src/admin/platform-key-store.ts);
--   - every change goes through one of the two SECURITY DEFINER functions below, which
--     check `platform.is_superadmin()` themselves, require a reason, and write one
--     `platform.audit_log` row carrying the hint and fingerprint, never the ciphertext;
--   - `platform.platform_key_status()` is the only read path for the page: name, hint,
--     fingerprint and dates, to a SUPERADMIN only.
--
-- Which names exist, what each is for and which stay in the deployment is the
-- application's registry (packages/core/src/admin/platform-key-registry.ts). The database
-- checks only the shape of a name, so adding a key to the registry needs no migration.
--
-- Not tenant data and not a licensable module: like the rest of `platform.*`, never gated
-- by core.licenses.

create table platform.platform_keys (
  name text primary key check (name ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  encrypted_value text not null check (encrypted_value <> ''),
  -- What the admin page shows: "••••abcd" for a secret, the value itself when it is not one.
  value_hint text not null,
  value_fingerprint text not null,
  -- 'deployment' when the value was copied from the deployment's environment variable by
  -- "Import from deployment"; 'admin' when a person typed it.
  origin text not null default 'admin' check (origin in ('admin', 'deployment')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index platform_keys_updated_by_idx on platform.platform_keys (updated_by);

alter table platform.platform_keys enable row level security;

-- No policy and no grant to `authenticated`: a direct read or write is "permission denied",
-- not an empty result. `revoke` as well, because default privileges would grant it.
revoke all on platform.platform_keys from public, anon, authenticated;
grant all on platform.platform_keys to service_role;

-- Sets or replaces one value. `p_encrypted_value`, `p_value_hint` and `p_value_fingerprint`
-- arrive already computed by the application; the plaintext never reaches Postgres.
create function platform.set_platform_key(
  p_name text,
  p_encrypted_value text,
  p_value_hint text,
  p_value_fingerprint text,
  p_origin text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_existing platform.platform_keys;
  v_existed boolean;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can set a platform key.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to set a platform key.';
  end if;
  if p_name is null or p_name !~ '^[A-Z][A-Z0-9_]{2,63}$' then
    raise exception 'Unknown platform key.';
  end if;
  if p_encrypted_value is null or p_encrypted_value = '' then
    raise exception 'A value is required.';
  end if;
  if p_origin is null or p_origin not in ('admin', 'deployment') then
    raise exception 'Unknown origin.';
  end if;

  select * into v_existing from platform.platform_keys where name = p_name for update;
  v_existed := found;

  insert into platform.platform_keys (name, encrypted_value, value_hint, value_fingerprint, origin, updated_by)
  values (p_name, p_encrypted_value, coalesce(p_value_hint, ''), coalesce(p_value_fingerprint, ''), p_origin, auth.uid())
  on conflict (name) do update
  set encrypted_value = excluded.encrypted_value,
      value_hint = excluded.value_hint,
      value_fingerprint = excluded.value_fingerprint,
      origin = excluded.origin,
      updated_by = excluded.updated_by,
      updated_at = now();

  -- Hint and fingerprint only: the ciphertext never appears in an audit snapshot.
  perform platform.write_platform_audit_log(
    auth.uid(),
    case when v_existed then 'updated' else 'created' end,
    'platform_key',
    p_name,
    'high',
    btrim(p_reason),
    case when v_existed
      then jsonb_build_object('value_hint', v_existing.value_hint, 'value_fingerprint', v_existing.value_fingerprint, 'origin', v_existing.origin)
      else null end,
    jsonb_build_object('value_hint', coalesce(p_value_hint, ''), 'value_fingerprint', coalesce(p_value_fingerprint, ''), 'origin', p_origin)
  );
end;
$$;

revoke execute on function platform.set_platform_key(text, text, text, text, text, text) from public, anon;
grant execute on function platform.set_platform_key(text, text, text, text, text, text) to authenticated;

-- Removes one value. After this the application falls back to the deployment's environment
-- variable of the same name, if there is one.
create function platform.remove_platform_key(p_name text, p_reason text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_existing platform.platform_keys;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can remove a platform key.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to remove a platform key.';
  end if;

  select * into v_existing from platform.platform_keys where name = p_name for update;
  if not found then
    raise exception 'That platform key is not set.';
  end if;

  delete from platform.platform_keys where name = p_name;

  perform platform.write_platform_audit_log(
    auth.uid(),
    'deleted',
    'platform_key',
    p_name,
    'high',
    btrim(p_reason),
    jsonb_build_object('value_hint', v_existing.value_hint, 'value_fingerprint', v_existing.value_fingerprint, 'origin', v_existing.origin),
    null
  );
end;
$$;

revoke execute on function platform.remove_platform_key(text, text) from public, anon;
grant execute on function platform.remove_platform_key(text, text) to authenticated;

-- The page's only read path: which names are set, with their hint, fingerprint and dates.
-- Never the ciphertext. Zero rows (not an error) to anyone who is not a SUPERADMIN.
create function platform.platform_key_status()
returns table (
  name text,
  value_hint text,
  value_fingerprint text,
  origin text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = platform
as $$
  select k.name, k.value_hint, k.value_fingerprint, k.origin, k.updated_at
  from platform.platform_keys k
  where platform.is_superadmin()
  order by k.name;
$$;

revoke execute on function platform.platform_key_status() from public, anon;
grant execute on function platform.platform_key_status() to authenticated;

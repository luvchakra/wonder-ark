-- DISC-AUTO-P0-03.1: "Send automatically" for first outreach emails (owner-approved
-- 2026-11-22, opt-in). Off by default. When a business turns it on, the first email WonderArk
-- drafts for a prospect the person approved is sent without a separate Send, within the
-- mailbox's daily limit, through the same send path (suppression, idempotent claim, audit) as
-- a Send press. Changing it needs business.settings.manage (the table's own RLS) and is
-- written to the audit log by the trigger below, whichever path changed it.

alter table core.business_settings
  add column discovery_auto_send boolean not null default false;

create function core.log_discovery_auto_send_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.discovery_auto_send is distinct from old.discovery_auto_send then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'discovery.auto_send_changed', 'business_settings', new.business_id,
      jsonb_build_object('discovery_auto_send', old.discovery_auto_send),
      jsonb_build_object('discovery_auto_send', new.discovery_auto_send)
    );
  end if;
  return new;
end;
$$;

revoke execute on function core.log_discovery_auto_send_change() from public, anon, authenticated;

create trigger business_settings_log_discovery_auto_send
  after update on core.business_settings
  for each row execute function core.log_discovery_auto_send_change();

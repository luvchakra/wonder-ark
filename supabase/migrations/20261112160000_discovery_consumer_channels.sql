-- DISC-CONS-P0-01.1/01.2/02.2: consumer discovery, the channel side
-- (docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md, Part B, package B5.1 and B5.2).
--
-- Additive only. Checked 00-MASTER-PLAN.md §5 first: the Ideal user is part of the
-- existing ICP record (a column, not a table), and a channel's community post is
-- marketing content (the existing discovery.marketing_content tables), so no table is
-- created here.
--
-- Grants: covered by the schema-wide default privileges on `discovery`
-- (20260907120000_grant_schema_privileges.sql). Every table touched keeps its existing
-- `tenant AND licensed` policies.

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-01.1: "Who buys this?" is a question the person answers
-- ---------------------------------------------------------------------------------------

-- products.audience_type (20261111100000) defaults to 'business' for every offering, so
-- the stored value cannot tell an answer from the default. Set when a person saves the
-- answer; until then the setup screen preselects what the offering profile suggests and
-- asks for confirmation.
alter table discovery.products
  add column audience_confirmed_at timestamptz;

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-01.2: the Ideal user, beside the company fields on the same ICP record
-- ---------------------------------------------------------------------------------------

-- Same draft, approve and version flow as the company fields: it lives on the row
-- (icp_profiles) and in every snapshot of it (icp_profile_versions). Null for an
-- offering sold to companies only. The shape is checked in code (lib/icp/audience.ts).
alter table discovery.icp_profiles
  add column audience jsonb check (audience is null or jsonb_typeof(audience) = 'object');
alter table discovery.icp_profile_versions
  add column audience jsonb check (audience is null or jsonb_typeof(audience) = 'object');

-- offering_feedback.field_name is a closed list kept in sync by hand with
-- ICP_CONTENT_FIELDS (lib/offerings/offering-feedback.ts). The Ideal user's fields join
-- it, prefixed `audience_`, in the same order as AUDIENCE_FEEDBACK_FIELDS there.
alter table discovery.offering_feedback
  drop constraint offering_feedback_field_name_check;
alter table discovery.offering_feedback
  add constraint offering_feedback_field_name_check check (
    field_name in (
      'name', 'description', 'industries', 'company_sizes', 'geographies', 'roles',
      'pain_points', 'buying_signals', 'exclusions', 'revenue', 'business_model',
      'technology', 'growth_stage', 'existing_tools',
      'audience_who', 'audience_goals', 'audience_triggers', 'audience_current_solutions',
      'audience_interests', 'audience_online_places', 'audience_offline_places', 'audience_words'
    )
  );

-- ---------------------------------------------------------------------------------------
-- DISC-CONS-P0-02.2: a community post drafted for a channel prospect
-- ---------------------------------------------------------------------------------------

-- The post draft is ordinary marketing content (its versions carry origin
-- 'ai_generated'), tied to the channel it was written for. WonderArk never posts it: the
-- person copies it, posts it themselves and marks it posted with the link
-- (external_url, published_at). A prospect that is removed leaves the content in place.
alter table discovery.marketing_content
  add column prospect_id uuid references discovery.prospects (id) on delete set null;

create index marketing_content_prospect_id_idx
  on discovery.marketing_content (prospect_id) where prospect_id is not null;

-- marketing_content is keyed by business_id; a prospect by workspace_id. A foreign key
-- cannot say "the same business", so this trigger does: the prospect must belong to an
-- offering of the content's own business. Security invoker on purpose: for a signed-in
-- member, RLS also hides another tenant's prospect, so it is refused either way.
create function discovery.marketing_content_prospect_same_business()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.prospect_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from discovery.prospects p
    join discovery.workspaces w on w.id = p.workspace_id
    join discovery.products pr on pr.id = w.product_id
    where p.id = new.prospect_id and pr.business_id = new.business_id
  ) then
    raise exception 'The prospect does not belong to this business.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger marketing_content_prospect_same_business
  before insert or update of prospect_id, business_id on discovery.marketing_content
  for each row execute function discovery.marketing_content_prospect_same_business();

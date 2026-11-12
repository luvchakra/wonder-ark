-- DISC-CAMP-P0-03.2: the optional AI-written personal opening line.
--
-- When a campaign has "Personal opening line" on, the first email to each prospect
-- starts with one sentence written for that company. The sentence is written once and
-- kept here, keyed by what it was written from (input_hash, which includes the prompt
-- version), so the preview, the test send and the tick all use the same sentence and
-- the model is not asked again. A changed prompt or prospect record gives a new hash
-- and a new line. ai_run_id ties the line to its row in discovery.ai_runs (provenance).
--
-- Members read; only the service role writes, after the library has authorised the
-- caller and validated the sentence.

create table discovery.outreach_opening_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  input_hash text not null,
  prompt_version text not null,
  line text not null check (length(line) between 1 and 300),
  ai_run_id uuid,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references discovery.outreach_campaigns (id, workspace_id) on delete cascade,
  unique (campaign_id, prospect_id, input_hash)
);

create index outreach_opening_lines_workspace_idx on discovery.outreach_opening_lines (workspace_id);
create index outreach_opening_lines_prospect_idx on discovery.outreach_opening_lines (prospect_id);

alter table discovery.outreach_opening_lines enable row level security;

create policy "members can view outreach_opening_lines in their workspaces"
  on discovery.outreach_opening_lines for select
  using (workspace_id in (select discovery.readable_workspace_ids()));

revoke all on discovery.outreach_opening_lines from anon, authenticated;
grant select on discovery.outreach_opening_lines to authenticated;
grant all on discovery.outreach_opening_lines to service_role;

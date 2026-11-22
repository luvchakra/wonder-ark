-- DISC-PROS-P0-08.1 ("Select first"): a prospect is picked for work before anything is done
-- with it. The Prospects page's first tab, Select, lists the offering's prospects nobody has
-- picked yet; picking them ("Use these") sets `shortlisted_at`, and from then on they are in
-- the offering's working list (Channels, Companies), where research, scoring and campaigns
-- happen. "Back to Select" clears it again. Nothing is deleted either way.
--
-- Additive: one nullable column and one index. RLS is unchanged: the column belongs to the
-- row, so the existing tenant-and-licensed policies on discovery.prospects already govern
-- who may read and set it.
--
-- Every prospect that already exists is treated as picked, so nothing anyone is working on
-- moves: only prospects added from now on wait in Select.

alter table discovery.prospects add column shortlisted_at timestamptz;

update discovery.prospects set shortlisted_at = coalesce(updated_at, created_at, now()) where shortlisted_at is null;

create index prospects_workspace_shortlisted_idx on discovery.prospects (workspace_id, shortlisted_at);

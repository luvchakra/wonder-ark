-- DISC-DATA-P0-02.3: record a prospect-data search beside the AI runs.
--
-- discovery.ai_runs is the one usage ledger Usage and History read. A call to the
-- WorksLake gateway is recorded there too, rather than in a second trace, so a search of
-- stored business data appears next to an AI web search. Three nullable columns say what
-- an AI run has no need to: which source was asked, how many results came back, and how
-- many of the business's lookup units the call spent.
--
-- Additive: every existing row keeps null in all three, and no existing reader selects
-- them.
alter table discovery.ai_runs
  add column source text,
  add column result_count integer check (result_count is null or result_count >= 0),
  add column units_spent integer check (units_spent is null or units_spent >= 0);

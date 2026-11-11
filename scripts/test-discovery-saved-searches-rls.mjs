#!/usr/bin/env node
/**
 * DISC-DATA-P0-01.1/01.2/01.3/01.4 (docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md, B1 and B8):
 * tenant-isolation and licence-gating test for discovery.saved_searches, plus the
 * database-level rules of the columns the same migration adds.
 *
 * Proves: each tenant reads and writes only its own saved search; an expired Discovery
 * licence hides the row (kept, not deleted) until it is reactivated, and a licence in
 * its read-only grace period can read but not write -- `tenant AND licensed`, ADR-9; one
 * saved search per offering; the same source record cannot be staged twice as a
 * suggestion, while AI web-search rows (no external id) never collide; existing rows
 * stay valid under the new defaults and checks.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "41111111-1111-1111-1111-111111111111";
const BOB = "42222222-2222-2222-2222-222222222222";
const REQUEST = `'{"kind":"business","query":"electrician","providers":["stored"]}'::jsonb`;

async function main() {
  await withTestDatabase({
    dbNamePrefix: "discovery_saved_searches_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding two tenants, each with one offering and one saved search...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-saved@example.com'), ('${BOB}', 'bob-saved@example.com');
        grant usage on schema discovery to authenticated;
        grant select, insert, update, delete on all tables in schema discovery to authenticated;
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        do $$
        declare
          v_user uuid; v_account uuid; v_business uuid; v_product uuid; v_workspace uuid;
        begin
          foreach v_user in array array['${ALICE}'::uuid, '${BOB}'::uuid] loop
            select account_id into v_account from core.account_members where user_id = v_user;
            insert into core.businesses (account_id, name) values (v_account, case when v_user = '${ALICE}' then 'Alice Co' else 'Bob Co' end) returning id into v_business;
            insert into core.licenses (account_id, business_id, module_key, status) values (v_account, v_business, 'discovery', 'active');
            insert into discovery.products (business_id, name) values (v_business, 'Product of ' || v_user) returning id into v_product;
            select id into v_workspace from discovery.workspaces where product_id = v_product;
            insert into discovery.saved_searches (workspace_id, request) values (v_workspace, ${REQUEST});
            insert into discovery.prospects (workspace_id, company_name) values (v_workspace, 'Prospect of ' || v_user);
            insert into discovery.prospect_suggestions (workspace_id, company_name) values (v_workspace, 'AI find one'), (v_workspace, 'AI find two');
          end loop;
        end $$;
      `);
      const workspaceOf = (name) =>
        psql(`select w.id from discovery.workspaces w join discovery.products p on p.id = w.product_id join core.businesses b on b.id = p.business_id where b.name = '${name}'`);
      const aliceWorkspace = workspaceOf("Alice Co");
      const bobWorkspace = workspaceOf("Bob Co");

      console.log("Verifying the new columns' defaults keep rows valid...");
      assertEqual(psql(`select count(*) from discovery.products where audience_type = 'business'`), "2", "an offering defaults to audience 'business'");
      assertEqual(psql(`select count(*) from discovery.prospects where kind = 'company' and field_sources = '{}'::jsonb and source is null`), "2", "a prospect defaults to kind 'company' with no source");
      assertEqual(psql(`select count(*) from discovery.prospect_suggestions where kind = 'company' and external_id is null`), "4", "suggestions without an external id (AI web search) never collide");
      assertEqual(psql(`select kind || ':' || enabled from discovery.saved_searches where workspace_id = '${aliceWorkspace}'`), "company:true", "a saved search defaults to kind 'company', enabled");
      assertThrows(() => psql(`update discovery.products set audience_type = 'everyone'`), "an unknown audience type is refused");
      assertThrows(() => psql(`update discovery.prospects set kind = 'person'`), "an unknown prospect kind is refused");
      assertThrows(
        () => psql(`insert into discovery.contacts (workspace_id, prospect_id, email_status) select workspace_id, id, 'guessed' from discovery.prospects limit 1`),
        "an unknown email status is refused",
      );

      console.log("Verifying each tenant reads only its own saved search...");
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.saved_searches`), "1", "Alice reads only her own saved search");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.saved_searches`), "1", "Bob reads only his own saved search");
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.saved_searches where workspace_id = '${bobWorkspace}'`), "0", "none of Alice's visible saved searches are Bob's");

      console.log("Verifying a tenant can't write into another's workspace...");
      psql(`delete from discovery.saved_searches where workspace_id = '${bobWorkspace}'`);
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.saved_searches (workspace_id, request) values ('${bobWorkspace}', ${REQUEST})`),
        "Alice can't save a search in Bob's workspace",
      );
      psql(`insert into discovery.saved_searches (workspace_id, request) values ('${bobWorkspace}', ${REQUEST})`);
      psqlAs(ALICE, `update discovery.saved_searches set enabled = false where workspace_id = '${bobWorkspace}'`);
      assertEqual(psql(`select enabled from discovery.saved_searches where workspace_id = '${bobWorkspace}'`), "t", "Alice's update to Bob's saved search changes nothing");
      psqlAs(ALICE, `delete from discovery.saved_searches where workspace_id = '${bobWorkspace}'`);
      assertEqual(psql(`select count(*) from discovery.saved_searches where workspace_id = '${bobWorkspace}'`), "1", "Alice's delete of Bob's saved search removes nothing");
      assertThrows(
        () => psqlAs(ALICE, `update discovery.saved_searches set workspace_id = '${bobWorkspace}' where workspace_id = '${aliceWorkspace}'`),
        "Alice can't move her saved search into Bob's workspace",
      );

      console.log("Verifying one saved search per offering...");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.saved_searches (workspace_id, request) values ('${aliceWorkspace}', ${REQUEST})`),
        "a second saved search for the same offering is refused",
      );
      psqlAs(ALICE, `update discovery.saved_searches set enabled = false where workspace_id = '${aliceWorkspace}'`);
      assertEqual(psql(`select enabled from discovery.saved_searches where workspace_id = '${aliceWorkspace}'`), "f", "Alice can pause her own saved search");

      console.log("Verifying the same source record can't be staged twice...");
      const staged = `insert into discovery.prospect_suggestions (workspace_id, company_name, source, source_name, source_ref, external_id, payload) values ('${aliceWorkspace}', 'Shree Electricals', 'stored', 'OpenStreetMap contributors (ODbL)', 'https://www.openstreetmap.org/node/123', 'businesses_3f9a', '{"id":"businesses_3f9a"}'::jsonb)`;
      psqlAs(ALICE, staged);
      assertThrows(() => psqlAs(ALICE, staged), "staging the same source record again is refused");
      psqlAs(ALICE, `${staged} on conflict (workspace_id, source, external_id) do nothing`);
      assertEqual(psql(`select count(*) from discovery.prospect_suggestions where external_id = 'businesses_3f9a'`), "1", "an 'on conflict do nothing' insert adds no duplicate");
      psql(`insert into discovery.prospect_suggestions (workspace_id, company_name, source, external_id) values ('${bobWorkspace}', 'Shree Electricals', 'stored', 'businesses_3f9a')`);
      assertEqual(psql(`select count(*) from discovery.prospect_suggestions where external_id = 'businesses_3f9a'`), "2", "the same record may be staged in another tenant's workspace");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.prospect_suggestions (workspace_id, company_name, source, external_id) values ('${bobWorkspace}', 'Planted', 'stored', 'businesses_planted')`),
        "Alice can't stage a suggestion in Bob's workspace",
      );

      console.log("Verifying the run ledger takes a data-source run...");
      psqlAs(ALICE, `insert into discovery.ai_runs (workspace_id, operation, model, provider, prompt_version, input_hash, status, source, result_count, units_spent) values ('${aliceWorkspace}', 'gateway_search', 'workslake-gateway', 'workslake', 'prospects-api-v1', 'hash', 'succeeded', 'stored', 1, 0)`);
      assertEqual(psqlAs(ALICE, `select source || ':' || result_count || ':' || units_spent from discovery.ai_runs where operation = 'gateway_search'`), "stored:1:0", "a data-source run records its source, result count and units spent");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.ai_runs where operation = 'gateway_search'`), "0", "Bob can't see Alice's data-source run");

      console.log("Verifying a licence in its read-only grace period reads but does not write...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '30 days' from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.saved_searches`), "1", "grace: Alice still reads her saved search");
      psqlAs(ALICE, `update discovery.saved_searches set enabled = true where workspace_id = '${aliceWorkspace}'`);
      assertEqual(psql(`select enabled from discovery.saved_searches where workspace_id = '${aliceWorkspace}'`), "f", "grace: Alice's update changes nothing");

      console.log("Verifying an expired Discovery licence hides the row without deleting it...");
      psql(`update core.licenses set status = 'expired' from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.saved_searches`), "0", "expired licence: Alice reads no saved search");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.saved_searches (workspace_id, request) values ('${aliceWorkspace}', ${REQUEST})`),
        "expired licence: Alice can't save a search",
      );
      assertEqual(psql(`select count(*) from discovery.saved_searches`), "2", "the rows are still there (never deleted)");
      psql(`update core.licenses set status = 'active', grace_ends_at = null from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.saved_searches`), "1", "reactivated: Alice's saved search is back");

      console.log("\nAll saved-search and prospect data-model checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

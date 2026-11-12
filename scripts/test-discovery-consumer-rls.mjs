#!/usr/bin/env node
/**
 * DISC-CONS-P0-01.1/01.2/02.2 (docs/plan/17-DISCOVERY-DATA-AND-CONSUMER.md, B5): what the
 * database guarantees for consumer discovery's channel side
 * (20261112160000_discovery_consumer_channels.sql).
 *
 * Proves: "Who buys this?" and its confirmation are written only by the offering's own
 * tenant; the Ideal user is an object on the ICP and its versions, isolated per tenant
 * and hidden (not deleted) without a licence; offering_feedback takes the Ideal user's
 * field names and still refuses any other; a channel's community post (marketing
 * content) can be tied only to a prospect of the content's own business, whoever writes
 * it, the service role included; each tenant reads only its own channel posts.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "61111111-1111-1111-1111-111111111111";
const BOB = "62222222-2222-2222-2222-222222222222";
const AUDIENCE = `'{"who":"Parents of toddlers","interests":["sleep"]}'::jsonb`;

async function main() {
  await withTestDatabase({
    dbNamePrefix: "discovery_consumer_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding two tenants, each with a consumer offering, an ICP and a channel prospect...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'e2e-qa-alice-consumer@example.com'), ('${BOB}', 'e2e-qa-bob-consumer@example.com');
        grant usage on schema discovery to authenticated;
        grant select, insert, update, delete on all tables in schema discovery to authenticated;
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        do $$
        declare
          v_user uuid; v_account uuid; v_business uuid; v_product uuid; v_workspace uuid; v_icp uuid;
        begin
          foreach v_user in array array['${ALICE}'::uuid, '${BOB}'::uuid] loop
            select account_id into v_account from core.account_members where user_id = v_user;
            insert into core.businesses (account_id, name) values (v_account, case when v_user = '${ALICE}' then 'Alice Co' else 'Bob Co' end) returning id into v_business;
            insert into core.licenses (account_id, business_id, module_key, status) values (v_account, v_business, 'discovery', 'active');
            insert into discovery.products (business_id, name) values (v_business, 'Product of ' || v_user) returning id into v_product;
            select id into v_workspace from discovery.workspaces where product_id = v_product;
            insert into discovery.icp_profiles (workspace_id, name, audience) values (v_workspace, 'Ideal user', ${AUDIENCE}) returning id into v_icp;
            insert into discovery.prospects (workspace_id, company_name, kind, channel_type, audience_size)
              values (v_workspace, 'Channel of ' || v_user, 'channel', 'youtube_channel', 1000);
          end loop;
        end $$;
      `);
      const productOf = (name) => psql(`select p.id from discovery.products p join core.businesses b on b.id = p.business_id where b.name = '${name}'`);
      const businessOf = (name) => psql(`select id from core.businesses where name = '${name}'`);
      const prospectOf = (name) =>
        psql(`select pr.id from discovery.prospects pr join discovery.workspaces w on w.id = pr.workspace_id join discovery.products p on p.id = w.product_id join core.businesses b on b.id = p.business_id where b.name = '${name}'`);
      const aliceProduct = productOf("Alice Co");
      const bobProduct = productOf("Bob Co");
      const aliceBusiness = businessOf("Alice Co");
      const bobBusiness = businessOf("Bob Co");
      const aliceProspect = prospectOf("Alice Co");
      const bobProspect = prospectOf("Bob Co");

      console.log("Verifying 'Who buys this?' is the offering's own tenant's to answer (DISC-CONS-P0-01.1)...");
      assertEqual(psql(`select count(*) from discovery.products where audience_confirmed_at is null`), "2", "no offering starts confirmed");
      psqlAs(ALICE, `update discovery.products set audience_type = 'consumer', audience_confirmed_at = now() where id = '${aliceProduct}'`);
      assertEqual(psql(`select audience_type || ':' || (audience_confirmed_at is not null) from discovery.products where id = '${aliceProduct}'`), "consumer:true", "Alice answers for her own offering");
      psqlAs(ALICE, `update discovery.products set audience_type = 'consumer', audience_confirmed_at = now() where id = '${bobProduct}'`);
      assertEqual(psql(`select audience_type || ':' || (audience_confirmed_at is null) from discovery.products where id = '${bobProduct}'`), "business:true", "Alice's answer for Bob's offering changes nothing");

      console.log("Verifying the Ideal user lives on the ICP and its versions (DISC-CONS-P0-01.2)...");
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.icp_profiles where audience->>'who' = 'Parents of toddlers'`), "1", "Alice reads only her own Ideal user");
      assertThrows(() => psql(`update discovery.icp_profiles set audience = '["not","an","object"]'::jsonb`), "an Ideal user that is not an object is refused");
      psqlAs(ALICE, `insert into discovery.icp_profile_versions (workspace_id, icp_id, version, source, name, status, audience)
        select workspace_id, id, 1, 'ai_generated', name, status, audience from discovery.icp_profiles`);
      assertEqual(psql(`select count(*) from discovery.icp_profile_versions where audience is not null`), "1", "a version snapshots the Ideal user, and Alice snapshots only her own ICP");
      assertThrows(
        () => psql(`insert into discovery.icp_profile_versions (workspace_id, icp_id, version, source, name, status, audience) select workspace_id, id, 9, 'user_edit', name, status, '"text"'::jsonb from discovery.icp_profiles limit 1`),
        "a version's Ideal user must be an object too",
      );

      console.log("Verifying offering feedback takes the Ideal user's fields and nothing else...");
      const feedback = (field) =>
        `insert into discovery.offering_feedback (workspace_id, icp_id, field_name, ai_value, user_value) select workspace_id, id, '${field}', '["a"]', '["b"]' from discovery.icp_profiles where audience is not null and workspace_id in (select discovery.user_workspace_ids())`;
      for (const field of ["audience_who", "audience_goals", "audience_words", "industries"]) psqlAs(ALICE, feedback(field));
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.offering_feedback`), "4", "the Ideal user's fields and the company fields are both accepted");
      assertThrows(() => psqlAs(ALICE, feedback("audience_salary")), "a field name outside the closed list is refused");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.offering_feedback`), "0", "Bob can't read Alice's feedback");

      console.log("Verifying a channel post can be tied only to a prospect of its own business (DISC-CONS-P0-02.2)...");
      const post = (business, prospect) =>
        `insert into discovery.marketing_content (business_id, title, content_type, body, status, prospect_id) values ('${business}', 'e2e-qa post', 'social', 'Hello', 'draft', '${prospect}')`;
      psqlAs(ALICE, post(aliceBusiness, aliceProspect));
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.marketing_content where prospect_id = '${aliceProspect}'`), "1", "Alice ties a post to her own channel");
      assertThrows(() => psqlAs(ALICE, post(aliceBusiness, bobProspect)), "Alice can't tie her post to Bob's channel");
      assertThrows(() => psql(post(aliceBusiness, bobProspect)), "not even the service role can tie a post to another business's channel");
      assertThrows(
        () => psql(`update discovery.marketing_content set prospect_id = '${bobProspect}' where business_id = '${aliceBusiness}'`),
        "an existing post can't be moved onto another business's channel",
      );
      assertThrows(() => psqlAs(ALICE, post(bobBusiness, bobProspect)), "Alice can't write a post into Bob's business");
      psql(post(bobBusiness, bobProspect));
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.marketing_content`), "1", "Alice reads only her own channel post");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.marketing_content where prospect_id = '${aliceProspect}'`), "0", "Bob can't read Alice's channel post");
      psql(`delete from discovery.prospects where id = '${aliceProspect}'`);
      assertEqual(psql(`select count(*) from discovery.marketing_content where business_id = '${aliceBusiness}' and prospect_id is null`), "1", "removing the channel keeps the post");

      console.log("Verifying an expired Discovery licence hides the Ideal user without deleting it...");
      psql(`update core.licenses set status = 'expired' where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.icp_profiles`), "0", "expired licence: Alice reads no ICP");
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.marketing_content`), "0", "expired licence: Alice reads no channel post");
      psqlAs(ALICE, `update discovery.products set audience_type = 'both' where id = '${aliceProduct}'`);
      assertEqual(psql(`select audience_type from discovery.products where id = '${aliceProduct}'`), "consumer", "expired licence: Alice can't change who buys it");
      assertEqual(psql(`select count(*) from discovery.icp_profiles where audience is not null`), "2", "the Ideal users are still there (never deleted)");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.icp_profiles`), "1", "reactivated: Alice's ICP is back");

      console.log("\nAll consumer discovery channel-side checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

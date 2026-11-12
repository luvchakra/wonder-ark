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
 *
 * DISC-CONS-P0-03.1/03.2/04.1/04.2/05.2 (20261112170000_discovery_audience_leads.sql), the
 * people side: each tenant reads and writes only its own sign-up page, people, feedback
 * and themes; an expired licence hides them (kept) and grace reads without writing; a
 * member cannot read a person's private token; anon can touch none of it; the public
 * page (the service role) cannot write a person into another workspace through a
 * referral, nor feedback across workspaces; one address once per offering, whatever its
 * case; consent is required for sign-ups and imports; feedback and themes are
 * append-only; a member cannot move a person out of "unsubscribed"; only the service
 * role may count sign-up attempts, and the count stops at its limit.
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

      // -----------------------------------------------------------------------------
      // Part 2: the people side (20261112170000)
      // -----------------------------------------------------------------------------
      const workspaceOf = (name) =>
        psql(`select w.id from discovery.workspaces w join discovery.products p on p.id = w.product_id join core.businesses b on b.id = p.business_id where b.name = '${name}'`);
      const aliceWs = workspaceOf("Alice Co");
      const bobWs = workspaceOf("Bob Co");
      const hex = (c, n) => c.repeat(n);
      const lead = (ws, email, code, token, extra = "") =>
        `insert into discovery.audience_leads (workspace_id, email, source, consent_text, consent_at, referral_code, lead_token${extra ? ", referrer_lead_id" : ""}) values ('${ws}', '${email}', 'waitlist', 'I agree', now(), '${code}', '${token}'${extra ? `, ${extra}` : ""})`;

      console.log("Verifying the public page writes only into its own workspace (DISC-CONS-P0-03.2)...");
      psql(lead(aliceWs, "e2e-qa-asha@example.com", hex("a", 16), hex("a", 48)));
      psql(lead(bobWs, "e2e-qa-bharat@example.com", hex("b", 16), hex("b", 48)));
      const aliceLead = psql(`select id from discovery.audience_leads where workspace_id = '${aliceWs}'`);
      const bobLead = psql(`select id from discovery.audience_leads where workspace_id = '${bobWs}'`);
      assertThrows(
        () => psql(lead(aliceWs, "e2e-qa-cross@example.com", hex("c", 16), hex("c", 48), `'${bobLead}'`)),
        "even the service role cannot sign someone up in Alice's list through a referral from Bob's",
      );
      psql(lead(aliceWs, "e2e-qa-friend@example.com", hex("d", 16), hex("d", 48), `'${aliceLead}'`));
      assertEqual(psql(`select count(*) from discovery.audience_leads where referrer_lead_id = '${aliceLead}'`), "1", "a referral within the same list is recorded");
      assertThrows(() => psql(lead(aliceWs, "E2E-QA-ASHA@example.com", hex("e", 16), hex("e", 48))), "the same address in another case is the same person on one list");
      psql(lead(bobWs, "e2e-qa-asha@example.com", hex("f", 16), hex("f", 48)));
      assertThrows(
        () => psql(`insert into discovery.audience_leads (workspace_id, email, source, referral_code, lead_token) values ('${aliceWs}', 'e2e-qa-noconsent@example.com', 'waitlist', '${hex("1", 16)}', '${hex("1", 48)}')`),
        "a sign-up without consent is refused",
      );
      assertThrows(
        () => psql(`insert into discovery.audience_leads (workspace_id, email, source, referral_code, lead_token) values ('${aliceWs}', 'e2e-qa-imp@example.com', 'import', '${hex("2", 16)}', '${hex("2", 48)}')`),
        "an import without consent is refused",
      );
      psql(`insert into discovery.audience_leads (workspace_id, email, source, referral_code, lead_token) values ('${aliceWs}', 'e2e-qa-manual@example.com', 'manual', '${hex("3", 16)}', '${hex("3", 48)}')`);
      assertThrows(() => psql(`insert into discovery.audience_leads (workspace_id, email, source, consent_text, consent_at, referral_code, lead_token) values ('${aliceWs}', 'not-an-address', 'manual', null, null, '${hex("4", 16)}', '${hex("4", 48)}')`), "an address without an @ is refused");

      console.log("Verifying anon has no access and a member never reads a private token...");
      const asAnon = (sql) => psql(`set local role anon; ${sql}`);
      assertThrows(() => asAnon(`select count(*) from discovery.audience_leads`), "anon cannot read people");
      assertThrows(() => asAnon(lead(aliceWs, "e2e-qa-anon@example.com", hex("5", 16), hex("5", 48))), "anon cannot write a person");
      assertThrows(() => asAnon(`select discovery.take_signup_attempt('k', 60, 3)`), "anon cannot count sign-up attempts");
      assertThrows(() => psqlAs(ALICE, `select discovery.take_signup_attempt('k', 60, 3)`), "a member cannot count sign-up attempts");
      assertThrows(() => psqlAs(ALICE, `select lead_token from discovery.audience_leads`), "a member cannot read a person's private token");
      assertThrows(() => psqlAs(ALICE, `select * from discovery.audience_leads`), "a member's select * is refused rather than returning the token");
      assertEqual(psql(`select string_agg(discovery.take_signup_attempt('page:e2e-qa', 60, 2)::text, ',') from generate_series(1, 3)`), "true,true,false", "the attempt count stops at its limit");

      console.log("Verifying each tenant reads and writes only its own people...");
      const COLS = "id, email, status";
      assertEqual(psqlAs(ALICE, `select count(*) from (select ${COLS} from discovery.audience_leads) l`), "3", "Alice reads only her own people");
      assertEqual(psqlAs(BOB, `select count(*) from (select ${COLS} from discovery.audience_leads) l`), "2", "Bob reads only his own people");
      assertThrows(() => psqlAs(ALICE, lead(bobWs, "e2e-qa-planted@example.com", hex("6", 16), hex("6", 48))), "Alice cannot add a person to Bob's list");
      psqlAs(ALICE, `update discovery.audience_leads set tags = '{planted}' where id = '${bobLead}'`);
      assertEqual(psql(`select tags::text from discovery.audience_leads where id = '${bobLead}'`), "{}", "Alice's update to Bob's person changes nothing");
      psqlAs(ALICE, `delete from discovery.audience_leads where id = '${bobLead}'`);
      assertEqual(psql(`select count(*) from discovery.audience_leads where id = '${bobLead}'`), "1", "Alice's delete of Bob's person removes nothing");
      psqlAs(ALICE, `update discovery.audience_leads set tags = '{parent}' where id = '${aliceLead}'`);
      assertEqual(psql(`select tags::text from discovery.audience_leads where id = '${aliceLead}'`), "{parent}", "Alice tags her own person");

      console.log("Verifying unsubscribing is final for the business (DISC-CONS-P0-03.5)...");
      psqlAs(ALICE, `update discovery.audience_leads set status = 'unsubscribed' where id = '${aliceLead}'`);
      assertThrows(() => psqlAs(ALICE, `update discovery.audience_leads set status = 'active' where id = '${aliceLead}'`), "a member cannot move a person out of unsubscribed");
      assertThrows(() => psqlAs(ALICE, `update discovery.audience_leads set consent_at = now() where id = '${aliceLead}'`), "nor give them consent again");
      assertThrows(() => psqlAs(ALICE, `update discovery.audience_leads set lead_token = '${"c".repeat(48)}' where id = '${aliceLead}'`), "a member cannot change a person's private link");
      assertThrows(() => psqlAs(ALICE, `update discovery.audience_leads set referral_code = '${"c".repeat(16)}' where id = '${aliceLead}'`), "nor their referral code");
      psql(`update discovery.audience_leads set status = 'new', consent_at = now() where id = '${aliceLead}'`);
      assertEqual(psql(`select status from discovery.audience_leads where id = '${aliceLead}'`), "new", "the person signing up again (service role) can");

      console.log("Verifying feedback stays in its workspace and is append-only (DISC-CONS-P0-04.1)...");
      psqlAs(ALICE, `insert into discovery.audience_feedback (workspace_id, lead_id, kind, body) values ('${aliceWs}', '${aliceLead}', 'interview', 'Weekends are hard')`);
      assertThrows(
        () => psql(`insert into discovery.audience_feedback (workspace_id, lead_id, kind, body) values ('${aliceWs}', '${bobLead}', 'survey', 'Planted')`),
        "not even the service role can file Bob's person's answers under Alice's workspace",
      );
      const bobProspectNow = psql(`select pr.id from discovery.prospects pr where pr.workspace_id = '${bobWs}'`);
      assertThrows(
        () => psql(`insert into discovery.audience_feedback (workspace_id, prospect_id, kind, body) values ('${aliceWs}', '${bobProspectNow}', 'comment', 'Planted')`),
        "nor feedback on Bob's prospect under Alice's workspace",
      );
      assertThrows(() => psqlAs(ALICE, `insert into discovery.audience_feedback (workspace_id, kind, body) values ('${aliceWs}', 'comment', 'Nobody')`), "feedback must be about a person or a prospect");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.audience_feedback (workspace_id, lead_id, kind, body) values ('${bobWs}', '${bobLead}', 'comment', 'x')`), "Alice cannot write feedback into Bob's workspace");
      assertThrows(() => psqlAs(ALICE, `update discovery.audience_feedback set body = 'rewritten'`), "feedback cannot be edited");
      assertThrows(() => psqlAs(ALICE, `delete from discovery.audience_feedback`), "feedback cannot be deleted");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.audience_feedback`), "0", "Bob cannot read Alice's feedback");

      console.log("Verifying themes and sign-up pages are per tenant (DISC-CONS-P0-03.2/04.2)...");
      psqlAs(ALICE, `insert into discovery.audience_themes (workspace_id, input_hash, prompt_version, themes, entry_count) values ('${aliceWs}', 'h1', 'summarize_feedback_v1', '[]', 1)`);
      assertThrows(() => psqlAs(ALICE, `insert into discovery.audience_themes (workspace_id, input_hash, prompt_version, themes, entry_count) values ('${aliceWs}', 'h1', 'v', '[]', 1)`), "the same input is summarised once");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.audience_themes (workspace_id, input_hash, prompt_version, themes, entry_count) values ('${bobWs}', 'h2', 'v', '[]', 1)`), "Alice cannot write a summary into Bob's workspace");
      assertThrows(() => psqlAs(ALICE, `update discovery.audience_themes set entry_count = 9`), "a summary cannot be edited");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.audience_themes`), "0", "Bob cannot read Alice's summary");
      psqlAs(ALICE, `insert into discovery.audience_signup_pages (workspace_id, token, consent_text) values ('${aliceWs}', '${hex("9", 32)}', 'I agree')`);
      assertThrows(() => psqlAs(ALICE, `insert into discovery.audience_signup_pages (workspace_id, token, consent_text) values ('${bobWs}', '${hex("8", 32)}', 'I agree')`), "Alice cannot make a sign-up page for Bob's offering");
      assertThrows(() => psqlAs(ALICE, `update discovery.audience_signup_pages set questions = '["a","b","c"]'`), "a page has at most two questions");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.audience_signup_pages`), "0", "Bob cannot read Alice's sign-up page");

      console.log("Verifying grace reads without writing, and an expired licence hides people without deleting them...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '30 days' where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from (select ${COLS} from discovery.audience_leads) l`), "3", "grace: Alice still reads her people");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.audience_feedback (workspace_id, lead_id, kind, body) values ('${aliceWs}', '${aliceLead}', 'comment', 'x')`), "grace: Alice cannot add feedback");
      psqlAs(ALICE, `update discovery.audience_leads set tags = '{grace}' where id = '${aliceLead}'`);
      assertEqual(psql(`select tags::text from discovery.audience_leads where id = '${aliceLead}'`), "{parent}", "grace: Alice's update changes nothing");
      psql(`update core.licenses set status = 'expired' where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      for (const [table, cols] of [["audience_leads", COLS], ["audience_feedback", "id"], ["audience_themes", "id"], ["audience_signup_pages", "id"]]) {
        assertEqual(psqlAs(ALICE, `select count(*) from (select ${cols} from discovery.${table}) t`), "0", `expired licence: Alice reads no ${table}`);
      }
      assertEqual(psql(`select count(*) from discovery.audience_leads where workspace_id = '${aliceWs}'`), "3", "the people are still there (never deleted)");
      psql(`update core.licenses set status = 'active', grace_ends_at = null where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from (select ${COLS} from discovery.audience_leads) l`), "3", "reactivated: Alice's people are back");

      console.log("\nAll consumer discovery checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

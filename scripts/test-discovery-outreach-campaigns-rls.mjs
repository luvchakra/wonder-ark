#!/usr/bin/env node
/**
 * DISC-CAMP-P0-01.1 / DISC-CAMP-P0-02.4 (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md):
 * what the database itself guarantees about outreach campaigns.
 *
 * Proves: each tenant reads and writes only its own mailbox, campaigns, steps, templates,
 * enrollments and sends; an expired Discovery licence hides them (kept, not deleted) and
 * a licence in grace reads but does not write (`tenant AND licensed`, ADR-9); the mailbox
 * password cannot be read by a member; a member cannot mark a mailbox verified, and
 * changing where it connects makes it unverified; a campaign cannot be launched without
 * a verified mailbox and a step; members cannot write a send; a claim is idempotent per
 * (enrollment, step), is deferred (nothing written) when the campaign is paused, the
 * licence is not active, the mailbox is not verified or the day's limit is used up; a
 * send's outcome is final; a prospect is in one active campaign at a time; launch,
 * pause, every claim and every outcome are in the audit log without an address.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "51111111-1111-1111-1111-111111111111";
const BOB = "52222222-2222-2222-2222-222222222222";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "discovery_outreach_campaigns_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding two tenants, each with an offering, a mailbox, a campaign and two prospects...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-camp@example.com'), ('${BOB}', 'bob-camp@example.com');
        grant usage on schema discovery to authenticated;
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        do $$
        declare
          v_user uuid; v_account uuid; v_business uuid; v_product uuid; v_workspace uuid; v_campaign uuid; v_prospect uuid; v_contact uuid;
        begin
          foreach v_user in array array['${ALICE}'::uuid, '${BOB}'::uuid] loop
            select account_id into v_account from core.account_members where user_id = v_user;
            insert into core.businesses (account_id, name) values (v_account, case when v_user = '${ALICE}' then 'Alice Co' else 'Bob Co' end) returning id into v_business;
            insert into core.licenses (account_id, business_id, module_key, status) values (v_account, v_business, 'discovery', 'active');
            insert into discovery.products (business_id, name) values (v_business, 'Product of ' || v_user) returning id into v_product;
            select id into v_workspace from discovery.workspaces where product_id = v_product;
            insert into discovery.sender_mailboxes (workspace_id, from_name, from_email, smtp_host, smtp_port, username, secret_encrypted, daily_limit)
              values (v_workspace, 'Sender', 'sender@example.com', 'smtp.example.com', 587, 'sender@example.com', 'ciphertext-of-' || v_user, 2);
            insert into discovery.outreach_campaigns (workspace_id, name) values (v_workspace, 'First campaign') returning id into v_campaign;
            insert into discovery.outreach_campaign_steps (campaign_id, workspace_id, position, delay_days, purpose)
              values (v_campaign, v_workspace, 1, 0, 'intro'), (v_campaign, v_workspace, 2, 3, 'follow_up');
            insert into discovery.outreach_templates (campaign_id, step_id, workspace_id, segment, subject, body, origin)
              select v_campaign, s.id, v_workspace, 'general', 'Hello', 'Hello {{company}}', 'user_provided'
              from discovery.outreach_campaign_steps s where s.campaign_id = v_campaign;
            for i in 1..3 loop
              insert into discovery.prospects (workspace_id, company_name) values (v_workspace, 'Prospect ' || i || ' of ' || v_user) returning id into v_prospect;
              insert into discovery.contacts (workspace_id, prospect_id, email) values (v_workspace, v_prospect, 'p' || i || '@prospect.example') returning id into v_contact;
              insert into discovery.outreach_enrollments (campaign_id, workspace_id, prospect_id, contact_id, next_due_at)
                values (v_campaign, v_workspace, v_prospect, v_contact, now());
            end loop;
          end loop;
        end $$;
      `);
      const workspaceOf = (name) =>
        psql(`select w.id from discovery.workspaces w join discovery.products p on p.id = w.product_id join core.businesses b on b.id = p.business_id where b.name = '${name}'`);
      const aliceWorkspace = workspaceOf("Alice Co");
      const bobWorkspace = workspaceOf("Bob Co");
      const campaignOf = (workspace) => psql(`select id from discovery.outreach_campaigns where workspace_id = '${workspace}' order by created_at limit 1`);
      const aliceCampaign = campaignOf(aliceWorkspace);
      const bobCampaign = campaignOf(bobWorkspace);
      const stepOf = (campaign, position) => psql(`select id from discovery.outreach_campaign_steps where campaign_id = '${campaign}' and position = ${position}`);
      const enrollmentsOf = (campaign) => psql(`select id from discovery.outreach_enrollments where campaign_id = '${campaign}' order by created_at, id`).split("\n");
      const aliceStep1 = stepOf(aliceCampaign, 1);
      const aliceStep2 = stepOf(aliceCampaign, 2);
      const [e1, e2, e3] = enrollmentsOf(aliceCampaign);
      const claim = (enrollment, step, skip = "null") =>
        psql(`select coalesce(id::text, '-') || '|' || status || '|' || coalesce(reason, '-') || '|' || created from discovery.claim_outreach_send('${enrollment}', '${step}', ${skip})`);
      const TABLES = ["outreach_campaigns", "outreach_campaign_steps", "outreach_templates", "outreach_enrollments", "outreach_sends", "outreach_opening_lines"];

      console.log("Verifying the mailbox password is write-only and a member cannot vouch for a mailbox...");
      assertEqual(psqlAs(ALICE, `select count(*) from (select id, from_email, status from discovery.sender_mailboxes) m`), "1", "Alice reads only her own mailbox's settings");
      assertThrows(() => psqlAs(ALICE, `select secret_encrypted from discovery.sender_mailboxes`), "a member cannot select the mailbox password");
      assertThrows(() => psqlAs(ALICE, `select * from discovery.sender_mailboxes`), "a member's select * is refused rather than returning the ciphertext");
      psqlAs(ALICE, `update discovery.sender_mailboxes set status = 'verified', verified_at = now() where workspace_id = '${aliceWorkspace}'`);
      assertEqual(psql(`select status from discovery.sender_mailboxes where workspace_id = '${aliceWorkspace}'`), "unverified", "a member cannot mark a mailbox verified");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.sender_mailboxes (workspace_id, from_name, from_email, smtp_host, smtp_port, username, secret_encrypted) values ('${aliceWorkspace}', 'x', 'x@example.com', 'smtp.example.com', 587, 'x', 'c')`),
        "a workspace has one mailbox",
      );
      assertThrows(() => psql(`update discovery.sender_mailboxes set smtp_port = 25 where workspace_id = '${aliceWorkspace}'`), "a port other than 465 or 587 is refused");
      assertThrows(() => psql(`update discovery.sender_mailboxes set imap_host = 'imap.example.com', imap_port = 143 where workspace_id = '${aliceWorkspace}'`), "an IMAP port other than 993 is refused");
      assertThrows(() => psql(`update discovery.sender_mailboxes set daily_limit = 201 where workspace_id = '${aliceWorkspace}'`), "a daily limit above 200 is refused");

      console.log("Verifying a campaign cannot be launched without a verified mailbox...");
      assertThrows(() => psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'active' where id = '${aliceCampaign}'`), "launch is refused while the mailbox is unverified");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.outreach_campaigns (workspace_id, name, status) values ('${aliceWorkspace}', 'Sneaky', 'active')`), "a campaign cannot be created already active");
      assertEqual(claim(e1, aliceStep1), "-|deferred|campaign_not_active|false", "a draft campaign's send is deferred and nothing is written");
      psql(`update discovery.sender_mailboxes set status = 'verified', verified_at = now()`);
      psqlAs(ALICE, `insert into discovery.outreach_campaigns (workspace_id, name) values ('${aliceWorkspace}', 'No steps')`);
      psqlAs(ALICE, `update discovery.outreach_campaigns set preview_confirmed_at = now() where name = 'No steps'`);
      assertThrows(() => psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'active' where name = 'No steps'`), "launch is refused without a step");

      console.log("Verifying activation needs a confirmed preview, and a change clears it (20261112140000)...");
      const confirmed = (id) => psql(`select coalesce(preview_confirmed_by::text, 'no') from discovery.outreach_campaigns where id = '${id}'`);
      assertThrows(() => psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'active' where id = '${aliceCampaign}'`), "activation is refused before the preview is confirmed");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.outreach_campaigns (workspace_id, name, preview_confirmed_at) values ('${aliceWorkspace}', 'Pre-confirmed', now()); update discovery.outreach_campaigns set status = 'active' where name = 'Pre-confirmed'`),
        "a campaign cannot be created already confirmed",
      );
      const confirm = (id, who = ALICE) => psqlAs(who, `update discovery.outreach_campaigns set preview_confirmed_at = '2000-01-01', preview_confirmed_by = '${BOB}' where id = '${id}'`);
      confirm(aliceCampaign);
      assertEqual(confirmed(aliceCampaign), ALICE, "a confirmation is the person's own: it names who made it, not who they said");
      assertEqual(psql(`select (preview_confirmed_at > now() - interval '1 minute') from discovery.outreach_campaigns where id = '${aliceCampaign}'`), "t", "and is dated now, not when they said");
      for (const [label, change] of [
        ["who is enrolled", `update discovery.outreach_campaigns set audience = '{"onlyQualified":false}' where id = '${aliceCampaign}'`],
        ["the sending days", `update discovery.outreach_campaigns set send_days = '{1,2}' where id = '${aliceCampaign}'`],
        ["the sending hours", `update discovery.outreach_campaigns set send_to_hour = 17 where id = '${aliceCampaign}'`],
        ["the campaign's emails a day", `update discovery.outreach_campaigns set daily_limit = 10 where id = '${aliceCampaign}'`],
        ["adding new prospects automatically", `update discovery.outreach_campaigns set auto_enroll = true where id = '${aliceCampaign}'`],
        ["a step's text", `update discovery.outreach_templates set body = 'Changed {{company}}' where campaign_id = '${aliceCampaign}' and step_id = '${aliceStep1}'`],
        ["a step's subject", `update discovery.outreach_templates set subject = 'Changed' where campaign_id = '${aliceCampaign}' and step_id = '${aliceStep1}'`],
        ["a step's gap", `update discovery.outreach_campaign_steps set delay_days = 4 where id = '${aliceStep2}'`],
        ["a new step", `insert into discovery.outreach_campaign_steps (campaign_id, workspace_id, position, delay_days, purpose) values ('${aliceCampaign}', '${aliceWorkspace}', 3, 1, 'last_note')`],
        ["a removed step", `delete from discovery.outreach_campaign_steps where campaign_id = '${aliceCampaign}' and position = 3`],
        ["a new text", `insert into discovery.outreach_templates (campaign_id, step_id, workspace_id, segment, subject, body, origin) values ('${aliceCampaign}', '${aliceStep1}', '${aliceWorkspace}', 'plumber', 'Hi', 'Hello plumber', 'user_provided')`],
        ["a removed text", `delete from discovery.outreach_templates where campaign_id = '${aliceCampaign}' and segment = 'plumber'`],
        ["the From name", `update discovery.sender_mailboxes set from_name = 'Someone Else' where workspace_id = '${aliceWorkspace}'`],
      ]) {
        confirm(aliceCampaign);
        assertEqual(confirmed(aliceCampaign), ALICE, `confirmed again before changing ${label}`);
        psqlAs(ALICE, change);
        assertEqual(confirmed(aliceCampaign), "no", `changing ${label} clears the confirmation`);
        assertThrows(() => psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'active' where id = '${aliceCampaign}'`), `and activation is refused after changing ${label}`);
      }
      confirm(aliceCampaign);
      psqlAs(ALICE, `update discovery.outreach_campaigns set name = 'First campaign' where id = '${aliceCampaign}'`);
      psqlAs(ALICE, `update discovery.outreach_templates set origin = 'user_modified' where campaign_id = '${aliceCampaign}' and step_id = '${aliceStep1}'`);
      assertEqual(confirmed(aliceCampaign), ALICE, "a change to something the preview did not show (the name, a label) keeps the confirmation");
      psqlAs(ALICE, `update discovery.outreach_campaigns set preview_confirmed_at = now(), audience = '{}' where id = '${aliceCampaign}'`);
      assertEqual(confirmed(aliceCampaign), "no", "a confirmation cannot ride along with a change to what was previewed");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.outreach_campaign_steps (campaign_id, workspace_id, position, delay_days, purpose) values ('${aliceCampaign}', '${aliceWorkspace}', 3, 31, 'last_note')`), "a follow-up more than 30 days later is refused");
      psql(`update discovery.outreach_campaign_steps set delay_days = 3 where id = '${aliceStep2}'`);
      psql(`update discovery.outreach_campaigns set send_days = '{1,2,3,4,5}', send_to_hour = 18, daily_limit = null, auto_enroll = false where id = '${aliceCampaign}'`);
      psql(`update discovery.sender_mailboxes set from_name = 'Sender', status = 'verified' where workspace_id = '${aliceWorkspace}'`);
      confirm(aliceCampaign);
      psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'active' where id = '${aliceCampaign}'`);
      assertEqual(psql(`select status || ':' || (launched_at is not null) || ':' || launched_by from discovery.outreach_campaigns where id = '${aliceCampaign}'`), `active:true:${ALICE}`, "launch records when and by whom");
      psql(`update discovery.outreach_campaigns set preview_confirmed_at = now() where id = '${bobCampaign}'`);
      psql(`update discovery.outreach_campaigns set status = 'active' where id = '${bobCampaign}'`);
      assertThrows(() => psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'draft' where id = '${aliceCampaign}'`), "a launched campaign cannot go back to draft");

      console.log("Verifying each tenant reads only its own campaign data...");
      for (const table of TABLES.slice(0, 4)) {
        const own = psql(`select count(*) from discovery.${table} where workspace_id = '${aliceWorkspace}'`);
        assertEqual(psqlAs(ALICE, `select count(*) from discovery.${table}`), own, `Alice reads only her own ${table}`);
        assertEqual(psqlAs(ALICE, `select count(*) from discovery.${table} where workspace_id = '${bobWorkspace}'`), "0", `none of Alice's visible ${table} are Bob's`);
      }

      console.log("Verifying opening lines are read by members and written only by the service role (DISC-CAMP-P0-03.2)...");
      psql(`insert into discovery.outreach_opening_lines (workspace_id, campaign_id, prospect_id, input_hash, prompt_version, line) select '${aliceWorkspace}', '${aliceCampaign}', prospect_id, 'h1', 'write_opening_line_v1', 'Your crews in Pune keep busy all year.' from discovery.outreach_enrollments where id = '${e1}'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.outreach_opening_lines`), "1", "Alice reads her opening line");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.outreach_opening_lines`), "0", "Bob reads none of Alice's opening lines");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.outreach_opening_lines (workspace_id, campaign_id, prospect_id, input_hash, prompt_version, line) select '${aliceWorkspace}', '${aliceCampaign}', prospect_id, 'h2', 'v', 'Anything at all.' from discovery.outreach_enrollments where id = '${e1}'`),
        "a member cannot write an opening line",
      );
      assertThrows(() => psqlAs(ALICE, `update discovery.outreach_opening_lines set line = 'Changed by hand.'`), "a member cannot change an opening line");
      assertThrows(
        () => psql(`insert into discovery.outreach_opening_lines (workspace_id, campaign_id, prospect_id, input_hash, prompt_version, line) select '${aliceWorkspace}', '${aliceCampaign}', prospect_id, 'h1', 'write_opening_line_v1', 'A second line for the same input.' from discovery.outreach_enrollments where id = '${e1}'`),
        "one opening line per campaign, prospect and input",
      );
      assertThrows(
        () => psql(`insert into discovery.outreach_opening_lines (workspace_id, campaign_id, prospect_id, input_hash, prompt_version, line) select '${bobWorkspace}', '${aliceCampaign}', prospect_id, 'h3', 'v', 'Wrong workspace.' from discovery.outreach_enrollments where id = '${e1}'`),
        "an opening line belongs to its campaign's own workspace",
      );

      console.log("Verifying a tenant can't write into another's workspace...");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.outreach_campaigns (workspace_id, name) values ('${bobWorkspace}', 'Planted')`), "Alice can't create a campaign in Bob's workspace");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.outreach_campaign_steps (campaign_id, workspace_id, position, delay_days, purpose) values ('${bobCampaign}', '${aliceWorkspace}', 3, 3, 'last_note')`),
        "Alice can't attach a step to Bob's campaign under her own workspace id",
      );
      const bobProspect = psql(`select id from discovery.prospects where workspace_id = '${bobWorkspace}' limit 1`);
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.outreach_enrollments (campaign_id, workspace_id, prospect_id) values ('${aliceCampaign}', '${aliceWorkspace}', '${bobProspect}')`),
        "Alice can't enrol Bob's prospect in her campaign",
      );
      psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'paused' where id = '${bobCampaign}'`);
      assertEqual(psql(`select status from discovery.outreach_campaigns where id = '${bobCampaign}'`), "active", "Alice's pause of Bob's campaign changes nothing");
      psqlAs(ALICE, `update discovery.sender_mailboxes set smtp_host = 'evil.example.com' where workspace_id = '${bobWorkspace}'`);
      assertEqual(psql(`select smtp_host from discovery.sender_mailboxes where workspace_id = '${bobWorkspace}'`), "smtp.example.com", "Alice's change to Bob's mailbox changes nothing");
      psqlAs(ALICE, `delete from discovery.outreach_templates where workspace_id = '${bobWorkspace}'`);
      assertEqual(psql(`select count(*) from discovery.outreach_templates where workspace_id = '${bobWorkspace}'`), "2", "Alice's delete of Bob's templates removes nothing");

      console.log("Verifying the sequence rules...");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.outreach_campaign_steps (campaign_id, workspace_id, position, delay_days, purpose) values ('${aliceCampaign}', '${aliceWorkspace}', 6, 3, 'last_note')`), "a sixth step is refused");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.outreach_campaign_steps (campaign_id, workspace_id, position, delay_days, purpose) values ('${aliceCampaign}', '${aliceWorkspace}', 3, 0, 'last_note')`), "a follow-up on the same day is refused");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.outreach_campaigns (workspace_id, name) values ('${aliceWorkspace}', 'Second'); insert into discovery.outreach_enrollments (campaign_id, workspace_id, prospect_id) select c.id, c.workspace_id, e.prospect_id from discovery.outreach_campaigns c, discovery.outreach_enrollments e where c.name = 'Second' and e.id = '${e1}'`),
        "a prospect cannot be active in two campaigns of one workspace",
      );

      console.log("Verifying members cannot write a send, and a claim is the only way in...");
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.outreach_sends (enrollment_id, step_id, campaign_id, workspace_id, status, local_day) values ('${e1}', '${aliceStep1}', '${aliceCampaign}', '${aliceWorkspace}', 'sent', current_date)`),
        "a member cannot insert a send",
      );
      assertThrows(() => psqlAs(ALICE, `select * from discovery.claim_outreach_send('${e1}', '${aliceStep1}')`), "a member cannot call the claim function");

      console.log("Verifying a claim is idempotent and counted...");
      const first = claim(e1, aliceStep1);
      assertEqual(first.split("|").slice(1).join("|"), "requested|-|true", "the first claim creates a requested send");
      assertEqual(claim(e1, aliceStep1), `${first.split("|")[0]}|requested|-|false`, "a second claim for the same step returns the same row, not a new one");
      assertEqual(psql(`select count(*) from discovery.outreach_sends where enrollment_id = '${e1}'`), "1", "one row per (enrollment, step)");
      assertEqual(claim(e1, aliceStep2), "-|deferred|not_next_step|false", "a step that is not the enrollment's next one is deferred");
      assertEqual(claim(e2, aliceStep1).split("|").slice(1).join("|"), "requested|-|true", "a second prospect is claimed inside the limit of 2");
      assertEqual(claim(e3, aliceStep1), "-|deferred|daily_limit|false", "the third send of the day is deferred: the mailbox's limit is 2");
      assertEqual(psql(`select count(*) from discovery.outreach_sends where enrollment_id = '${e3}'`), "0", "a deferred send writes nothing, so the step stays due");
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.outreach_sends`), "2", "Alice reads her own sends");
      assertEqual(psqlAs(BOB, `select count(*) from discovery.outreach_sends`), "0", "Bob reads none of Alice's sends");
      assertThrows(() => psqlAs(ALICE, `update discovery.outreach_sends set status = 'sent'`), "a member cannot change a send");

      console.log("Verifying a send's outcome is final...");
      psql(`update discovery.outreach_sends set status = 'sent' where enrollment_id = '${e1}'`);
      assertEqual(psql(`select (finished_at is not null) from discovery.outreach_sends where enrollment_id = '${e1}'`), "t", "the outcome records when it finished");
      assertThrows(() => psql(`update discovery.outreach_sends set status = 'failed', reason = 'x' where enrollment_id = '${e1}'`), "a sent send cannot become failed");
      assertThrows(() => psql(`update discovery.outreach_sends set status = 'failed' where enrollment_id = '${e2}'`), "a failed send needs its reason");
      psql(`update discovery.outreach_sends set status = 'failed', reason = 'Outcome unknown' where enrollment_id = '${e2}'`);
      assertEqual(claim(e3, aliceStep1), "-|deferred|daily_limit|false", "a failed send still counts toward the day: it may have gone");

      console.log("Verifying nothing is claimed for a paused campaign, an unverified mailbox or an inactive enrollment...");
      psql(`update discovery.sender_mailboxes set daily_limit = 50 where workspace_id = '${aliceWorkspace}'`);
      psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'paused', pause_reason = 'Paused by a person' where id = '${aliceCampaign}'`);
      assertEqual(claim(e3, aliceStep1), "-|deferred|campaign_not_active|false", "paused: nothing is claimed");
      psqlAs(ALICE, `update discovery.outreach_campaigns set status = 'active' where id = '${aliceCampaign}'`);
      assertEqual(psql(`select coalesce(pause_reason, 'none') from discovery.outreach_campaigns where id = '${aliceCampaign}'`), "none", "resuming clears the pause reason");
      psqlAs(ALICE, `update discovery.sender_mailboxes set smtp_host = 'smtp2.example.com' where workspace_id = '${aliceWorkspace}'`);
      assertEqual(psql(`select status from discovery.sender_mailboxes where workspace_id = '${aliceWorkspace}'`), "unverified", "changing the mail server makes the mailbox unverified");
      assertEqual(claim(e3, aliceStep1), "-|deferred|mailbox_not_verified|false", "unverified mailbox: nothing is claimed");
      psql(`update discovery.sender_mailboxes set status = 'verified' where workspace_id = '${aliceWorkspace}'`);
      psqlAs(ALICE, `update discovery.outreach_enrollments set status = 'stopped', stop_reason = 'Replied' where id = '${e3}'`);
      assertEqual(claim(e3, aliceStep1), "-|deferred|enrollment_not_active|false", "a stopped enrollment: nothing is claimed");
      psqlAs(ALICE, `update discovery.outreach_enrollments set status = 'active', stop_reason = null where id = '${e3}'`);
      assertEqual(claim(e3, aliceStep1, "'suppressed'").split("|").slice(1).join("|"), "skipped|suppressed|true", "a send the caller knows must not happen is recorded as skipped with its reason");
      assertEqual(claim(e3, aliceStep1).split("|").slice(1).join("|"), "skipped|suppressed|false", "and a skipped step is not claimed again");

      console.log("Verifying a campaign's own daily limit holds beside the mailbox's (20261112140000)...");
      psql(`update discovery.outreach_enrollments set status = 'active', stop_reason = null, next_step_position = 2 where id = '${e1}'`);
      psql(`update discovery.outreach_campaigns set daily_limit = 2 where id = '${aliceCampaign}'`);
      assertEqual(psql(`select status from discovery.outreach_campaigns where id = '${aliceCampaign}'`), "active", "a running campaign stays running when its limit is changed");
      assertEqual(claim(e1, aliceStep2), "-|deferred|campaign_daily_limit|false", "the campaign's own limit of 2 defers its third send of the day, though the mailbox allows 50");
      assertEqual(psql(`select count(*) from discovery.outreach_sends where enrollment_id = '${e1}' and step_id = '${aliceStep2}'`), "0", "and writes nothing, so the step stays due");
      psql(`update discovery.outreach_campaigns set daily_limit = 4 where id = '${aliceCampaign}'`);
      psql(`update discovery.sender_mailboxes set daily_limit = 2 where workspace_id = '${aliceWorkspace}'`);
      assertEqual(claim(e1, aliceStep2), "-|deferred|daily_limit|false", "the mailbox's limit still holds when the campaign's is higher");
      psql(`update discovery.sender_mailboxes set daily_limit = 50 where workspace_id = '${aliceWorkspace}'`);
      psql(`update discovery.outreach_campaigns set daily_limit = null where id = '${aliceCampaign}'`);
      psql(`update discovery.outreach_enrollments set next_step_position = 1 where id = '${e1}'`);

      console.log("Verifying the audit trail...");
      const audit = (action) => psql(`select count(*) from core.audit_log where action = '${action}'`);
      assertEqual(audit("discovery_outreach_campaign.launched"), "2", "each launch is audited");
      assertEqual(audit("discovery_outreach_campaign.paused"), "1", "the pause is audited");
      assertEqual(audit("discovery_outreach_campaign.resumed"), "1", "the resume is audited");
      assertEqual(audit("discovery_outreach_send.requested"), "2", "each claim is audited");
      assertEqual(audit("discovery_outreach_send.sent"), "1", "a sent outcome is audited");
      assertEqual(audit("discovery_outreach_send.failed"), "1", "a failed outcome is audited");
      assertEqual(audit("discovery_outreach_send.skipped"), "1", "a skipped send is audited");
      assertEqual(psql(`select count(*) from core.audit_log where action like 'discovery_outreach%' and ("after"::text like '%prospect.example%' or "after"::text like '%ciphertext%')`), "0", "no address and no secret in the audit log");
      assertEqual(psql(`select actor_id from core.audit_log where action = 'discovery_outreach_campaign.paused'`), ALICE, "the pause names who did it");

      console.log("Verifying a licence in its read-only grace period reads but does not write, and nothing is claimed...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '30 days' from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.outreach_campaigns`), "2", "grace: Alice still reads her campaigns");
      psqlAs(ALICE, `update discovery.outreach_campaigns set name = 'Renamed' where id = '${aliceCampaign}'`);
      assertEqual(psql(`select name from discovery.outreach_campaigns where id = '${aliceCampaign}'`), "First campaign", "grace: Alice's update changes nothing");
      psql(`update discovery.outreach_enrollments set next_step_position = 2 where id = '${e1}'`);
      assertEqual(claim(e1, aliceStep2), "-|deferred|not_licensed|false", "grace: nothing is claimed");

      console.log("Verifying an expired Discovery licence hides everything without deleting it...");
      psql(`update core.licenses set status = 'expired' from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      for (const table of TABLES) {
        assertEqual(psqlAs(ALICE, `select count(*) from discovery.${table}`), "0", `expired licence: Alice reads no ${table}`);
      }
      assertEqual(psqlAs(ALICE, `select count(*) from (select id from discovery.sender_mailboxes) m`), "0", "expired licence: Alice reads no mailbox");
      assertThrows(() => psqlAs(ALICE, `insert into discovery.outreach_campaigns (workspace_id, name) values ('${aliceWorkspace}', 'After expiry')`), "expired licence: Alice can't create a campaign");
      assertEqual(claim(e1, aliceStep2), "-|deferred|not_licensed|false", "expired licence: nothing is claimed");
      assertEqual(psql(`select count(*) from discovery.outreach_sends where workspace_id = '${aliceWorkspace}'`), "3", "the rows are still there (never deleted)");
      psql(`update core.licenses set status = 'active', grace_ends_at = null from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.outreach_sends`), "3", "reactivated: Alice's sends are back");
      assertEqual(claim(e1, aliceStep2).split("|").slice(1).join("|"), "requested|-|true", "reactivated: the next step can be claimed");

      console.log("Verifying deleting a prospect removes its enrollment, and deleting a contact leaves no one to write to...");
      psql(`delete from discovery.contacts where id = (select contact_id from discovery.outreach_enrollments where id = '${e2}')`);
      assertEqual(psql(`select coalesce(contact_id::text, 'none') from discovery.outreach_enrollments where id = '${e2}'`), "none", "a deleted contact leaves the enrollment with no contact");
      psql(`delete from discovery.prospects where id = (select prospect_id from discovery.outreach_enrollments where id = '${e3}')`);
      assertEqual(psql(`select count(*) from discovery.outreach_enrollments where id = '${e3}'`), "0", "a deleted prospect's enrollment is gone");

      console.log("Verifying who an enrollment writes to (20261112120000)...");
      assertEqual(psql(`select string_agg(distinct recipient, ',') from discovery.outreach_enrollments`), "contact", "an enrollment writes to a contact by default");
      assertThrows(() => psql(`update discovery.outreach_enrollments set recipient = 'company_email' where id = '${e1}'`), "an enrollment to the general company email names no contact");
      psql(`update discovery.outreach_enrollments set recipient = 'company_email', contact_id = null where id = '${e1}'`);
      assertThrows(() => psql(`update discovery.outreach_enrollments set recipient = 'everyone' where id = '${e1}'`), "an unknown recipient kind is refused");

      console.log("Verifying a message sends once and a reply is stored once (20261112110000, 20261112130000)...");
      const prospectOf = psql(`select prospect_id from discovery.outreach_enrollments where id = '${e1}'`);
      psql(`insert into discovery.messages (id, workspace_id, prospect_id, channel, content, status) values ('99999999-0000-0000-0000-000000000001', '${aliceWorkspace}', '${prospectOf}', 'email', 'Hello', 'approved')`);
      assertEqual(psqlAs(ALICE, `update discovery.messages set send_claimed_at = now() where id = '99999999-0000-0000-0000-000000000001' and status in ('approved', 'failed') and send_claimed_at is null returning 1`), "1", "the first claim of a message succeeds");
      assertEqual(psqlAs(ALICE, `update discovery.messages set send_claimed_at = now() where id = '99999999-0000-0000-0000-000000000001' and status in ('approved', 'failed') and send_claimed_at is null returning 1`), "", "a second claim of the same message matches nothing");
      const inbound = (workspace, prospect, key) => `insert into discovery.messages (workspace_id, prospect_id, channel, direction, content, status, provider_message_id) values ('${workspace}', '${prospect}', 'email', 'inbound', 'Tell me more', 'sent', ${key})`;
      psql(inbound(aliceWorkspace, prospectOf, "'id:<abc@mail.example>'"));
      assertThrows(() => psql(inbound(aliceWorkspace, prospectOf, "'id:<abc@mail.example>'")), "the same reply delivered twice is refused the second time");
      psql(inbound(bobWorkspace, bobProspect, "'id:<abc@mail.example>'"));
      psql(inbound(aliceWorkspace, prospectOf, "null"));
      psql(inbound(aliceWorkspace, prospectOf, "null"));
      psql(`insert into discovery.messages (workspace_id, prospect_id, channel, content, status, provider_message_id) values ('${aliceWorkspace}', '${prospectOf}', 'email', 'Out', 'sent', 'same-id'), ('${aliceWorkspace}', '${prospectOf}', 'email', 'Out', 'sent', 'same-id')`);
      assertEqual(psql(`select count(*) from discovery.messages where workspace_id = '${aliceWorkspace}' and direction = 'inbound'`), "3", "inbound rows without a key, and outbound rows, are not constrained");

      console.log("\nAll outreach-campaign checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

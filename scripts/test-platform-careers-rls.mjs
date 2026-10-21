#!/usr/bin/env node
/**
 * RLS + behaviour test for PLATFORM-P1-13.1 / PLATFORM-P1-13.2 (the public Careers pages'
 * WonderJobs connection, 20261021100000_platform_careers_connection.sql).
 *
 * What this proves:
 *   - the career-site key's table is unreachable from anon and authenticated (superadmins
 *     included): only the service role reads it;
 *   - only a superadmin can save, clear or read the key's status, and the status carries
 *     the last four characters, never the ciphertext;
 *   - every save and clear lands in platform.audit_log with who and the last four only;
 *   - the rate-limit counter is service-role only and stops at its limit;
 *   - `careers` can no longer be a business slug.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-99999999c0a1"; // ordinary business owner
const ZOE = "99999999-9999-9999-9999-99999999c0c1"; // platform superadmin
const HASH = "a".repeat(64);

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_careers_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`insert into auth.users (id, email) values ('${ALICE}', 'a-careers@example.com'), ('${ZOE}', 'z-careers@example.com')`);
      psql(`set local role service_role; insert into platform.admins (user_id) values ('${ZOE}');`);

      console.log("Only a superadmin can save the key...");
      assertThrows(() => psqlAs(ALICE, `select platform.set_careers_key('ciphertext-a', 'abcd')`), "a customer can't save the key");
      assertThrows(() => psql(`set local role anon; select platform.set_careers_key('ciphertext-a', 'abcd')`), "a visitor can't save the key");
      assertThrows(() => psqlAs(ZOE, `select platform.set_careers_key('ciphertext-a', 'not four')`), "the last four characters are validated");
      assertThrows(() => psqlAs(ZOE, `select platform.set_careers_key('', 'abcd')`), "a key is required");

      psqlAs(ZOE, `select platform.set_careers_key('ciphertext-a', 'abcd')`);
      assertEqual(psqlAs(ZOE, `select configured || ':' || key_last4 from platform.careers_connection_status()`), "true:abcd", "a superadmin sees configured + last four");
      assertThrows(() => psqlAs(ALICE, `select * from platform.careers_connection_status()`), "a customer can't read the key's status");

      console.log("Nobody but the service role reads the stored key...");
      assertThrows(() => psqlAs(ZOE, `select encrypted_key from platform.careers_connection`), "not even a superadmin selects the ciphertext");
      assertThrows(() => psqlAs(ALICE, `select encrypted_key from platform.careers_connection`), "a customer can't select it");
      assertThrows(() => psql(`set local role anon; select encrypted_key from platform.careers_connection`), "a visitor can't select it");
      assertThrows(() => psqlAs(ZOE, `update platform.careers_connection set encrypted_key = 'x'`), "no direct writes");
      assertEqual(psql(`set local role service_role; select encrypted_key from platform.careers_connection`), "ciphertext-a", "the service role reads it");
      assertEqual(psql(`select updated_by from platform.careers_connection`), ZOE, "the row records who saved it");

      psqlAs(ZOE, `select platform.set_careers_key('ciphertext-b', 'wxyz')`);
      assertEqual(psql(`select count(*) from platform.careers_connection`), "1", "replacing keeps one row");
      psqlAs(ZOE, `select platform.clear_careers_key()`);
      assertEqual(psql(`select count(*) from platform.careers_connection`), "0", "clearing removes the key");
      assertEqual(psqlAs(ZOE, `select count(*) from platform.careers_connection_status()`), "0", "status then says nothing is saved");
      assertThrows(() => psqlAs(ALICE, `select platform.clear_careers_key()`), "a customer can't clear the key");

      console.log("Every save and clear is audited, with the last four characters only...");
      assertEqual(
        psql(
          `select string_agg(action || ':' || coalesce(previous_value->>'key_last4', '-') || '>' || coalesce(new_value->>'key_last4', '-') || ':' || actor_id, ',' order by performed_at, action)
           from platform.audit_log where resource_type = 'careers_connection'`,
        ),
        `created:->abcd:${ZOE},updated:abcd>wxyz:${ZOE},deleted:wxyz>-:${ZOE}`,
        "created, replaced and cleared, each with its actor",
      );
      assertEqual(
        psql(`select count(*) from platform.audit_log where resource_type = 'careers_connection' and (coalesce(previous_value::text, '') || coalesce(new_value::text, '')) like '%ciphertext%'`),
        "0",
        "no ciphertext in the audit trail",
      );
      assertEqual(psqlAs(ALICE, `select count(*) from platform.audit_log`), "0", "customers can't read the platform audit log");

      console.log("The rate-limit counter...");
      assertThrows(() => psqlAs(ALICE, `select platform.check_careers_rate_limit('apply', '${HASH}', 2)`), "a signed-in user can't call it");
      assertThrows(() => psql(`set local role anon; select platform.check_careers_rate_limit('apply', '${HASH}', 2)`), "a visitor can't call it");
      assertThrows(() => psqlAs(ALICE, `select * from platform.careers_rate_limits`), "nor read it");
      const check = () => psql(`set local role service_role; select platform.check_careers_rate_limit('apply', '${HASH}', 2)`);
      assertEqual(check(), "t", "first request allowed");
      assertEqual(check(), "t", "second request allowed");
      assertEqual(check(), "f", "third request over the limit");
      assertEqual(psql(`set local role service_role; select platform.check_careers_rate_limit('status', '${HASH}', 2)`), "t", "buckets count separately");
      assertThrows(() => psql(`set local role service_role; select platform.check_careers_rate_limit('apply', '203.0.113.7', 2)`), "only a hash is accepted, never an address");

      console.log("`careers` is a reserved business slug...");
      assertEqual(psql(`select core.business_slug_problem('careers')`), "That address is reserved.", "careers is reserved");
      assertEqual(psql(`select core.business_slug_problem('careers-team') is null`), "t", "a slug merely starting with careers is fine");

      console.log("\nAll careers connection checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

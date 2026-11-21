#!/usr/bin/env node
/**
 * RLS + behaviour test for `platform.platform_keys` (PLATFORM-P1-14.1, "Platform Keys").
 * Same harness and bar as `test-platform-ai-providers-rls.mjs`, whose lockdown this table
 * copies: nobody, a genuine SUPERADMIN included, can SELECT or write the table directly;
 * every change goes through a function that checks `platform.is_superadmin()` and a reason
 * and writes one audit row with a hint and fingerprint, never the ciphertext.
 *
 * What this proves that reading the migration does not:
 *   - a non-superadmin cannot read the table (permission denied, not an empty result), gets
 *     zero rows from `platform_key_status()`, and every set/remove attempt is refused with
 *     nothing left behind;
 *   - a superadmin can set, replace and remove a key, each writing exactly one
 *     `platform.audit_log` row whose snapshots hold no ciphertext;
 *   - a reason is required, and a name of the wrong shape is refused;
 *   - even a superadmin cannot SELECT, INSERT, UPDATE or DELETE the table directly;
 *   - the service role, which the running application reads with, can read it.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-8888888888a1"; // business admin, NOT a superadmin
const ZOE = "88888888-8888-8888-8888-8888888888a2"; // platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_keys_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-platform-keys@example.com'),
          ('${ZOE}', 'zoe-platform-keys@example.com');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);
      assertEqual(asService(`select count(*) from platform.platform_keys`), "0", "no keys seeded");

      console.log("Verifying Alice (not a superadmin) can neither read nor change anything...");
      assertThrows(() => psqlAsAlice(`select * from platform.platform_keys`), "Alice cannot select platform.platform_keys (no grant at all)");
      assertEqual(psqlAsAlice(`select count(*) from platform.platform_key_status()`), "0", "platform_key_status() returns zero rows to a non-superadmin");
      assertThrows(
        () => psqlAsAlice(`select platform.set_platform_key('RESEND_API_KEY', 'ciphertext', '••••abcd', 'fp000001', 'admin', 'trying to set a key')`),
        "Alice's set attempt is refused",
      );
      assertThrows(() => psqlAsAlice(`select platform.remove_platform_key('RESEND_API_KEY', 'trying to remove')`), "Alice's remove attempt is refused");
      assertEqual(asService(`select count(*) from platform.platform_keys`), "0", "nothing left behind in the table");
      assertEqual(asService(`select count(*) from platform.audit_log where resource_type = 'platform_key'`), "0", "nothing left behind in the audit log");

      console.log("Verifying a superadmin (Zoe) can set a key, with one audit row and no ciphertext in it...");
      psqlAsZoe(`select platform.set_platform_key('RESEND_API_KEY', 'ciphertext-one', '••••abcd', 'fp000001', 'deployment', 'moving keys off the deployment')`);
      assertEqual(
        asService(`select encrypted_value || ':' || value_hint || ':' || value_fingerprint || ':' || origin || ':' || updated_by from platform.platform_keys where name = 'RESEND_API_KEY'`),
        `ciphertext-one:••••abcd:fp000001:deployment:${ZOE}`,
        "the row holds what was sent, and who set it",
      );
      assertEqual(
        psqlAsZoe(`select name || ':' || value_hint || ':' || value_fingerprint || ':' || origin from platform.platform_key_status()`),
        "RESEND_API_KEY:••••abcd:fp000001:deployment",
        "platform_key_status() shows the hint and fingerprint to a superadmin",
      );
      assertEqual(
        asService(`select action || ':' || resource_id || ':' || severity || ':' || reason || ':' || (previous_value is null)::text || ':' || (new_value ->> 'value_hint') || ':' || actor_id from platform.audit_log where resource_type = 'platform_key'`),
        `created:RESEND_API_KEY:high:moving keys off the deployment:true:••••abcd:${ZOE}`,
        "exactly one 'created' audit row, by Zoe, with the reason",
      );

      console.log("Verifying a replacement and a removal are each audited, still without the ciphertext...");
      psqlAsZoe(`select platform.set_platform_key('RESEND_API_KEY', 'ciphertext-two', '••••wxyz', 'fp000002', 'admin', 'rotating the key')`);
      assertEqual(asService(`select encrypted_value || ':' || origin from platform.platform_keys where name = 'RESEND_API_KEY'`), "ciphertext-two:admin", "the value was replaced");
      assertEqual(
        asService(`select (previous_value ->> 'value_fingerprint') || '>' || (new_value ->> 'value_fingerprint') from platform.audit_log where resource_type = 'platform_key' and action = 'updated'`),
        "fp000001>fp000002",
        "the 'updated' audit row carries the before and after fingerprints",
      );
      psqlAsZoe(`select platform.remove_platform_key('RESEND_API_KEY', 'no longer used')`);
      assertEqual(asService(`select count(*) from platform.platform_keys`), "0", "the key was removed");
      assertEqual(asService(`select count(*) from platform.audit_log where resource_type = 'platform_key'`), "3", "three audit rows: created, updated, deleted");
      assertEqual(
        asService(`select count(*) from platform.audit_log where resource_type = 'platform_key' and (coalesce(previous_value::text, '') || coalesce(new_value::text, '')) like '%ciphertext%'`),
        "0",
        "no audit snapshot holds a ciphertext",
      );
      assertThrows(() => psqlAsZoe(`select platform.remove_platform_key('RESEND_API_KEY', 'again')`), "removing a key that is not set is refused");

      console.log("Verifying a reason, a well-formed name and a known origin are required...");
      assertThrows(() => psqlAsZoe(`select platform.set_platform_key('RESEND_API_KEY', 'c', 'h', 'f', 'admin', '   ')`), "a blank reason is refused");
      assertThrows(() => psqlAsZoe(`select platform.set_platform_key('resend_api_key', 'c', 'h', 'f', 'admin', 'lower case')`), "a lower-case name is refused");
      assertThrows(() => psqlAsZoe(`select platform.set_platform_key('X; drop table platform.platform_keys', 'c', 'h', 'f', 'admin', 'odd name')`), "a name that is not a variable name is refused");
      assertThrows(() => psqlAsZoe(`select platform.set_platform_key('RESEND_API_KEY', '', 'h', 'f', 'admin', 'empty value')`), "an empty value is refused");
      assertThrows(() => psqlAsZoe(`select platform.set_platform_key('RESEND_API_KEY', 'c', 'h', 'f', 'elsewhere', 'odd origin')`), "an unknown origin is refused");
      assertEqual(asService(`select count(*) from platform.platform_keys`), "0", "none of the refused calls left a row");

      console.log("Verifying even a superadmin cannot touch the table directly...");
      psqlAsZoe(`select platform.set_platform_key('RESEND_FROM_EMAIL', 'ciphertext-from', 'team@example.com', 'fp000003', 'admin', 'from address')`);
      assertThrows(() => psqlAsZoe(`select * from platform.platform_keys`), "a superadmin cannot select the table directly");
      assertThrows(
        () => psqlAsZoe(`insert into platform.platform_keys (name, encrypted_value, value_hint, value_fingerprint) values ('RESEND_API_KEY', 'c', 'h', 'f')`),
        "a superadmin cannot insert directly",
      );
      assertThrows(() => psqlAsZoe(`update platform.platform_keys set encrypted_value = 'x'`), "a superadmin cannot update directly");
      assertThrows(() => psqlAsZoe(`delete from platform.platform_keys`), "a superadmin cannot delete directly");
      assertEqual(asService(`select encrypted_value from platform.platform_keys where name = 'RESEND_FROM_EMAIL'`), "ciphertext-from", "the service role, which the application reads with, can read it");

      console.log("\nAll platform.platform_keys checks passed.");
    },
  });
}

main();

# Security, payments & compliance rules

Rules from the 2026-10-01 security and compliance review (Epic 8 `SEC-*`, Epic 9 `PRIV-*`, in `docs/plan/04-CLAUDE-CODE-BACKLOG.md`). Don't reintroduce these. Read this before touching auth, `SECURITY DEFINER` functions, redirects, secrets, RLS policies, the audit log, payments, outreach email or personal-data exports.

From the 2026-10-01 review (Epic 8 `SEC-*`, Epic 9 `PRIV-*`, `docs/plan/04-CLAUDE-CODE-BACKLOG.md`). Don't reintroduce these.

- `SECURITY DEFINER` functions granted to `authenticated` authorise their own inputs: membership via `core.user_business_ids()`, actor forced to `auth.uid()`. Internal helpers such as `core.append_audit_log()` are `service_role` only (SEC-2).
- Redirect targets from input are paths, never URLs: pass `?next=` through `safeRedirectPath()` (`apps/web/lib/safe-redirect.ts`) (SEC-8). `@evil.example` becomes the host if you glue input onto the origin.
- Compare secrets with `secretsEqual()` or `bearerTokenMatches()` (`@cofounderai/core/lib/timing-safe`), never `!==` (SEC-3).
- CI fails on high or critical production advisories; Dependabot proposes fixes (SEC-1, SEC-5).
- CSP is a baseline without nonces (SEC-4), because public pages are static. New third-party script, frame or connection origins go in `apps/web/lib/security-headers.ts`.
- RLS with no matching policy silently matches zero rows on UPDATE/DELETE. For hard controls, also `revoke` the privilege (default privileges grant it) and back it with a trigger: `service_role` has BYPASSRLS, which skips policies, not triggers.
- The audit log is append-only and hash-chained (SEC-6). Write only via `write_audit_log()` / `append_audit_log()`; never edit or delete. `core.verify_audit_chain()` misses removal of the newest entries, so anchor chain heads outside the database.
- Money is corrected, never edited. Recorded payments are undone only by `core.void_payment()` (SEC-7: permission, maker-checker, reason, audit, `payment.voided` → Finance reversal). Ledger entries are reversed, not deleted. A "privileged flag" GUC is not authorisation: clients can `set` it too; pair it with `core.is_voiding_payment()`.
- Outreach email: call `prepareOutreachEmail()` before any send to a prospect, investor or other third party; refuse when suppressed; pass its headers and one-click unsubscribe through (PRIV-1). Store `core.email_hash()`, never the address, wherever matching is enough.
- A new table holding a user's own personal data goes in `buildPersonalDataExport()` (PRIV-2). Business-held data about third parties is exported by its module.

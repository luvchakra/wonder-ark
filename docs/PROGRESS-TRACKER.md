# WonderArk platform — progress tracker

<!-- GENERATED FILE — do not edit by hand. Run `npm run build:progress`. -->

Every story in every backlog under `docs/plan/`, and whether it is built. Generated
from the backlogs themselves plus the repository: this codebase cites a story's id in
the code, migration or test that implements it, so a story whose id appears outside
`docs/plan/` has been worked and one whose id appears nowhere has not. Where that
evidence does not apply — the short ids of the platform build-out epics, a story
deliberately deferred, one built before the citing convention — the status is curated
in `docs/progress-overrides.json`, with a note saying why. ❔ Unverified means the id
appears only in an audit or test-case document: somebody wrote about the story, but no
code cites it, so it is counted as outstanding rather than assumed shipped.

Regenerate after finishing a story: `npm run build:progress`. `npm test` fails if this
file is stale, so it cannot quietly drift out of date.

## Where the platform stands

| | Stories |
|---|---|
| ✅ Done | 572 |
| 🟡 In progress | 0 |
| ⏸️ Deferred | 52 |
| 🔁 Superseded | 30 |
| ❔ Unverified | 0 |
| ⛔ Blocked | 0 |
| ⬜ Not started | 0 |
| **Total** | **654** |

| Backlog | Done | Set aside | Remaining | Total |
|---|---|---|---|---|
| [Platform build-out](./plan/04-CLAUDE-CODE-BACKLOG.md) | 74 | 1 | 0 | 75 |
| [Platform Administration Portal](./plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md) | 129 | 7 | 0 | 136 |
| [Discovery — offering-centric upgrade](./plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md) | 57 | 1 | 0 | 58 |
| [Discovery — opportunity intelligence](./plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md) | 0 | 30 | 0 | 30 |
| [Compliance / Finance — global tax](./plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md) | 87 | 41 | 0 | 128 |
| [Discovery — Marketing, Customer Acquisition & Funding](./plan/12-DISCOVERY-MARKETING-FUNDING-BACKLOG.md) | 44 | 1 | 0 | 45 |
| [CSV / Excel export](./plan/13-DATA-EXPORT-BACKLOG.md) | 89 | 1 | 0 | 90 |
| [Subscriptions & billing (Razorpay + Stripe)](./plan/14-SUBSCRIPTION-BILLING-BACKLOG.md) | 40 | 0 | 0 | 40 |
| [Multi-user / multi-business RBAC](./plan/15-MULTI-USER-RBAC-BACKLOG.md) | 39 | 0 | 0 | 39 |
| [WonderArk branding](./plan/16-BRANDING-BACKLOG.md) | 13 | 0 | 0 | 13 |

## What is left

Nothing outstanding — every story in every backlog is done, deferred or superseded.

## Platform build-out

Source: [`docs/plan/04-CLAUDE-CODE-BACKLOG.md`](./plan/04-CLAUDE-CODE-BACKLOG.md)

### Epic 0 — Approvals and audit [BLOCKER]

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `A-1` | Write docs/adr/0001-modular-platform.md capturing | ✅ Done | Epic 0 complete — `docs/NEXT-ACTIVITIES.md` |
| `A-2` | SP-0 source audit of stockpilot-ai-ops | ✅ Done | Epic 0 complete — `docs/NEXT-ACTIVITIES.md` |
| `A-3` | Baseline snapshot | ✅ Done | Epic 0 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 1 — Monorepo and module framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `P-1` | Convert the repo to npm workspaces | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-2` | packages/core | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-3` | Module manifest type + module-registry with all 5 modules declared | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-4` | Import-boundary enforcement | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |
| `P-5` | Move discovery code into packages/module-discovery behind the boundary rules | ✅ Done | Epic 1 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 2 — Core: tenancy, licensing, RBAC

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `C-1` | core schema + move/mirror accounts, account_members, businesses, products, workspaces resolution helpers into core; add  | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-2` | core.business_settings (gstin, state, gst_registration_type, currency, timezone, locale, fiscal_year_start), core.user_p | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-3` | core.modules, core.licenses, core.license_events; core.has_module(business_id, key) and core.has_module_write(...) | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-4` | License lifecycle service | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-5` | Business switcher + active-business resolution in proxy.ts; entitlements loaded once per request; unlicensed module rout | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-6` | Licenses admin UI | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-7` | core.permissions + core.role_permissions + requirePermission(); seed the Kickserv-derived permission matrix per module,  | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-8` | RLS + license test harness | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |
| `C-9` | Performance check | ✅ Done | Epic 2 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 3 — Core: shared domain

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `D-1` | core.parties, core.party_roles, core.party_contacts, core.party_supplier_attrs + queries/mutations + RLS + tests. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-2` | core.addresses (billing/shipping/service, parent, geo) + core.tax_identities. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-3` | Backfill | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-4` | core.item_categories, core.items, core.item_inventory_attrs, core.tax_rates. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-5` | core.number_sequences + core.next_number | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-6` | core.documents + core.document_lines | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-7` | core.payments + core.payment_allocations + balance/aging views. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-8` | core.tags + core.taggings (scopes work/contact), core.custom_field_defs + core.custom_field_values (entity + optional se | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-9` | core.domain_events + publisher + core.jobs-based drain loop (cron route), retries with backoff, no_consumer parking, rep | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |
| `D-10` | core.audit_log + a write helper invoked by every state transition. | ✅ Done | Epic 3 complete — `docs/NEXT-ACTIVITIES.md` |

### Epic 4 — Inventory migration (details in 03-STOCKPILOT-MIGRATION.md)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `SP-3a` | inventory schema DDL | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-3b` | Port the procedural layer | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-4` | Compat views + INSTEAD OF triggers for the tables that merge into core (organizations→core.businesses, customers/supplie | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-7` | Port StockPilot's Next.js port | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |
| `SP-9` | Manifest, contract/index.ts (reserveStock, releaseStock, consumeStock, getAvailability, listWarehouses, upsertItem), eve | ✅ Done | Epic 4 complete — `docs/PORT-PROVENANCE.md`, `docs/NEXT-ACTIVITIES.md` |

### Epic 5 — FSM (details in 02-FSM-PRD.md)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `F-1` | fsm schema DDL | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-2` | Opportunities | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-3` | Estimates | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-4` | Public estimate page + send (email via Resend, already a dependency) + sent/viewed tracking + customer approve/decline → | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-5` | Jobs | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-6` | Scheduling | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-7` | Field execution | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-8` | Invoicing | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-9` | Reminders | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-10` | Customer Center | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-11` | Messages tab on jobs reading core.messages, participant notification rules. | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-12` | Reports | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-13` | Discovery → FSM handoff | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-14` | Inventory ↔ FSM integration | ✅ Done | `docs/FSM-PROGRESS.md` |
| `F-15` | FSM settings screens | ✅ Done | `docs/FSM-PROGRESS.md` |

### Epic 6 — Skeletons and convergence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `S-1` | crm module skeleton | ✅ Done | `docs/EPIC6-PROGRESS.md` |
| `S-2` | gst module skeleton | ✅ Done | `docs/EPIC6-PROGRESS.md` — "mostly done"; the remaining scope is listed there |
| `S-3` | core.threads + core.messages + core.message_templates; migrate public.messages / public.conversations onto them behind v | ✅ Done | `docs/EPIC6-PROGRESS.md` |
| `S-4` | Promote ai_runs, ai_provider_credentials, usage_events to core; all modules bill AI usage through one path. | ✅ Done | `docs/EPIC6-PROGRESS.md` |
| `S-5` | Platform dashboard assembled from module-contributed widgets via the registry. | ✅ Done | `docs/EPIC6-PROGRESS.md` |

### Epic 7 — Finance (details in docs/FINANCE-PROGRESS.md)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `FIN-1` | Finance exceptions queue | ✅ Done | `docs/FINANCE-PROGRESS.md` — exceptions queue, built 2026-09-19 |
| `FIN-2` | Backfill | ✅ Done | `docs/FINANCE-PROGRESS.md` — backfill, built 2026-09-19 |
| `FIN-3` | Activation wizard | ✅ Done | `docs/FINANCE-PROGRESS.md` — activation wizard, built 2026-09-19 |
| `FIN-4` | Finance invoice view | ✅ Done | `docs/FINANCE-PROGRESS.md` — invoice view with four independent statuses, built 2026-09-27 |
| `FIN-5` | Cash flow statement | ✅ Done | `docs/FINANCE-PROGRESS.md` — cash flow statement (and as-at balance sheet fix), built 2026-09-27 |
| `FIN-6` | Operational reports | ✅ Done | `docs/FINANCE-PROGRESS.md` — operational reports, built 2026-09-27 |
| `FIN-7` | Report drill-down | ✅ Done | `docs/FINANCE-PROGRESS.md` — report drill-down, built 2026-09-27 |
| `FIN-8` | Bank rules | ✅ Done | `docs/FINANCE-PROGRESS.md` — bank rules, built 2026-09-27 |
| `FIN-9` | Dimensions | ✅ Done | `docs/FINANCE-PROGRESS.md` — dimensions, built 2026-09-27 |
| `FIN-10` | Seed data | ✅ Done | `docs/FINANCE-PROGRESS.md` — deterministic fixture set for local databases, built 2026-09-27 |
| `FIN-11` | End-to-end edge cases | ✅ Done | `docs/FINANCE-PROGRESS.md` — end-to-end edge cases (DB + TypeScript), built 2026-09-27 |
| `FIN-12` | Explainable accounting, in reverse | ✅ Done | `docs/FINANCE-PROGRESS.md` — document-to-entries view, built 2026-09-27 |
| `FIN-13` | AI categorisation for unmatched bank lines | ⏸️ Deferred | Deliberate: Finance is deterministic arithmetic (CLAUDE.md principle 4). Only if wanted. |

### Epic 8 — Security hardening

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `SEC-1` | Patch the critical Next.js advisory and gate CI on advisories | ✅ Done | Epic 8 -- next 16.3.4 -> 16.3.8 and CI `npm audit --omit=dev --audit-level=high`, built 2026-10-01 |
| `SEC-2` | Audit-log forgery | ✅ Done | Epic 8 -- `20261001090000_core_audit_log_write_authorization.sql` + `scripts/test-core-audit-log-authorization.mjs`, built 2026-10-01 |
| `SEC-3` | Constant-time secret comparison | ✅ Done | Epic 8 -- `packages/core/src/lib/timing-safe.ts` used by every `/api/cron/*` route and `/api/webhooks/email-inbound`, built 2026-10-01 |
| `SEC-4` | Security headers + baseline Content-Security-Policy on every response | ✅ Done | Epic 8 -- `apps/web/lib/security-headers.ts` applied in `next.config.ts`, built 2026-10-01 |
| `SEC-5` | Dependabot for npm and GitHub Actions | ✅ Done | Epic 8 -- `.github/dependabot.yml`, built 2026-10-01 |
| `SEC-6` | Tamper-evident, append-only audit log | ✅ Done | Epic 8 -- `20261001150000_core_audit_log_tamper_evident.sql` + `scripts/test-core-audit-log-tamper-evident.mjs`, built 2026-10-01 |
| `SEC-7` | Void-only payments | ✅ Done | Epic 8 -- `20261002090000_core_payments_void_only.sql` + `scripts/test-core-payments-void-only.mjs`, `voidPayment()`, Finance `payment.voided` reversal, built 2026-10-02 |
| `SEC-8` | Social sign-in, and an open redirect after it | ✅ Done | Epic 8 -- `apps/web/lib/safe-redirect.ts`, `signInWithOAuthProvider()`, `core/auth/oauth-providers.ts`, built 2026-10-02 |

### Epic 9 — Privacy (GDPR / DPDP)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PRIV-1` | Outreach opt-out, one click | ✅ Done | Epic 9 -- `20261002100000_core_communication_suppressions.sql`, `packages/core/src/privacy/*`, `/api/unsubscribe`, built 2026-10-02 |
| `PRIV-2` | Download my data | ✅ Done | Epic 9 -- `packages/core/src/privacy/export.ts` + `/dashboard/settings/profile/export`, built 2026-10-02 |

## Platform Administration Portal

Source: [`docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md`](./plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md)

### SUPERADMIN Role

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-01.1` | Create SUPERADMIN Role | ✅ Done | `supabase/migrations/20260911004400_platform_superadmin.sql` |
| `PLATFORM-P0-01.2` | Platform Authorization | ✅ Done | `apps/web/app/platform/layout.tsx` +2 |
| `PLATFORM-P0-01.3` | Platform Session Context | ✅ Done | `apps/web/app/platform/layout.tsx` |
| `PLATFORM-P0-01.4` | No Tenant Context Required | ✅ Done | `supabase/migrations/20260911004400_platform_superadmin.sql` |

### Platform Dashboard

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-02.1` | Platform Overview | ✅ Done | `apps/web/app/platform/(protected)/page.tsx` +3 |
| `PLATFORM-P0-02.2` | Platform Configuration Health | ✅ Done | `apps/web/app/platform/(protected)/page.tsx` +3 |
| `PLATFORM-P0-02.3` | Recent Global Changes | ✅ Done | `apps/web/app/platform/(protected)/page.tsx` +1 |

### Branding & Look and Feel

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-03.1` | WonderArk Branding | ✅ Done | `apps/web/app/(auth)/login/page.tsx` +15 |
| `PLATFORM-P0-03.2` | Global Design Tokens | ✅ Done | `packages/core/src/admin/platform-branding.ts` +2 |
| `PLATFORM-P0-03.3` | Platform Login Branding | ✅ Done | `apps/web/app/(auth)/layout.tsx` +12 |
| `PLATFORM-P0-03.4` | Customer-Facing Branding Scope | ✅ Done | `packages/core/src/admin/platform-branding.ts` +9 |
| `PLATFORM-P0-03.5` | Preview Before Publish | ✅ Done | `apps/web/app/(auth)/layout.tsx` +14 |

### Subscription / Pricing Plans

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-04.1` | Plan Management | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/page.tsx` +16 |
| `PLATFORM-P0-04.2` | Plan Entitlements | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/feature-entitlements-section.tsx` +3 |
| `PLATFORM-P0-04.3` | Module Entitlements | ✅ Done | `apps/web/app/platform/(protected)/modules/module-registry-table.tsx` +14 |
| `PLATFORM-P0-04.4` | Feature-Level Entitlements | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/page.tsx` +10 |
| `PLATFORM-P0-04.5` | Quantity Limits | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/quantity-limits-section.tsx` +13 |
| `PLATFORM-P0-04.6` | Unlimited Support | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/quantity-limits-section.tsx` +11 |
| `PLATFORM-P0-04.7` | Plan Lifecycle | ✅ Done | `packages/core/src/admin/config-history.ts` +8 |

### Entitlement Engine

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-05.1` | Central Entitlement Service | ✅ Done | `packages/core/src/entitlements/feature-entitlement.ts` +7 |
| `PLATFORM-P0-05.2` | Entitlement Precedence | ✅ Done | `packages/core/src/entitlements/feature-entitlement.test.ts` +22 |
| `PLATFORM-P0-05.3` | Entitlement Evaluation | ✅ Done | `packages/core/src/entitlements/feature-entitlement.test.ts` +14 |
| `PLATFORM-P0-05.4` | Existing Licensing Integration | ✅ Done | `packages/core/src/admin/platform-plans.ts` +2 |

### Usage & Limits

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-06.1` | Usage Counters | ✅ Done | `packages/core/src/entitlements/limit-entitlement.test.ts` +9 |
| `PLATFORM-P0-06.2` | Usage Dashboard | ✅ Done | `packages/core/src/usage/dashboard.ts` +1 |
| `PLATFORM-P0-06.3` | Limit Enforcement | ✅ Done | `packages/core/src/components/limits/limit-reached-notice.tsx` +9 |
| `PLATFORM-P0-06.4` | Graceful Limit UX | ✅ Done | `packages/core/src/components/limits/limit-reached-notice.tsx` +4 |
| `PLATFORM-P0-06.5` | Soft vs Hard Limits | ✅ Done | `apps/web/app/platform/(protected)/plans/[id]/entitlements/quantity-limits-section.tsx` +12 |

### Module Administration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-07.1` | Module Registry | ✅ Done | `apps/web/app/platform/(protected)/modules/module-registry-table.tsx` +16 |
| `PLATFORM-P0-07.2` | Platform-Wide Module Kill Switch | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/not-licensed/page.tsx` +22 |
| `PLATFORM-P0-07.3` | Module Maintenance Mode | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/not-licensed/page.tsx` +17 |

### Feature Flags

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-08.1` | Global Feature Flags | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +7 |
| `PLATFORM-P0-08.2` | Feature Flag Scope | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +8 |
| `PLATFORM-P0-08.3` | Kill Switches | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +5 |
| `PLATFORM-P0-08.4` | Feature Flag Audit | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +8 |

### Internal AI Provider & Keys

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-09.1` | Internal AI Provider Registry | ✅ Done | `apps/web/app/platform/(protected)/ai-providers/actions.ts` +11 |
| `PLATFORM-P0-09.2` | Secure API Key Storage | ✅ Done | `apps/web/app/platform/(protected)/ai-providers/actions.ts` +9 |
| `PLATFORM-P0-09.3` | Provider Routing | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/page.tsx` +11 |
| `PLATFORM-P0-09.4` | AI Feature Policies | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/actions.ts` +8 |
| `PLATFORM-P0-09.5` | AI Usage | ✅ Done | `apps/web/app/platform/(protected)/ai-usage/page.tsx` +2 |

### AI Safety / Cost Controls

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-10.1` | Platform AI Budget | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/page.tsx` +8 |
| `PLATFORM-P0-10.2` | AI Circuit Breaker | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/page.tsx` +3 |
| `PLATFORM-P0-10.3` | Provider Failure Fallback | ✅ Done | `supabase/migrations/20260912400000_platform_email_provider.sql` |
| `PLATFORM-P0-10.4` | AI Feature Kill Switch | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/actions.ts` +13 |

### Global Email / Notification Configuration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-11.1` | Email Provider | ✅ Done | `apps/web/app/platform/(protected)/email-provider/actions.ts` +12 |
| `PLATFORM-P0-11.2` | System Email Templates | ✅ Done | `apps/web/app/platform/(protected)/email-templates/actions.ts` +10 |
| `PLATFORM-P0-11.3` | Notification Policies | ✅ Done | `apps/web/app/platform/(protected)/notification-policies/actions.ts` +6 |

### Global Integrations

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-12.1` | Integration Registry | ✅ Done | `apps/web/app/platform/(protected)/integrations/integration-registry-table.tsx` +5 |
| `PLATFORM-P0-12.2` | Integration Status | ✅ Done | `apps/web/app/platform/(protected)/integrations/actions.ts` +6 |
| `PLATFORM-P0-12.3` | Integration Kill Switch | ✅ Done | `apps/web/app/platform/(protected)/integrations/actions.ts` +6 |
| `PLATFORM-P0-12.4` | Credential Separation | ✅ Done | `packages/core/src/admin/platform-integrations.ts` +4 |

### Country / Compliance Pack Administration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-13.1` | Country Registry | ✅ Done | `apps/web/app/platform/(protected)/compliance/country-dialog.tsx` +9 |
| `PLATFORM-P0-13.2` | Compliance Pack Availability | ✅ Done | `apps/web/app/platform/(protected)/compliance/compliance-pack-table.tsx` +7 |
| `PLATFORM-P0-13.3` | Rule Version | ✅ Done | `apps/web/app/platform/(protected)/compliance/page.tsx` +3 |
| `PLATFORM-P0-13.4` | Compliance Feature Flags | ✅ Done | `apps/web/app/platform/(protected)/compliance/compliance-pack-table.tsx` +8 |

### Platform Policies

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-14.1` | Global System Policies | ✅ Done | `apps/web/app/platform/(protected)/system-policies/actions.ts` +6 |
| `PLATFORM-P0-14.2` | Data Retention Policy | ✅ Done | `apps/web/app/platform/(protected)/system-policies/actions.ts` +6 |
| `PLATFORM-P0-14.3` | Rate Limits | ✅ Done | `apps/web/app/platform/(protected)/system-policies/actions.ts` +6 |

### Global Announcements / Maintenance

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-15.1` | Announcement Manager | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +7 |
| `PLATFORM-P0-15.2` | Audience | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +6 |
| `PLATFORM-P0-15.3` | Scheduled Announcement | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +6 |
| `PLATFORM-P0-15.4` | Maintenance Mode | ✅ Done | `apps/web/app/platform/(protected)/announcements/actions.ts` +5 |

### Platform Audit

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-16.1` | Immutable Platform Audit Log | ✅ Done | `apps/web/app/platform/(protected)/audit/page.tsx` +6 |
| `PLATFORM-P0-16.2` | High-Risk Action Audit | ✅ Done | `apps/web/app/platform/(protected)/ai-providers/provider-config-dialog.tsx` +7 |
| `PLATFORM-P0-16.3` | Audit Search | ✅ Done | `apps/web/app/platform/(protected)/audit/actions.ts` +8 |
| `PLATFORM-P0-16.4` | Configuration History | ✅ Done | `apps/web/app/platform/(protected)/config-history/page.tsx` |

### Configuration Versioning

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-17.1` | Version Configuration | ✅ Done | `apps/web/app/platform/(protected)/config-history/actions.ts` +12 |
| `PLATFORM-P0-17.2` | Draft vs Published | ✅ Done | `apps/web/app/platform/(protected)/config-history/page.tsx` +1 |
| `PLATFORM-P0-17.3` | Rollback | ✅ Done | `apps/web/app/platform/(protected)/config-history/actions.ts` +11 |

### Platform Settings Import/Export

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-01.1` | Configuration Export | ⏸️ Deferred | Deferred 2026-10-10 by the owner: there is one Supabase project serving both dev and production, so there is no second environment to export configuration to or import it from. Build export/import (with secrets excluded) when a separate staging or production environment exists. |
| `PLATFORM-P1-01.2` | Configuration Import | ⏸️ Deferred | Deferred 2026-10-10 by the owner: there is one Supabase project serving both dev and production, so there is no second environment to export configuration to or import it from. Build export/import (with secrets excluded) when a separate staging or production environment exists. |
| `PLATFORM-P1-01.3` | Secret Exclusion | ⏸️ Deferred | Deferred 2026-10-10 by the owner: there is one Supabase project serving both dev and production, so there is no second environment to export configuration to or import it from. Build export/import (with secrets excluded) when a separate staging or production environment exists. |

### Business-Level Exceptions

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-02.1` | Business Override | ✅ Done | `apps/web/app/platform/(protected)/overrides/actions.ts` +12 |
| `PLATFORM-P1-02.2` | Temporary Entitlement | ✅ Done | `apps/web/app/platform/(protected)/overrides/actions.ts` +9 |
| `PLATFORM-P1-02.3` | Override Audit | ✅ Done | `apps/web/app/platform/(protected)/overrides/actions.ts` +7 |

### Customer Support Tools

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-03.1` | Customer Search | ✅ Done | `packages/core/src/usage/dashboard.ts` |
| `PLATFORM-P1-03.2` | Customer Configuration View | ✅ Done | `packages/core/src/usage/dashboard.ts` |
| `PLATFORM-P1-03.3` | Safe Impersonation | ✅ Done | `supabase/migrations/20260913480000_platform_audit_log.sql` |

### Subscription Lifecycle

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-04.1` | Plan Change Rules | ✅ Done | `packages/core/src/components/limits/limit-reached-notice.tsx` |
| `PLATFORM-P1-04.2` | Trial Configuration | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +13 |
| `PLATFORM-P1-04.3` | Grace Period | ✅ Done | `apps/web/app/api/cron/billing/route.ts` +12 |
| `PLATFORM-P1-04.4` | Cancellation Behavior | ✅ Done | `apps/web/app/platform/(protected)/billing/providers/page.tsx` +4 |

### Platform Billing Configuration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-05.1` | Currency | ✅ Done | `apps/web/app/platform/(protected)/billing/providers/provider-settings-dialog.tsx` |
| `PLATFORM-P1-05.2` | Billing Provider | ✅ Done | `apps/web/app/platform/(protected)/billing/providers/provider-settings-dialog.tsx` |
| `PLATFORM-P1-05.3` | Tax on Subscription Billing | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/plans/plan-picker.tsx` +8 |
| `PLATFORM-P1-05.4` | Price Versioning | ✅ Done | `apps/web/app/platform/(protected)/billing/subscriptions/[id]/page.tsx` +4 |

### Platform API Administration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-06.1` | API Policy | ⏸️ Deferred | Deferred 2026-10-10 by the owner: WonderArk has no public API or customer API keys yet, and webhook delivery policies already live in code per provider (signature checks, idempotent drains). Admin controls for an API that doesn't exist would be speculative (CLAUDE.md principle 7); build them with the first public API. |
| `PLATFORM-P1-06.2` | API Key Management | ⏸️ Deferred | Deferred 2026-10-10 by the owner: WonderArk has no public API or customer API keys yet, and webhook delivery policies already live in code per provider (signature checks, idempotent drains). Admin controls for an API that doesn't exist would be speculative (CLAUDE.md principle 7); build them with the first public API. |
| `PLATFORM-P1-06.3` | Webhook Policies | ⏸️ Deferred | Deferred 2026-10-10 by the owner: WonderArk has no public API or customer API keys yet, and webhook delivery policies already live in code per provider (signature checks, idempotent drains). Admin controls for an API that doesn't exist would be speculative (CLAUDE.md principle 7); build them with the first public API. |
| `PLATFORM-P1-06.4` | API Usage Dashboard | ⏸️ Deferred | Deferred 2026-10-10 by the owner: WonderArk has no public API or customer API keys yet, and webhook delivery policies already live in code per provider (signature checks, idempotent drains). Admin controls for an API that doesn't exist would be speculative (CLAUDE.md principle 7); build them with the first public API. |

### Observability & Operations

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-07.1` | System Health | ✅ Done | `apps/web/app/platform/(protected)/health/page.tsx` +2 |
| `PLATFORM-P1-07.2` | Error Rate | ✅ Done | `apps/web/app/platform/(protected)/health/page.tsx` +1 |
| `PLATFORM-P1-07.3` | Queue Health | ✅ Done | `apps/web/app/platform/(protected)/health/page.tsx` +1 |
| `PLATFORM-P1-07.4` | Operational Alerts | ✅ Done | `apps/web/app/api/cron/ops-alerts/route.ts` +6 |

### Release Management

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-08.1` | Platform Version | ✅ Done | `apps/web/app/platform/(protected)/health/page.tsx` +3 |
| `PLATFORM-P1-08.2` | Feature Rollout | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +8 |
| `PLATFORM-P1-08.3` | Rollback Flag | ✅ Done | `apps/web/app/platform/(protected)/feature-flags/actions.ts` +8 |

### Legal / Policy Configuration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-09.1` | Terms & Privacy Version | ✅ Done | `apps/web/app/platform/(protected)/legal/actions.ts` +11 |
| `PLATFORM-P1-09.2` | Cookie / Consent Configuration | ✅ Done | `apps/web/app/platform/(protected)/legal/page.tsx` +3 |
| `PLATFORM-P1-09.3` | Legal Link Management | ✅ Done | `apps/web/app/platform/(protected)/branding/page.tsx` +1 |
| `PLATFORM-P1-09.4` | Policy Acceptance Tracking | ✅ Done | `apps/web/app/(auth)/actions.test.ts` +13 |

### Platform Security Controls

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-18.1` | MFA Required for SUPERADMIN | ✅ Done | `apps/web/app/platform/(protected)/layout.tsx` +3 |
| `PLATFORM-P0-18.2` | Reauthentication for High-Risk Actions | ✅ Done | `apps/web/app/platform/impact-banner.tsx` +1 |
| `PLATFORM-P0-18.3` | Least Privilege | ✅ Done | `packages/core/src/rbac/platform-admin.ts` |
| `PLATFORM-P0-18.4` | Destructive Action Protection | ✅ Done | `apps/web/app/platform/impact-banner.tsx` +2 |

### Platform Administration UI

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P0-19.1` | Dedicated Admin Layout | ✅ Done | `apps/web/app/platform/layout.tsx` +2 |
| `PLATFORM-P0-19.2` | Global Impact Banner | ✅ Done | `apps/web/app/platform/impact-banner.tsx` |
| `PLATFORM-P0-19.3` | Desktop Tables | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/ai-feature-switches.tsx` +1 |
| `PLATFORM-P0-19.4` | Responsive Mobile | ✅ Done | `apps/web/app/platform/(protected)/ai-feature-policies/ai-feature-switches.tsx` +1 |
| `PLATFORM-P0-19.5` | Professional Layout Rule | ✅ Done | `apps/web/app/platform/platform-shell.tsx` |

### Organization Addresses and Environments (added 2026-10-13)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-10.1` | Organization Address | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +12 |
| `PLATFORM-P1-10.2` | Address Sign-in | ✅ Done | `apps/web/app/(auth)/actions.test.ts` +9 |
| `PLATFORM-P1-10.3` | Main Address Landing | ✅ Done | `apps/web/app/go/route.ts` +2 |
| `PLATFORM-P1-10.4` | Environments | ✅ Done | `packages/core/src/lib/org-address.ts` +1 |
| `PLATFORM-P1-10.5` | Environment Colours and Switching | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +3 |
| `PLATFORM-P1-10.6` | One Plan per Organization | ✅ Done | `packages/core/src/admin/platform-organizations.ts` +3 |
| `PLATFORM-P1-10.7` | Remove Environment | ✅ Done | `supabase/migrations/20261013100000_core_organization_addresses_environments.sql` |
| `PLATFORM-P1-10.8` | Manage Organizations | ✅ Done | `apps/web/app/(dashboard)/dashboard/organizations/actions.ts` +5 |
| `PLATFORM-P1-10.9` | Paid Environments | ✅ Done | `apps/web/app/(dashboard)/dashboard/organizations/actions.ts` +4 |
| `PLATFORM-P1-10.10` | Organizations Console | ✅ Done | `apps/web/app/platform/(protected)/organizations/[id]/page.tsx` +5 |
| `PLATFORM-P1-10.11` | Environment Console | ✅ Done | `apps/web/app/platform/(protected)/organizations/[id]/page.tsx` +4 |
| `PLATFORM-P1-10.12` | Organization Details | ✅ Done | `apps/web/app/platform/(protected)/organizations/actions.ts` +4 |
| `PLATFORM-P1-10.13` | Organization Announcements | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +8 |
| `PLATFORM-P1-10.14` | Organization Onboarding | ✅ Done | `apps/web/app/(dashboard)/dashboard/actions.ts` +6 |

### MCP Server (added 2026-10-14)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-11.1` | Read-only MCP Server | ✅ Done | `apps/web/app/api/mcp/route.ts` +2 |
| `PLATFORM-P1-11.2` | AI Agent over MCP | ✅ Done | `apps/web/app/api/mcp/route.ts` +5 |

### AI Replies on WhatsApp (added 2026-10-14)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-12.1` | AI-drafted WhatsApp replies | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/crm/conversations/actions.ts` +8 |
| `PLATFORM-P1-12.2` | Business facts for replies | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +10 |
| `PLATFORM-P1-12.3` | Order and job status facts | ✅ Done | `packages/module-crm/src/lib/ai/reply-draft-core.test.ts` +1 |
| `PLATFORM-P1-12.4` | Reply provenance | ✅ Done | `packages/module-crm/src/lib/ai/reply-draft.test.ts` +3 |
| `PLATFORM-P1-12.5` | Auto-send mode | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/crm/conversations/page.tsx` +20 |
| `PLATFORM-P1-12.6` | Auto-reply limits | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/crm/conversations/page.tsx` +20 |
| `PLATFORM-P1-12.7` | WhatsApp reply drafts over MCP | ✅ Done | `apps/web/app/api/mcp/route.ts` +6 |
| `PLATFORM-P1-11.3` | MCP entity types | ✅ Done | `apps/web/lib/mcp/server.test.ts` +1 |

### Careers via WonderJobs (added 2026-10-21)

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `PLATFORM-P1-13.1` | Public Careers pages | ✅ Done | `apps/web/app/(site)/careers/[id]/apply-form.tsx` +26 |
| `PLATFORM-P1-13.2` | Career-site key | ✅ Done | `apps/web/app/platform/(protected)/careers/actions.ts` +9 |

## Discovery — offering-centric upgrade

Source: [`docs/plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md`](./plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md)

### DISC-OFFER-P0-01 — Business Offering Foundation

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-01.1` | Introduce Business Offering | ✅ Done | `packages/module-discovery/src/components/offerings/offering-form-dialog.tsx` +14 |
| `DISC-OFFER-P0-01.2` | Existing Product Compatibility | ✅ Done | `packages/module-discovery/src/lib/offerings/types.ts` +2 |
| `DISC-OFFER-P0-01.3` | Business Offering Create/Edit UI | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +9 |

### DISC-OFFER-P0-02 — Offering Setup & ICP

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-02.1` | Offering Setup Wizard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +4 |
| `DISC-OFFER-P0-02.2` | Offering ICP Builder | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +8 |
| `DISC-OFFER-P0-02.3` | Offering Buyer Persona Definition | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +7 |

### DISC-OFFER-P0-03 — Offering-Centric Discovery Workspace

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-03.1` | Offering Context Selector | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/layout.tsx` +7 |
| `DISC-OFFER-P0-03.2` | Offering Discovery Overview | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/page.tsx` +1 |
| `DISC-OFFER-P0-03.3` | Offering Navigation | ✅ Done | `packages/module-discovery/src/components/tenancy/product-nav.tsx` |

### DISC-OFFER-P0-04 — Offering Discovery Strategy

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-04.1` | Discovery Definition | ✅ Done | `packages/module-discovery/src/components/discovery-definitions/definition-form-dialog.tsx` +4 |
| `DISC-OFFER-P0-04.2` | Discovery Play | ✅ Done | `packages/module-discovery/src/components/discovery-definitions/definition-form-dialog.tsx` +3 |

### DISC-OFFER-P0-05 — Opportunity Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-05.1` | Discovery Opportunity Model | ✅ Done | `packages/module-discovery/src/lib/opportunities/outcome-funnel.ts` +3 |
| `DISC-OFFER-P0-05.2` | Opportunity Score | ✅ Done | `packages/module-discovery/src/lib/opportunities/scoring.ts` +5 |
| `DISC-OFFER-P0-05.3` | Multi-Signal Correlation | ✅ Done | `packages/module-discovery/src/components/opportunities/signal-table.tsx` +8 |
| `DISC-OFFER-P0-05.4` | Why Now | ✅ Done | `packages/module-discovery/src/lib/opportunities/mutations.ts` +5 |
| `DISC-OFFER-P0-05.5` | Negative Signals | ✅ Done | `packages/module-discovery/src/lib/negative-signals/detect.ts` +8 |

### DISC-OFFER-P0-06 — Evidence & Research

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-06.1` | Evidence-Backed Research | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/prospects/[prospectId]/page.tsx` +4 |
| `DISC-OFFER-P0-06.2` | Offering Research Brief | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/prospects/[prospectId]/page.tsx` +9 |
| `DISC-OFFER-P0-06.3` | Buyer/Person Intelligence | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/prospects/[prospectId]/page.tsx` +13 |

### DISC-OFFER-P0-07 — Action-Oriented Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-07.1` | Next Best Action | ✅ Done | `packages/module-discovery/src/lib/opportunities/mutations.ts` +5 |
| `DISC-OFFER-P0-07.2` | Today's Opportunities | ✅ Done | `packages/module-discovery/src/components/opportunities/opportunities-dashboard.tsx` +7 |
| `DISC-OFFER-P0-07.3` | Opportunity Detail | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/actions.ts` +2 |

### DISC-OFFER-P0-08 — CRM Handoff

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-08.1` | Offering-Aware Discovery → CRM Handoff | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/crm/customers/[partyId]/page.tsx` +9 |
| `DISC-OFFER-P0-08.2` | Existing Relationship Detection | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/page.tsx` +10 |
| `DISC-OFFER-P0-08.3` | Handoff Status | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/actions.ts` +8 |

### DISC-OFFER-P1-01 — Continuous Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-01.1` | Saved Offering Discovery | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/actions.ts` +10 |
| `DISC-OFFER-P1-01.2` | Continuous Monitoring | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/actions.ts` +3 |
| `DISC-OFFER-P1-01.3` | Account Watchlist | ✅ Done | `packages/module-discovery/src/components/prospects/watchlist-dashboard.tsx` +4 |
| `DISC-OFFER-P1-01.4` | Grouped Opportunity Alerts | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +3 |

### DISC-OFFER-P1-02 — Discovery Quality & Learning

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-02.1` | Prospect Feedback | ✅ Done | `packages/module-discovery/src/lib/offerings/definition-quality.ts` +7 |
| `DISC-OFFER-P1-02.2` | Discovery Outcome Tracking | ✅ Done | `packages/module-discovery/src/components/pipeline/save-and-run-downstream-button.tsx` |
| `DISC-OFFER-P1-02.3` | Offering Performance Analysis | ✅ Done | `packages/module-discovery/src/components/pipeline/offering-performance-analysis.tsx` +5 |

### DISC-OFFER-P1-03 — AI Efficiency

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-03.1` | Progressive Intelligence | ✅ Done | `packages/module-discovery/src/components/offerings/offering-overview-summary.tsx` +2 |
| `DISC-OFFER-P1-03.2` | Research Cache | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/actions.ts` +3 |
| `DISC-OFFER-P1-03.3` | Provider-Agnostic Data Contracts | ⏸️ Deferred | Deferred 2026-10-10: no external enrichment provider exists to abstract -- company/person enrichment and signals all run as AI web search through lib/ai/router.ts, already provider-agnostic across OpenAI/Anthropic/Google, and technology detection / contact verification don't exist at all. Contracts for providers that don't exist would be speculative (CLAUDE.md principle 7); build them with the first real enrichment provider. See docs/design/discovery-offering-backlog-audit.md. |

### DISC-OFFER-P1-04 — Multi-Offering Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-04.1` | Cross-Offering Account View | ✅ Done | `packages/module-discovery/src/components/opportunities/opportunity-detail.tsx` +4 |
| `DISC-OFFER-P1-04.2` | Offering Portfolio Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/page.tsx` +3 |
| `DISC-OFFER-P1-04.3` | Offering-Specific Contact Relevance | ✅ Done | `packages/module-discovery/src/lib/buyer-intelligence/types.ts` |

### DISC-OFFER-P1-05 — Search & Interaction UX

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P1-05.1` | Offering-Scoped Search | ✅ Done | `packages/module-discovery/src/components/pipeline/run-ai-discovery-panel.tsx` |
| `DISC-OFFER-P1-05.2` | Editable Opportunity Rows | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/[opportunityId]/page.tsx` +5 |
| `DISC-OFFER-P1-05.3` | Responsive Opportunity Workspace | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/opportunities/actions.ts` +2 |
| `DISC-OFFER-P1-05.4` | Offering Overview UX Polish | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/page.tsx` +2 |

### Product Decision

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-09.1` | Website URL Business Onboarding | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +10 |
| `DISC-OFFER-P0-09.2` | Website Crawl & Content Discovery | ✅ Done | `packages/module-discovery/src/components/website-onboarding/website-onboarding-panel.tsx` +16 |
| `DISC-OFFER-P0-09.3` | AI Offering Extraction | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +11 |
| `DISC-OFFER-P0-09.4` | Offering Review Before Activation | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +7 |

### P0 EPIC — One-Click Autonomous Offering Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-10.1` | Run AI Discovery CTA | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/run-ai-discovery/route.ts` +13 |
| `DISC-OFFER-P0-10.2` | Persistent Pipeline Stage Model | ✅ Done | `packages/module-discovery/src/components/pipeline/run-ai-discovery-panel.tsx` +10 |
| `DISC-OFFER-P0-10.3` | Pipeline Progress UI | ✅ Done | `packages/module-discovery/src/components/opportunities/top-opportunity-gate.tsx` +5 |

### P0 EPIC — Human Override at Any Stage

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-11.1` | Editable Pipeline Stages | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +4 |
| `DISC-OFFER-P0-11.2` | Run From This Stage | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +5 |
| `DISC-OFFER-P0-11.3` | Stage Dependency Graph | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/actions.ts` +6 |

### P0 EPIC — Offering-Specific Website & External Research

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-12.1` | Offering-Specific Website Research | ✅ Done | `packages/module-discovery/src/lib/ai/understand-product.ts` +1 |
| `DISC-OFFER-P0-12.2` | External Opportunity Research | ✅ Done | `packages/module-discovery/src/components/opportunities/opportunity-detail.tsx` +5 |

### P0 EPIC — Structured Stage Contracts

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-13.1` | Structured Outputs | ✅ Done | `packages/module-discovery/src/lib/ai/schemas.ts` +6 |

### P0 EPIC — Run History and Audit

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-14.1` | Discovery Run History | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/history/[runId]/page.tsx` +13 |
| `DISC-OFFER-P0-14.2` | Versioned Stage Results | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/icp/page.tsx` +13 |

### P0 EPIC — Final Human Action Gate

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-OFFER-P0-15.1` | Recommended Action Gate | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/offerings/[productId]/actions.ts` +13 |

## Discovery — opportunity intelligence

Source: [`docs/plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md`](./plan/08-DISCOVERY-OPPORTUNITY-INTELLIGENCE-BACKLOG.md)

### P0 — Core Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.1` | Discovery Opportunity Domain Model | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.1`, which is what was built |
| `DISC-INTEL-01.2` | Signal Normalization Layer | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.1`, which is what was built |
| `DISC-INTEL-01.3` | Signal Freshness and Confidence | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.1`, which is what was built |
| `DISC-INTEL-01.4` | Multi-Signal Correlation Engine | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.3`, which is what was built |
| `DISC-INTEL-01.5` | Discovery Opportunity Score | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.2`, which is what was built |
| `DISC-INTEL-01.6` | Why Now Engine | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.4`, which is what was built |
| `DISC-INTEL-01.7` | Evidence-Backed AI Research | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-06.1`, which is what was built |
| `DISC-INTEL-01.8` | Prospect Research Brief | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-06.2`, which is what was built |
| `DISC-INTEL-01.9` | Buying Committee / Person Intelligence | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-06.3`, which is what was built |
| `DISC-INTEL-01.10` | Signal-to-Action Recommendation | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-07.1`, which is what was built |

### P0 — Discovery UX

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.11` | Today's Opportunities Dashboard | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-07.2`, which is what was built |
| `DISC-INTEL-01.12` | Responsive Opportunity Cards / Proto Table | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-05.3`, which is what was built |
| `DISC-INTEL-01.13` | Opportunity Detail View | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-07.3`, which is what was built |

### P1 — Continuous Discovery

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.14` | Saved Discovery Definition | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-01.1`, which is what was built |
| `DISC-INTEL-01.15` | Account Watchlist | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-01.3`, which is what was built |
| `DISC-INTEL-01.16` | Opportunity Alerts | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-01.4`, which is what was built |
| `DISC-INTEL-01.17` | Discovery Plays | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-04.2`, which is what was built |

### P1 — Negative Signals and Uncertainty

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.18` | Negative / Disqualifying Signals | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-05.5`, which is what was built |
| `DISC-INTEL-01.19` | Insufficient Evidence State | 🔁 Superseded | Backlog 08 was superseded by the offering-centric backlog; this story has no direct equivalent there — re-scope it if it is still wanted |

### P1 — Feedback / Learning

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.20` | Prospect Feedback | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.1`, which is what was built |
| `DISC-INTEL-01.21` | Discovery Learning Dataset | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.2`, which is what was built |
| `DISC-INTEL-01.22` | Controlled Feedback-Driven Adjustment | 🔁 Superseded | Backlog 08 was superseded by the offering-centric backlog; this story has no direct equivalent there — re-scope it if it is still wanted |

### P1 — AI Cost / Provider Architecture

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.23` | Progressive Intelligence Pipeline | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-03.1`, which is what was built |
| `DISC-INTEL-01.24` | AI Research Cache | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-03.2`, which is what was built |
| `DISC-INTEL-01.25` | Provider-Agnostic Data Contracts | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-03.3`, which is what was built |

### P1 — CRM Handoff

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.26` | Discovery → CRM Opportunity Handoff | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-08.1`, which is what was built |
| `DISC-INTEL-01.27` | Existing Customer / Relationship Detection | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-08.2`, which is what was built |
| `DISC-INTEL-01.28` | Discovery Opportunity Lifecycle | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P0-08.3`, which is what was built |

### P2 — Analytics

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-INTEL-01.29` | Discovery Performance Dashboard | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.3`, which is what was built |
| `DISC-INTEL-01.30` | Opportunity Quality Analysis | 🔁 Superseded | Restated at the offering grain as `DISC-OFFER-P1-02.3`, which is what was built |

## Compliance / Finance — global tax

Source: [`docs/plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md`](./plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md)

### COMPLY-P0-01 — Compliance Shell & Country Switch

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-01.1` | Rename GST UI to Compliance | ✅ Done | The module shipped as Compliance and has since been renamed again to Finance — `packages/module-registry/src/index.ts` |
| `COMPLY-P0-01.2` | Country Selector | ✅ Done | `packages/module-gst/src/components/compliance/country-bar.tsx` +7 |
| `COMPLY-P0-01.3` | Tax Regime Selector | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/actions.ts` +5 |
| `COMPLY-P0-01.4` | Context Persistence | ✅ Done | `scripts/test-gst-compliance-profile-rls.mjs` +2 |
| `COMPLY-P0-01.5` | Unsupported-Country UX | ✅ Done | `packages/module-gst/src/components/compliance/country-bar.tsx` +3 |

### COMPLY-P0-02 — Generic Tax Framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-02.1` | Tax Registration | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/registrations/actions.ts` +14 |
| `COMPLY-P0-02.2` | Tax Jurisdiction | ✅ Done | `packages/module-gst/src/lib/compliance/jurisdictions.ts` +7 |
| `COMPLY-P0-02.3` | Versioned Tax Rules | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/rules.ts` +22 |
| `COMPLY-P0-02.4` | Tax Treatments | ✅ Done | `packages/module-gst/src/lib/compliance/treatments.ts` +9 |
| `COMPLY-P0-02.5` | Tax Determination Snapshot | ✅ Done | `packages/module-gst/src/lib/gst-tax-determination/mutations.ts` +8 |

### COMPLY-P0-03 — Existing-Data Integration

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-03.1` | Core Transaction Contract | ✅ Done | `packages/module-gst/src/lib/core-transactions/queries.ts` +11 |
| `COMPLY-P0-03.2` | Inventory Tax Context | ✅ Done | `packages/module-gst/src/lib/fsm-tax-context/queries.ts` +9 |
| `COMPLY-P0-03.3` | FSM Tax Context | ✅ Done | `packages/module-gst/src/lib/fsm-tax-context/queries.ts` +1 |
| `COMPLY-P0-03.4` | Party Tax Context | ✅ Done | `packages/module-gst/src/lib/einvoice-schema-validation/queries.ts` +13 |
| `COMPLY-P0-03.5` | No Duplicate Masters | ✅ Done | `scripts/lint-gst-no-duplicate-masters.mjs` +1 |

### COMPLY-P0-04 — India GST

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-04.1` | GSTIN Management | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/registrations/actions.ts` +19 |
| `COMPLY-P0-04.2` | GST Profile | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/registrations/actions.ts` +15 |
| `COMPLY-P0-04.3` | HSN/SAC | ✅ Done | `packages/module-gst/src/lib/information-returns/queries.ts` +5 |
| `COMPLY-P0-04.4` | Place of Supply | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/place-of-supply.ts` +11 |
| `COMPLY-P0-04.5` | GST Tax Determination | ✅ Done | `packages/module-gst/src/lib/eu-vat-determination/determine.ts` +11 |
| `COMPLY-P0-04.6` | GST Invoice Validation | ✅ Done | `packages/module-gst/src/lib/einvoice-schema-validation/queries.ts` +4 |
| `COMPLY-P0-04.7` | GST Rule Versioning | ✅ Done | `packages/module-gst/src/lib/einvoice-eligibility/threshold.ts` +14 |

### COMPLY-P0-05 — India E-Invoice

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-05.1` | E-Invoice Eligibility | ✅ Done | `packages/module-gst/src/lib/einvoice-eligibility/determine.ts` +20 |
| `COMPLY-P0-05.2` | Schema Validation | ✅ Done | `packages/module-gst/src/lib/einvoice-schema-validation/queries.ts` +2 |
| `COMPLY-P0-05.3` | IRP Adapter | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +18 |
| `COMPLY-P0-05.4` | IRN/QR Response | ✅ Done | `packages/module-gst/src/lib/einvoice-status/determine.ts` +14 |
| `COMPLY-P0-05.5` | Reporting Deadline Control | ✅ Done | `packages/module-gst/src/lib/einvoice-reporting-window/determine.ts` +12 |
| `COMPLY-P0-05.6` | E-Invoice Status | ✅ Done | `packages/module-gst/src/lib/einvoice-status/determine.ts` +8 |

### COMPLY-P0-06 — India E-Way Bill

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-06.1` | Eligibility Engine | ✅ Done | `packages/module-gst/src/lib/eway-bill-document-link/queries.ts` +10 |
| `COMPLY-P0-06.2` | Movement Data | ✅ Done | `packages/module-gst/src/lib/eway-bill-document-link/link.ts` +13 |
| `COMPLY-P0-06.3` | E-Way Adapter | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +15 |
| `COMPLY-P0-06.4` | Document Link | ✅ Done | `packages/module-gst/src/lib/eway-bill-document-link/link.ts` +5 |

### COMPLY-P0-07 — India Returns

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-07.1` | GSTR-1 Preparation | ✅ Done | `packages/module-gst/src/lib/returns/drilldown/reconciliation.test.ts` +18 |
| `COMPLY-P0-07.2` | GSTR-3B Preparation | ✅ Done | `packages/module-gst/src/lib/returns/drilldown/reconciliation.test.ts` +15 |
| `COMPLY-P0-07.3` | GSTR-9 Preparation | ✅ Done | `packages/module-gst/src/lib/returns/drilldown/reconciliation.test.ts` +6 |
| `COMPLY-P0-07.4` | Return Drill-Down | ✅ Done | `packages/module-gst/src/lib/filing/types.ts` +11 |
| `COMPLY-P0-07.5` | Return Review Workflow | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +14 |
| `COMPLY-P0-07.6` | Return Lock | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +11 |
| `COMPLY-P0-07.7` | Filing/Payment Status | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +10 |

### COMPLY-P0-08 — India Reconciliation & IMS

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-08.1` | GSTR-2B Fetch/Import | ✅ Done | `packages/module-gst/src/lib/government-responses/queries.ts` +19 |
| `COMPLY-P0-08.2` | Purchase-to-2B Matching | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/reconciliation/page.tsx` +9 |
| `COMPLY-P0-08.3` | Match Explanation | ✅ Done | `packages/module-gst/src/lib/reconciliation/explain.ts` +3 |
| `COMPLY-P0-08.4` | IMS Accept/Reject/Pending | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/reconciliation/page.tsx` +11 |
| `COMPLY-P0-08.5` | ITC Availability View | ✅ Done | `packages/module-gst/src/lib/exceptions/derive.ts` +4 |
| `COMPLY-P0-08.6` | Exception Queue | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/reconciliation/actions.ts` +12 |

### COMPLY-P0-09 — Compliance Calendar & Risk

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-09.1` | Filing Calendar | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +12 |
| `COMPLY-P0-09.2` | Payment Calendar | ✅ Done | `packages/module-gst/src/lib/calendar/due-dates.ts` +4 |
| `COMPLY-P0-09.3` | Reminder Engine | ✅ Done | `apps/web/app/api/cron/send-compliance-reminders/route.ts` +5 |
| `COMPLY-P0-09.4` | Overdue Detection | ✅ Done | `packages/module-gst/src/lib/calendar/overdue.ts` +3 |
| `COMPLY-P0-09.5` | Risk Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +7 |

### COMPLY-P0-10 — Evidence & Audit

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-10.1` | Evidence Repository | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/evidence/actions.ts` +8 |
| `COMPLY-P0-10.2` | Government Response Store | ✅ Done | `packages/module-gst/src/lib/einvoicing/queries.ts` +8 |
| `COMPLY-P0-10.3` | Audit Trail | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/audit-log/page.tsx` +2 |
| `COMPLY-P0-10.4` | Source Traceability | ✅ Done | `packages/module-gst/src/lib/einvoice-eligibility/types.ts` +4 |
| `COMPLY-P0-10.5` | Retention Rules | ✅ Done | `packages/module-gst/src/lib/evidence/mutations.ts` +7 |

### COMPLY-P0-11 — Compliance UI

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P0-11.1` | Overview Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +1 |
| `COMPLY-P0-11.2` | Desktop Table Presentation | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` |
| `COMPLY-P0-11.3` | Responsive Mobile Cards | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` |
| `COMPLY-P0-11.4` | Row-Level Actions | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +3 |
| `COMPLY-P0-11.5` | Clear Status Hierarchy | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/finance/dashboard/page.tsx` +3 |

### COMPLY-P1-01 — EU VAT Framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-01.1` | EU VAT Core | ✅ Done | `packages/module-gst/src/lib/compliance/eu.ts` |
| `COMPLY-P1-01.2` | Member State Country Packs | ✅ Done | `packages/module-gst/src/lib/compliance/countries.ts` +5 |
| `COMPLY-P1-01.3` | Intra-EU VAT | ✅ Done | `packages/module-gst/src/lib/compliance/eu.ts` +6 |
| `COMPLY-P1-01.4` | OSS/IOSS | ✅ Done | `packages/module-gst/src/lib/compliance/eu.ts` +5 |
| `COMPLY-P1-01.5` | VAT ID Validation / VIES Where Supported | ✅ Done | `packages/module-gst/src/lib/eu-vat-determination/types.ts` +5 |
| `COMPLY-P1-01.6` | Country-Specific E-Invoicing | ✅ Done | `packages/module-gst/src/lib/einvoicing-be/adapter.ts` +11 |

### COMPLY-P1-02 — United States

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-02.1` | State/Local Jurisdictions | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/registration.ts` +13 |
| `COMPLY-P1-02.2` | Economic Nexus Tracker | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/registration.ts` +9 |
| `COMPLY-P1-02.3` | Physical Nexus Inputs | ✅ Done | `packages/module-gst/src/lib/us-nexus/obligations.ts` +5 |
| `COMPLY-P1-02.4` | Sales Tax Registration Obligations | ✅ Done | `packages/module-gst/src/lib/singapore-gst/registration.ts` +5 |
| `COMPLY-P1-02.5` | Product/Service Taxability | ✅ Done | `packages/module-gst/src/lib/exemption-certificates/types.ts` +16 |
| `COMPLY-P1-02.6` | Exemption Certificates | ✅ Done | `packages/module-gst/src/lib/exemption-certificates/mutations.ts` +9 |
| `COMPLY-P1-02.7` | Sales Tax Returns/Remittance | ✅ Done | `packages/module-gst/src/lib/compliance/us-states.ts` +10 |
| `COMPLY-P1-02.8` | 1099 Information Returns | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/registration.ts` +8 |

### COMPLY-P1-03 — Canada

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-03.1` | GST/HST | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/rules.ts` +6 |
| `COMPLY-P1-03.2` | Provincial PST/QST/RST | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +4 |
| `COMPLY-P1-03.3` | Place of Supply | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/place-of-supply.ts` |
| `COMPLY-P1-03.4` | Filing Periods | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/filing-frequency.ts` +6 |
| `COMPLY-P1-03.5` | CRA Filing Adapter | ✅ Done | `packages/module-gst/src/lib/canada-gst-hst/queries.ts` +3 |

### COMPLY-P1-04 — Singapore

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-04.1` | GST Registration | ✅ Done | `packages/module-gst/src/lib/singapore-gst/registration.ts` +2 |
| `COMPLY-P1-04.2` | GST F5 | ✅ Done | `packages/module-gst/src/lib/singapore-gst/queries.ts` +5 |
| `COMPLY-P1-04.3` | InvoiceNow Eligibility | ✅ Done | `packages/module-gst/src/lib/einvoicing-sg/mandate.ts` +2 |
| `COMPLY-P1-04.4` | Peppol Identifier | ✅ Done | `packages/module-gst/src/lib/tax-registrations/sg-registration-profile.ts` |
| `COMPLY-P1-04.5` | InvoiceNow Adapter | ✅ Done | `packages/module-gst/src/lib/einvoicing-sg/adapter.ts` +5 |
| `COMPLY-P1-04.6` | Transmission Status | ✅ Done | `packages/module-gst/src/lib/einvoicing-sg/queries.ts` +5 |
| `COMPLY-P1-04.7` | Five-Year Record Retention | ✅ Done | `packages/module-gst/src/lib/retention/compute.ts` +4 |

### COMPLY-P1-05 — UAE

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-05.1` | VAT Registration | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-05.2` | VAT Return | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-05.3` | EmaraTax Adapter | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-05.4` | VAT Mismatch Review | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-05.5` | Voluntary Disclosure | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-05.6` | UAE E-Invoicing Readiness | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

### COMPLY-P1-06 — Saudi Arabia

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-06.1` | ZATCA Registration Context | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-06.2` | Fatoora Adapter | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-06.3` | Structured Invoice Validation | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-06.4` | Clearance/Reporting | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-06.5` | QR/Security Evidence | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-06.6` | Integration-Wave Tracking | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

### COMPLY-P1-07 — Australia / New Zealand

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-07.1` | Australia GST | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-07.2` | BAS | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-07.3` | Peppol eInvoicing | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-07.4` | New Zealand GST | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-07.5` | NZ Filing Frequency | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

### COMPLY-P1-08 — Asia

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-08.1` | Malaysia SST | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-08.2` | Thailand VAT | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-08.3` | Indonesia VAT/e-Faktur | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-08.4` | Japan Consumption Tax/Qualified Invoice | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-08.5` | South Korea VAT/e-Tax Invoice | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

### COMPLY-P1-09 — Government Integration Framework

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-09.1` | Common Adapter Contract | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-09.2` | Secure Credential Store | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-09.3` | Submission Idempotency | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-09.4` | Retry Handling | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-09.5` | Integration Health | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

### COMPLY-P1-10 — AI Compliance Assistant

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-10.1` | "What do I need to file?" | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-10.2` | Explain My Tax | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-10.3` | Explain a Mismatch | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-10.4` | Filing Readiness Summary | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-10.5` | Anomaly Detection | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-10.6` | Compliance Research Assistant | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

### COMPLY-P1-11 — Compliance Risk Center

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-11.1` | Risk Register | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-11.2` | Risk Severity | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-11.3` | Risk Owner | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-11.4` | Remediation Workflow | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

### COMPLY-P1-12 — Cross-Module Compliance Intelligence

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `COMPLY-P1-12.1` | Inventory Tax Readiness | ✅ Done | `packages/module-gst/src/lib/inventory-tax-context/queries.ts` |
| `COMPLY-P1-12.2` | FSM Tax Readiness | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-12.3` | CRM Customer Tax Context | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-12.4` | Payment-to-Tax Reconciliation | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |
| `COMPLY-P1-12.5` | Core Domain Events | ⏸️ Deferred | Deferred by the owner 2026-10-10: global tax (UAE, KSA, AU/NZ, SE Asia, shared filing plumbing, AI tax help, risk register) waits until WonderArk targets those markets; India-only until then. |

## Discovery — Marketing, Customer Acquisition & Funding

Source: [`docs/plan/12-DISCOVERY-MARKETING-FUNDING-BACKLOG.md`](./plan/12-DISCOVERY-MARKETING-FUNDING-BACKLOG.md)

### Navigation

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-NAV-01` | Discovery sidebar hierarchy | ✅ Done | `apps/web/tests/discovery-nav-routes.test.ts` +3 |
| `DISC-NAV-02` | Business Offering navigation | ✅ Done | `apps/web/tests/discovery-nav-routes.test.ts` +3 |
| `DISC-NAV-03` | Customer Acquisition navigation adapter | ✅ Done | `apps/web/tests/discovery-nav-routes.test.ts` +3 |
| `DISC-NAV-04` | Marketing navigation | ✅ Done | `apps/web/e2e/authenticated/marketing.spec.ts` +5 |
| `DISC-NAV-05` | Funding navigation | ✅ Done | `apps/web/e2e/authenticated/funding.spec.ts` +4 |
| `DISC-NAV-06` | Responsive navigation | ✅ Done | `packages/module-discovery/src/components/marketing/section-tabs.tsx` |

### Marketing

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `MKT-01` | Marketing domain foundation | ✅ Done | `packages/module-discovery/src/lib/marketing/mutations.test.ts` +5 |
| `MKT-02` | Marketing database | ✅ Done | `supabase/migrations/20260925100000_discovery_marketing.sql` |
| `MKT-03` | Marketing Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +13 |
| `MKT-04` | Strategy | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +10 |
| `MKT-05` | Campaigns | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +11 |
| `MKT-06` | Campaign metrics | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +8 |
| `MKT-07` | Attribution | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +5 |
| `MKT-08` | Content Studio | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +10 |
| `MKT-09` | Content AI | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +8 |
| `MKT-10` | Content Calendar | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +6 |
| `MKT-11` | Assets | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +4 |
| `MKT-12` | Website & SEO | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/actions.ts` +4 |
| `MKT-13` | AI-search visibility | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/layout.tsx` +4 |
| `MKT-14` | Marketing Analytics | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/marketing/analytics/page.tsx` +10 |
| `MKT-15` | Notifications | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +3 |
| `MKT-16` | Marketing recommendations | ✅ Done | `apps/web/e2e/authenticated/discovery-flows.spec.ts` +3 |

### Funding

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `FND-01` | Funding domain foundation | ✅ Done | `packages/module-discovery/src/lib/funding/mutations.test.ts` +5 |
| `FND-02` | Funding database | ✅ Done | `supabase/migrations/20260925110000_discovery_funding.sql` |
| `FND-03` | Funding Dashboard | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +9 |
| `FND-04` | Funding Profile | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +4 |
| `FND-05` | Investor Readiness | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +5 |
| `FND-06` | Fundraising Rounds | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +10 |
| `FND-07` | Investor Database | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +6 |
| `FND-08` | Investor Research | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +7 |
| `FND-09` | Investor Pipeline | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +10 |
| `FND-10` | Investor Interactions | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +4 |
| `FND-11` | Investor Outreach | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +14 |
| `FND-12` | Data Room | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +11 |
| `FND-13` | Due Diligence | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +11 |
| `FND-14` | Funding Analytics | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/analytics/page.tsx` +6 |
| `FND-15` | Finance read integration | ✅ Done | `apps/web/e2e/authenticated/discovery-flows.spec.ts` +3 |
| `FND-16` | Funding AI | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/discovery/funding/actions.ts` +9 |
| `FND-17` | Funding notifications | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +3 |

### Cross-domain

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `INT-01` | Discovery data context | ✅ Done | `packages/module-discovery/src/lib/intelligence/context.ts` |
| `INT-02` | Evidence model | ✅ Done | `packages/module-discovery/src/lib/intelligence/types.ts` +2 |
| `INT-03` | Recommendations | ✅ Done | `packages/module-discovery/src/lib/funding/attention.ts` +2 |
| `INT-04` | Notification integration | ✅ Done | `packages/module-crm/src/lib/timeline/queries.ts` +1 |
| `INT-05` | Scheduled intelligence | ⏸️ Deferred | Spec §57–§58: not to be built until an unattended-execution design exists — see `docs/plan/12-DISCOVERY-MARKETING-FUNDING-BACKLOG.md` |

### AI governance

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `DISC-AI-APPROVAL-01` | Per-business AI approvals setting for Auto-Populate and Run AI Discovery | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/actions.ts` +23 |

## CSV / Excel export

Source: [`docs/plan/13-DATA-EXPORT-BACKLOG.md`](./plan/13-DATA-EXPORT-BACKLOG.md)

### 21a. Story index

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `EXP-PLAT-01` | Shared Export Contract | ✅ Done | `packages/core/src/exports/types.ts` |
| `EXP-PLAT-02` | CSV Export Engine | ✅ Done | `packages/core/src/exports/csv.test.ts` +4 |
| `EXP-PLAT-03` | Excel Export Engine | ✅ Done | `packages/core/src/exports/format.ts` +3 |
| `EXP-PLAT-04` | Shared Export UI | ✅ Done | `packages/core/src/components/exports/export-menu.test.ts` +1 |
| `EXP-PLAT-05` | Secure Export Route / Server Action | ✅ Done | `apps/web/app/api/exports/[exportId]/route.ts` +8 |
| `EXP-PLAT-06` | Large Export Job | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +11 |
| `EXP-DISC-01` | Business / Business Offerings Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/business.test.ts` +6 |
| `EXP-DISC-02` | Discovery Dashboard Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/dashboard.test.ts` +5 |
| `EXP-DISC-03` | Offering Prospects Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/index.ts` +6 |
| `EXP-DISC-04` | Prospect Detail / Buyer Intelligence Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/index.ts` +4 |
| `EXP-DISC-05` | Opportunity Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/index.ts` +4 |
| `EXP-DISC-06` | ICP Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/icp.test.ts` +4 |
| `EXP-DISC-07` | Research / Signals Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/index.ts` +4 |
| `EXP-DISC-08` | Outreach Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/index.ts` +4 |
| `EXP-DISC-09` | Opportunity / Pipeline Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/index.ts` +4 |
| `EXP-DISC-10` | Conversion Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/conversions.test.ts` +6 |
| `EXP-DISC-11` | Offering Performance Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/index.ts` +6 |
| `EXP-DISC-12` | Discovery History / Usage / Watchlist Export | ✅ Done | `packages/module-discovery/src/exports/customer-acquisition/history.test.ts` +10 |
| `EXP-MKT-01` | Marketing Dashboard Export | ✅ Done | `packages/module-discovery/src/exports/marketing/dashboard.test.ts` +6 |
| `EXP-MKT-02` | Marketing Strategy Export | ✅ Done | `packages/module-discovery/src/exports/marketing/index.ts` +6 |
| `EXP-MKT-03` | Campaign List Export | ✅ Done | `packages/module-discovery/src/exports/marketing/campaigns.test.ts` +6 |
| `EXP-MKT-04` | Campaign Detail / Performance Export | ✅ Done | `packages/module-discovery/src/exports/marketing/campaign-detail.test.ts` +6 |
| `EXP-MKT-05` | Content Export | ✅ Done | `packages/module-discovery/src/exports/marketing/content.test.ts` +6 |
| `EXP-MKT-06` | Assets / Website SEO Export | ✅ Done | `packages/module-discovery/src/exports/marketing/assets.test.ts` +8 |
| `EXP-MKT-07` | Marketing Analytics Export | ✅ Done | `packages/module-discovery/src/exports/marketing/analytics.test.ts` +6 |
| `EXP-FND-01` | Funding Dashboard Export | ✅ Done | `packages/module-discovery/src/exports/funding/dashboard.test.ts` +5 |
| `EXP-FND-02` | Funding Profile Export | ✅ Done | `packages/module-discovery/src/exports/funding/index.ts` +5 |
| `EXP-FND-03` | Investor Readiness Export | ✅ Done | `packages/module-discovery/src/exports/funding/index.ts` +5 |
| `EXP-FND-04` | Fundraising Rounds Export | ✅ Done | `packages/module-discovery/src/exports/funding/index.ts` +5 |
| `EXP-FND-05` | Investors List Export | ✅ Done | `packages/module-discovery/src/exports/funding/index.ts` +7 |
| `EXP-FND-06` | Investor Detail Export | ✅ Done | `packages/module-discovery/src/exports/funding/index.ts` +6 |
| `EXP-FND-07` | Investor Pipeline Export | ✅ Done | `packages/module-discovery/src/exports/funding/index.ts` +6 |
| `EXP-FND-08` | Investor Outreach Export | ✅ Done | `packages/module-discovery/src/exports/funding/index.ts` +7 |
| `EXP-FND-09` | Data Room Metadata Export | ✅ Done | `packages/module-discovery/src/exports/funding/data-room.test.ts` +7 |
| `EXP-FND-10` | Due Diligence and Funding Analytics Export | ✅ Done | `packages/module-discovery/src/exports/funding/analytics.test.ts` +7 |
| `EXP-CRM-01` | CRM Dashboard Export | ✅ Done | `packages/module-crm/src/exports/dashboard.test.ts` +7 |
| `EXP-CRM-02` | Leads Export | ✅ Done | `packages/module-crm/src/exports/index.ts` +6 |
| `EXP-CRM-03` | Opportunities Export | ✅ Done | `packages/module-crm/src/exports/index.ts` +7 |
| `EXP-CRM-04` | CRM Analytics Export | ✅ Done | `packages/module-crm/src/exports/analytics.test.ts` +7 |
| `EXP-CRM-05` | Lost Business Export | ✅ Done | `packages/module-crm/src/exports/index.ts` +8 |
| `EXP-CRM-06` | Reactivation Export | ✅ Done | `packages/module-crm/src/exports/index.ts` +6 |
| `EXP-CRM-07` | Follow-up Queue Export | ✅ Done | `packages/module-crm/src/exports/follow-ups.test.ts` +7 |
| `EXP-CRM-08` | Reviews Export | ✅ Done | `packages/module-crm/src/exports/index.ts` +6 |
| `EXP-CRM-09` | Conversations / WhatsApp Export | ✅ Done | `packages/module-crm/src/exports/conversations.test.ts` +6 |
| `EXP-CRM-10` | Customer 360 / Exceptions Export | ✅ Done | `packages/module-crm/src/exports/customer-360.test.ts` +9 |
| `EXP-INV-01` | Inventory Dashboard Export | ✅ Done | `packages/module-inventory/src/exports/dashboard.test.ts` +6 |
| `EXP-INV-02` | Products Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +6 |
| `EXP-INV-03` | Customers Export | ✅ Done | `packages/module-inventory/src/exports/customers.test.ts` +6 |
| `EXP-INV-04` | Suppliers Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +6 |
| `EXP-INV-05` | Warehouses Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +6 |
| `EXP-INV-06` | Stock Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +6 |
| `EXP-INV-07` | Purchase Orders Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +6 |
| `EXP-INV-08` | Sales Orders Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +6 |
| `EXP-INV-09` | Sales Invoices and Returns Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +8 |
| `EXP-INV-10` | Stock Transfers Export | ✅ Done | `packages/module-inventory/src/exports/index.ts` +6 |
| `EXP-INV-11` | Alerts Export | ✅ Done | `packages/module-inventory/src/exports/alerts.test.ts` +6 |
| `EXP-INV-12` | Inventory Audit Log Export | ✅ Done | `packages/module-inventory/src/exports/audit-log.test.ts` +6 |
| `EXP-FSM-01` | FSM Dashboard Export | ✅ Done | `packages/module-fsm/src/exports/dashboard.test.ts` +6 |
| `EXP-FSM-02` | Customers Export | ✅ Done | `packages/module-fsm/src/exports/customers.test.ts` +6 |
| `EXP-FSM-03` | Jobs Export | ✅ Done | `packages/module-fsm/src/exports/index.test.ts` +6 |
| `EXP-FSM-04` | Opportunities Export | ✅ Done | `packages/module-fsm/src/exports/index.test.ts` +6 |
| `EXP-FSM-05` | Invoices Export | ✅ Done | `packages/module-fsm/src/exports/index.test.ts` +6 |
| `EXP-FSM-06` | Schedule Export | ✅ Done | `packages/module-fsm/src/exports/index.test.ts` +6 |
| `EXP-FSM-07` | My Day Export | ✅ Done | `packages/module-fsm/src/exports/index.test.ts` +6 |
| `EXP-FSM-08` | FSM Reports Export | ✅ Done | `packages/module-fsm/src/exports/index.test.ts` +6 |
| `EXP-FSM-09` | Assessment Export | ✅ Done | `packages/module-fsm/src/exports/assessment.test.ts` +6 |
| `EXP-FIN-01` | Finance Dashboard Export | ✅ Done | `packages/module-gst/src/exports/dashboard.test.ts` +6 |
| `EXP-FIN-02` | Chart of Accounts Export | ✅ Done | `packages/module-gst/src/exports/accounts.test.ts` +6 |
| `EXP-FIN-03` | Bills and Expenses Export | ✅ Done | `packages/module-gst/src/exports/bills.test.ts` +8 |
| `EXP-FIN-04` | Payables Export | ✅ Done | `packages/module-gst/src/exports/index.test.ts` +8 |
| `EXP-FIN-05` | Receivables Export | ✅ Done | `packages/module-gst/src/exports/index.test.ts` +8 |
| `EXP-FIN-06` | Journal Export | ✅ Done | `packages/module-gst/src/exports/index.test.ts` +8 |
| `EXP-FIN-07` | GST Ledger Export | ✅ Done | `packages/module-gst/src/exports/gst-ledger.test.ts` +8 |
| `EXP-FIN-08` | Bank / Reconciliation Export | ✅ Done | `packages/module-gst/src/exports/bank.test.ts` +9 |
| `EXP-FIN-09` | Recurring Entries Export | ✅ Done | `packages/module-gst/src/exports/index.test.ts` +6 |
| `EXP-FIN-10` | Budget vs Actual Export | ✅ Done | `packages/module-gst/src/exports/budget.test.ts` +7 |
| `EXP-FIN-11` | Financial Statements Export | ✅ Done | `packages/module-gst/src/exports/index.test.ts` +7 |
| `EXP-FIN-12` | Filing Export | ✅ Done | `packages/module-gst/src/exports/filing.test.ts` +8 |
| `EXP-FIN-13` | Filing Readiness Export | ✅ Done | `packages/module-gst/src/exports/filing-readiness.test.ts` +8 |
| `EXP-FIN-14` | E-invoice / E-way Bill Export | ⏸️ Deferred | No e-invoice or e-way bill transaction list exists yet -- /finance/einvoicing and /finance/eway-bill are credential forms only, which §31 excludes. Export arrives with the first transaction list. |
| `EXP-FIN-15` | Finance Exceptions Export | ✅ Done | `packages/module-gst/src/exports/exceptions.test.ts` +7 |
| `EXP-FIN-16` | Finance Evidence Export | ✅ Done | `packages/module-gst/src/exports/evidence.test.ts` +6 |
| `EXP-FIN-17` | Audit / Backfill / Activation Export | ✅ Done | `packages/module-gst/src/exports/activation.test.ts` +12 |
| `EXP-ADMIN-01` | Platform Audit Export | ✅ Done | `apps/web/app/platform/(protected)/audit/audit-search-explorer.tsx` +5 |
| `EXP-ADMIN-02` | AI Usage Export | ✅ Done | `apps/web/lib/exports/platform/ai-usage.ts` +4 |
| `EXP-ADMIN-03` | Integrations Export | ✅ Done | `apps/web/lib/exports/platform/index.ts` +4 |
| `EXP-ADMIN-04` | Plans / Entitlements Export | ✅ Done | `apps/web/lib/exports/platform/index.ts` +4 |
| `EXP-ADMIN-05` | Compliance Registry Export | ✅ Done | `apps/web/lib/exports/platform/compliance.ts` +4 |
| `EXP-ADMIN-06` | Config History Export | ✅ Done | `apps/web/lib/exports/platform/config-history.ts` +4 |
| `EXP-ADMIN-07` | Announcements / Feature Flags / Notification Policies Export | ✅ Done | `apps/web/lib/exports/platform/index.ts` +4 |

## Subscriptions & billing (Razorpay + Stripe)

Source: [`docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md`](./plan/14-SUBSCRIPTION-BILLING-BACKLOG.md)

### 102a. Story index

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `BILL-01` | Inspect existing plans, licenses, payments, platform schema and background jobs | ✅ Done | `packages/core/src/licensing/event-handlers.test.ts` +4 |
| `BILL-02` | Create provider abstraction | ✅ Done | `packages/core/src/billing/providers/http.ts` +1 |
| `BILL-03` | Create platform billing tables/migrations | ✅ Done | `supabase/migrations/20260926130000_platform_billing.sql` |
| `BILL-04` | Create Razorpay adapter | ✅ Done | `packages/core/src/billing/providers/razorpay.test.ts` +1 |
| `BILL-05` | Create Stripe adapter | ✅ Done | `packages/core/src/billing/providers/stripe.test.ts` +1 |
| `BILL-06` | Create provider configuration | ✅ Done | `packages/core/src/admin/config-history.test.ts` +6 |
| `BILL-07` | Create plan pricing/provider mapping | ✅ Done | `packages/core/src/billing/catalog.ts` +3 |
| `BILL-08` | Create checkout session service | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/failed/page.tsx` +7 |
| `BILL-09` | Create customer-facing pricing page | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/plans/page.tsx` |
| `BILL-10` | Create checkout confirmation page | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/review/page.tsx` |
| `BILL-11` | Create success/failure pages | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/failed/page.tsx` +2 |
| `BILL-12` | Razorpay webhook | ✅ Done | `apps/web/app/api/webhooks/billing/razorpay/route.ts` +4 |
| `BILL-13` | Stripe webhook | ✅ Done | `apps/web/app/api/webhooks/billing/stripe/route.ts` +3 |
| `BILL-14` | Event idempotency | ✅ Done | `apps/web/app/api/cron/billing/route.ts` +3 |
| `BILL-15` | Subscription synchronization | ✅ Done | `packages/core/src/billing/state.test.ts` +3 |
| `BILL-16` | Payment synchronization | ✅ Done | `packages/core/src/billing/sync.test.ts` +1 |
| `BILL-17` | License provisioning | ✅ Done | `apps/web/app/(dashboard)/dashboard/settings/licenses/actions.ts` +5 |
| `BILL-18` | License reconciliation | ✅ Done | `packages/core/src/billing/provisioning.test.ts` +1 |
| `BILL-19` | Billing page | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/billing-ui.tsx` +4 |
| `BILL-20` | Payment history | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/billing-ui.tsx` +2 |
| `BILL-21` | Manage billing | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/actions.ts` +3 |
| `BILL-22` | Upgrade | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/actions.ts` +2 |
| `BILL-23` | Downgrade | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/actions.ts` +2 |
| `BILL-24` | Cancellation | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/actions.ts` +2 |
| `BILL-25` | Failed payment recovery | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/billing/billing-ui.tsx` +1 |
| `BILL-26` | Billing Overview | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +7 |
| `BILL-27` | Subscriptions | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +6 |
| `BILL-28` | Payments | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +6 |
| `BILL-29` | Providers | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +9 |
| `BILL-30` | Billing Events | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +6 |
| `BILL-31` | Plan provider mappings | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +6 |
| `BILL-32` | Subscription reconciliation | ✅ Done | `apps/web/app/platform/(protected)/billing/actions.ts` +10 |
| `BILL-33` | Audit | ✅ Done | `packages/core/src/billing/observability.ts` |
| `BILL-34` | Notifications | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +4 |
| `BILL-35` | Email templates | ✅ Done | `packages/core/src/billing/event-handlers.test.ts` +3 |
| `BILL-36` | Observability | ✅ Done | `packages/core/src/billing/observability.ts` |
| `BILL-37` | Security tests | ✅ Done | `apps/web/app/api/billing/checkout/route.test.ts` +2 |
| `BILL-38` | Tenant/RBAC/license tests | ✅ Done | `packages/core/src/billing/access.ts` +1 |
| `BILL-39` | E2E provider sandbox tests | ✅ Done | `apps/web/e2e/authenticated/billing.spec.ts` |
| `BILL-40` | Production readiness review | ✅ Done | Review: `docs/design/subscription-billing.md` (security review §101 + readiness check against production 2026-10-10). Going live is owner configuration listed there, not code. |

## Multi-user / multi-business RBAC

Source: [`docs/plan/15-MULTI-USER-RBAC-BACKLOG.md`](./plan/15-MULTI-USER-RBAC-BACKLOG.md)

### 61a. Story index

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `RBAC-01` | Inspect current auth/RLS | ✅ Done | `supabase/migrations/20260926150000_core_rbac_roles.sql` |
| `RBAC-02` | Canonical roles | ✅ Done | `supabase/migrations/20260926150000_core_rbac_roles.sql` |
| `RBAC-03` | Map existing roles | ✅ Done | `supabase/migrations/20260926150000_core_rbac_roles.sql` |
| `RBAC-04` | Role permission grants | ✅ Done | `scripts/test-discovery-rls.mjs` |
| `RBAC-05` | Effective permission resolution | ✅ Done | `packages/core/src/rbac/effective.ts` |
| `RBAC-06` | Role-assignment ceiling | ✅ Done | `supabase/migrations/20260926150000_core_rbac_roles.sql` +1 |
| `RBAC-07` | Invitations | ✅ Done | `packages/core/src/rbac/members.ts` +1 |
| `RBAC-08` | Invitation acceptance | ✅ Done | `apps/web/app/invite/[token]/actions.ts` +1 |
| `RBAC-09` | Active/suspended/removed status | ✅ Done | `supabase/migrations/20260926150000_core_rbac_roles.sql` |
| `RBAC-10` | Role assignment | ✅ Done | `packages/core/src/rbac/rbac-services.test.ts` +1 |
| `RBAC-11` | Multi-business membership UI | ✅ Done | `packages/module-discovery/src/lib/dashboard/queries.ts` |
| `RBAC-12` | Roles page | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/page.tsx` |
| `RBAC-13` | Custom role creation | ✅ Done | `packages/core/src/rbac/rbac-services.test.ts` +1 |
| `RBAC-14` | Permission editor | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/role-form.tsx` |
| `RBAC-15` | Role templates | ✅ Done | `supabase/migrations/20260926150100_core_rbac_members.sql` |
| `RBAC-16` | Role comparison | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/users/member-actions.tsx` |
| `RBAC-17` | Role archive/reassignment | ✅ Done | `packages/core/src/rbac/members.ts` +1 |
| `RBAC-18` | Server guards | ✅ Done | `packages/core/src/rbac/effective.ts` +1 |
| `RBAC-19` | RLS enforcement | ✅ Done | `scripts/test-gst-filing-reminders-sent-rls.mjs` +5 |
| `RBAC-20` | License × permission enforcement | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/not-licensed/page.tsx` +4 |
| `RBAC-21` | Export authorization | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/users/access-ui.tsx` +5 |
| `RBAC-22` | Billing authorization | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/users/access-ui.tsx` +6 |
| `RBAC-23` | Funding/Data Room authorization | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/users/[memberId]/page.tsx` +4 |
| `RBAC-24` | Discovery authorization adapters without restructuring Discovery | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/users/access-ui.tsx` +3 |
| `RBAC-25` | Users & Access navigation | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/actions.ts` +2 |
| `RBAC-26` | Users desktop/mobile | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/[roleId]/page.tsx` +3 |
| `RBAC-27` | Invite flow | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/actions.ts` +11 |
| `RBAC-28` | User details / role change | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/[roleId]/page.tsx` +2 |
| `RBAC-29` | Roles desktop/mobile | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/[roleId]/archive-role-button.tsx` +3 |
| `RBAC-30` | Permission editor UI | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/roles/actions.ts` +7 |
| `RBAC-31` | Business switcher role display | ✅ Done | `apps/web/app/(dashboard)/layout.tsx` +4 |
| `RBAC-32` | Audit | ✅ Done | `packages/core/src/rbac/event-handlers.ts` +1 |
| `RBAC-33` | Privilege escalation tests | ✅ Done | `scripts/test-core-rbac-rls.mjs` |
| `RBAC-34` | Cross-business tests | ✅ Done | `scripts/test-core-rbac-rls.mjs` |
| `RBAC-35` | RLS tests | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/admin/users/activity/page.tsx` |
| `RBAC-36` | Invitation security | ✅ Done | `apps/web/e2e/unauthenticated/rbac.spec.ts` +3 |
| `RBAC-37` | Multi-business E2E | ✅ Done | `apps/web/e2e/authenticated/rbac.spec.ts` |
| `RBAC-38` | Full regression | ✅ Done | `scripts/test-core-rbac-rls.mjs` |
| `RBAC-39` | Module-scoped RLS with declared cross-module hand-offs | ✅ Done | `scripts/test-discovery-party-backfill.mjs` +9 |

## WonderArk branding

Source: [`docs/plan/16-BRANDING-BACKLOG.md`](./plan/16-BRANDING-BACKLOG.md)

### 31a. Story index

| ID | Story | Status | Evidence / note |
|---|---|---|---|
| `BRAND-01` | Audit existing branding | ✅ Done | `scripts/build-brand-assets.mjs` |
| `BRAND-02` | Brand tokens | ✅ Done | `packages/core/src/brand/identity.ts` |
| `BRAND-03` | Canonical assets | ✅ Done | `scripts/build-brand-assets.mjs` +1 |
| `BRAND-04` | Logo component | ✅ Done | `packages/core/src/components/shell/wonderark-logo.test.tsx` +1 |
| `BRAND-05` | Application shell | ✅ Done | `apps/web/app/(dashboard)/loading.tsx` +1 |
| `BRAND-06` | Favicon / PWA | ✅ Done | `apps/web/app/manifest.ts` +4 |
| `BRAND-07` | Metadata | ✅ Done | `apps/web/app/(dashboard)/[businessSlug]/crm/layout.tsx` +12 |
| `BRAND-08` | Authentication | ✅ Done | `apps/web/app/(auth)/layout.tsx` +2 |
| `BRAND-09` | Existing component mapping | ✅ Done | `packages/core/src/ui-theme.css` |
| `BRAND-10` | Module validation | ✅ Done | `apps/web/e2e/authenticated/branding.spec.ts` |
| `BRAND-11` | Email/documents | ✅ Done | `packages/core/src/email/render.test.ts` +1 |
| `BRAND-12` | Visual QA | ✅ Done | `apps/web/e2e/authenticated/branding.spec.ts` +1 |
| `BRAND-13` | Install banner | ✅ Done | `apps/web/app/layout.tsx` +8 |

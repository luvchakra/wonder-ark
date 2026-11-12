# CoFounderAI Platform — Master Plan

> **Revision 1.1 — read `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` first.** The StockPilot audit is complete and the programme is now greenfield (new repo + new Supabase project); Part C of that document lists the corrections to this file.

**Version:** 1.0 (planning only — no code changes)
**Date:** 2026-09-06
**Audience:** Claude Code (implementation agent) + product owner

---

## 0. What was actually inspected (not assumed)

| Source | Access | What I read |
|---|---|---|
| `github.com/luvchakra/co-founder-ai` | Public — cloned | `CLAUDE.md`, `docs/engineering-blueprint.md`, `package.json`, all 24 files in `supabase/migrations/`, `app/`, `lib/`, `components/` tree |
| `github.com/luvchakra/stockpilot-ai-ops` | **Private — clone failed (no GitHub credentials in this environment)** | — |
| StockPilot database | Supabase MCP — project `atdmyqahetqkbnrszega` (`stockpilot-ai-ops`, ap-northeast-1, PG 17.6) | All 40 `public` tables + full column list for the 17 core ones |
| CoFounderAI database | Supabase MCP — project `xepqdxhakfvsxjbtqjzn` (`co-founder-ai`, ap-northeast-1, PG 17.6) | Schema confirmed against repo migrations |
| `help.kickserv.com` | Public web | Opportunities, Estimates, Jobs, Invoices, Customers & Contacts, Settings, Reminders, Reports, Permissions, Tags, Custom Fields, Messaging, Mobile app for technicians, More options in Jobs, Manual payments, Invoice reminders, Work orders, Developer API |

**Gap to close before Epic 2 starts:** I could read StockPilot's *database* but not its *code*. Every statement in this plan about StockPilot's schema is verified; statements about its file layout, its Supabase client wrapper, and its `org_id` resolution helper are **inferred** and marked `[ASSUMPTION]`. Claude Code must verify these in the first story of the migration epic (`SP-0`).

---

## 1. Product shape

CoFounderAI is one portal, one account, one login, five independently licensed modules:

| Key | Module | Status now | Source |
|---|---|---|---|
| `discovery` | Customer Discovery (ICP → prospects → research → outreach → won) | **Exists** | co-founder-ai repo |
| `inventory` | Inventory & Purchasing | **Exists elsewhere** — migrate | stockpilot-ai-ops |
| `fsm` | Field Service Management (Kickserv-equivalent) | **Build from scratch** | this plan |
| `crm` | Service CRM (unified inbox: email, social, WhatsApp; issues/tickets) | **Skeleton only** | later |
| `gst` | GST Management (e-invoice, e-way bill, GSTR filing) | **Skeleton only** — partial assets already in StockPilot | later |

The commercial promise: a customer buys any subset, adds or drops a module later, and the portal reshapes itself. Nothing breaks when a module is absent; nothing is duplicated when two modules are present.

The end-to-end story the platform must tell:

```
discovery: prospect → researched → outreach → conversation → WON
                                                    │  domain event: prospect.won
                                                    ▼
fsm:        opportunity → estimate (scheduled or sent) → approved → JOB
                                → schedule → dispatch → work → complete
                                                    │
                            ┌───────────────────────┼───────────────────────┐
                            ▼                       ▼                       ▼
inventory: parts reserved/consumed   gst: e-invoice + e-way bill    crm: customer replies land in inbox
                            │                       │
                            └──────► core.documents (estimate / invoice / payment) ◄──┘
```

---

## 2. The three hard constraints, and how the design satisfies them

### C1 — "No duplicity of entities across modules"
Solved by a **shared `core` schema that owns every cross-module noun**, and module schemas that own only what is genuinely theirs. Full ownership map in §5.

### C2 — "StockPilot migration must be near copy-paste"
Solved by **schema isolation + updatable compatibility views**. StockPilot's SQL keeps hitting `products`, `customers`, `sales_orders`, `organizations` with the same column names, but those become views over the canonical `core` tables. Only three files in the StockPilot codebase change (§ `03-STOCKPILOT-MIGRATION.md`). Detail in that document.

### C3 — "Modular services, not a monolith"
Solved by a **strictly bounded modular monolith** in an npm-workspaces monorepo: one deployable today, five independently deployable units the day you want them, because the only coupling allowed is `@cofounderai/core` + other modules' `/contract` entrypoints + `core.domain_events`. §6.

> ⚠️ **Architecture amendment required.** `CLAUDE.md` rule 14 forbids architecture changes without your approval, and `docs/engineering-blueprint.md` §41 currently lists "event bus" and "microservices" as explicit non-goals. This plan introduces a database-backed domain event table (not Kafka, not a broker) and module package boundaries. **Approve `01-ADR-DECISIONS.md` before Claude Code writes any code**, and have it patch `CLAUDE.md` + §41 in the same commit. Otherwise Claude Code will correctly refuse or, worse, silently drift.

---

## 3. Tenancy — the single most important decision

CoFounderAI today: `auth.users → accounts → account_members → businesses → products → workspaces`, and **`workspace_id` is the RLS boundary on every table**.

StockPilot today: `auth.users → profiles → organizations → organization_members`, and **`org_id` is the RLS boundary on all 40 tables**.

These are not the same shape, and picking wrong here costs a rewrite later.

**Decision: `business_id` is the operational tenant for `fsm`, `inventory`, `crm`, `gst`. `workspace_id` remains the tenant for `discovery` only.**

Rationale: a workspace is a *per-product GTM environment* — the right grain for ICPs and prospect lists, the wrong grain for a warehouse, a GSTIN, a technician roster or a customer ledger. A business has one inventory, one tax identity, one field crew, one customer list, even if it markets three products. Forcing inventory under `workspace_id` would fracture stock across products; forcing discovery up to `business_id` would break the existing app.

Consequences:
- `core.businesses` = StockPilot's `organizations`. Every StockPilot `org_id` becomes a `business_id` **without renaming the column** (see C2).
- Licenses are sold at **account** level and activated per **business** (`core.licenses` carries both — a customer with two businesses can run FSM in one only).
- The workspace switcher in the existing UI becomes a two-level switcher: Business → (Product/Workspace, only when `discovery` is licensed).
- `core.user_business_ids()` joins the existing `core.user_account_ids()` / `user_workspace_ids()` helper family, with the same `security definer` + `auth.uid()` filter pattern already proven in `20260904182540_tenancy_schema.sql`. Reuse that pattern exactly; do not invent a second one.

---

## 4. Postgres schema layout

| Schema | Owner | Contents |
|---|---|---|
| `core` | platform | tenancy, identity, licensing, RBAC, parties, items, documents, payments, numbering, tags, custom fields, attachments, messaging, events, jobs, audit, AI |
| `public` | discovery (legacy) | all 20 existing CoFounderAI tables, untouched in Phase 1 |
| `inventory` | inventory module | warehouses, stock levels, movements, transfers, purchase orders, alerts, reorder logic + compat views |
| `fsm` | fsm module | opportunities, jobs, events, assignments, time entries, expenses, service types, signatures, customer-center tokens |
| `crm` | crm module | skeleton: channels, tickets, routing rules |
| `gst` | gst module | e-invoice, e-way bill, credentials, return workspaces (seeded from StockPilot's existing tables) |

Rules Claude Code must enforce:
1. A module's tables live only in its own schema.
2. Cross-schema foreign keys are allowed **only** into `core.*`. Never `fsm → inventory`, never `inventory → public`.
3. Cross-module *reads* go through `core` views or the other module's contract functions — never a direct table reference.
4. Every table in every schema has RLS on, resolving through `core.user_business_ids()` (or `user_workspace_ids()` for `discovery`) **and** a license check (§7).
5. Expose `core`, `inventory`, `fsm`, `crm`, `gst` in Supabase's PostgREST `exposed schemas` setting. This is a project setting change, not code.

`public` is *not* renamed to `discovery` in Phase 1 — that churn buys nothing right now. It is scheduled as an optional Phase 4 cleanup in `04-BACKLOG.md`.

---

## 5. Entity ownership map — the anti-duplication contract

This table is the single source of truth for "who owns what". If Claude Code is about to create a table whose concept already appears in the left column, it is a bug.

| Concept | Canonical home | Consumers | Notes |
|---|---|---|---|
| Account, membership, roles | `core.accounts`, `core.account_members` | all | exists today |
| Business (org/company) | `core.businesses` (+ `core.business_settings`: gstin, state, currency, timezone, locale, fiscal year) | all | **StockPilot `organizations` merges here**; its `gstin`, `state`, `gst_registration_type`, `currency`, `timezone`, `plan` become `business_settings` columns |
| User profile | `core.user_profiles` | all | StockPilot `profiles` merges here |
| Employee / technician | `core.employees` (business_id, user_id, employment fields) | fsm, inventory, crm | Kickserv "Manage Users"; a technician is an employee, not a second user record |
| **Party** (any external company or person) | `core.parties` + `core.party_roles` (`prospect`\|`customer`\|`supplier`\|`vendor`\|`lead`) | all | **kills the prospect/customer/supplier triplication.** One party can hold several roles simultaneously |
| Contact person | `core.party_contacts` | all | merges `public.contacts` (discovery) + Kickserv "additional contacts" |
| Address / service location | `core.addresses` (party_id, kind: `billing`\|`shipping`\|`service`, geo point, parent_id) | fsm, inventory, gst | Kickserv "service locations" are addresses with a parent party, **not** child customer records |
| Tax identity (GSTIN) | `core.tax_identities` | gst, inventory, fsm | one place computes CGST/SGST/IGST split |
| **Item** (anything sellable/stockable) | `core.items` (`kind`: `good`\|`service`\|`labour`\|`part`\|`expense`) + `core.item_inventory_attrs` | inventory, fsm, gst | StockPilot `products` (36 rows) migrates here; Kickserv "Items"/"Services"/charge items are the same noun |
| Item category | `core.item_categories` | inventory, fsm | StockPilot `categories` |
| Price / tax rate / HSN | on `core.items` + `core.tax_rates` | inventory, fsm, gst | never duplicated per module |
| **Document** (estimate, sales order, invoice, credit note, debit note, proforma, purchase order) | `core.documents` + `core.document_lines` | inventory, fsm, gst | **kills the invoice triplication.** Discriminated by `doc_type` + `source_module` |
| Payment | `core.payments` + `core.payment_allocations` | fsm, inventory, gst | Kickserv "log manual payment", StockPilot `payment_status` |
| Document numbering | `core.number_sequences` | all | replaces `sales_order_counters`, `sales_invoice_counters`, `credit_note_counters`, `sales_return_counters`; also issues job numbers, quote numbers. FY-aware for GST |
| Stock (levels, movements, transfers, reservations) | `inventory.*` | fsm (via contract) | inventory-owned; FSM never writes stock directly |
| Warehouse | `inventory.warehouses` | fsm | FSM truck stock = a warehouse of `type='vehicle'` |
| Purchase order | `core.documents` (`doc_type='purchase_order'`) + `inventory.po_receipts` | inventory, gst | |
| Job / work order | `fsm.jobs` | crm, gst, inventory | |
| Scheduled event (work / estimate / reminder) | `fsm.events` | crm | one calendar table, three event types (Kickserv model) |
| Tag | `core.tags` + `core.taggings` (polymorphic) | all | Kickserv work tags vs contact tags = `scope` column |
| Custom field | `core.custom_field_defs` + `core.custom_field_values` | all | Kickserv Forms & Fields, per entity type and per service type |
| Attachment / photo / signature | `core.attachments` (Supabase Storage) | all | job photos, product images, knowledge files, signed PDFs |
| **Message / thread** (email, SMS, WhatsApp, LinkedIn, social DM) | `core.threads` + `core.messages` | discovery, fsm, crm | **kills the message triplication.** Existing `public.messages`/`public.conversations` converge here in Phase 3 |
| Message template | `core.message_templates` | all | Kickserv Messaging Templates + reminders |
| Outreach campaign / step / step text / enrollment / send, and the sender mailbox | `discovery.outreach_campaigns`, `outreach_campaign_steps`, `outreach_templates`, `outreach_enrollments`, `outreach_sends`, `sender_mailboxes` | discovery | Doc 19. Each email a campaign sends is still a row in `discovery.messages`. A step's text is not a `core.message_templates` row: it belongs to one campaign, step and line of work and is gated by the Discovery licence. `discovery.marketing_campaigns` is a different thing (planning records that send nothing) |
| Notification | `core.notifications` + `core.notification_prefs` | all | |
| Audit log | `core.audit_log` | all | StockPilot `audit_log` promotes to platform-wide |
| Background job | `core.jobs` (DB-backed, per blueprint §23) | all | |
| Domain event | `core.domain_events` | all | §6 |
| API key | `core.api_keys` + `core.api_key_secrets` + `core.api_rate_limit_counters` | all | StockPilot's already-built tables promote to platform-wide |
| Permission catalogue | `core.permissions` (`key`, `module`, `description`) + `core.role_permissions` | all | StockPilot's 36 permissions × 196 role rows are the seed; `module` column already anticipates this |
| License / entitlement | `core.modules`, `core.licenses`, `core.license_events` | all | §7 |
| AI run, cost, credentials | `core.ai_runs`, `core.ai_provider_credentials`, `core.usage_events` | all | promote existing `public.ai_runs` etc. in Phase 3 |

**Deliberate non-duplications worth naming out loud:**
- A discovery *prospect* and an FSM *customer* are the same `core.parties` row with two `party_roles`. Winning a prospect adds the `customer` role; it does not copy a record.
- A Kickserv *charge item* and a StockPilot *product* are the same `core.items` row.
- A Kickserv *invoice* and a StockPilot *sales invoice* are the same `core.documents` row with different `source_module`.
- A Kickserv *service location* and a StockPilot *shipping address* are the same `core.addresses` row.

**Resolved 2026-09-18 — supplier bills are now canonical documents.** `core.documents`'
`doc_type` check gains `supplier_bill` and `supplier_credit`
(`20260918120000_core_supplier_bill_doc_type`), signed off by the product owner. A
purchase *order* is a commitment — it creates no liability, carries no due date anyone is
chased on, and is routinely for a different amount than what is eventually billed — so it
never stood in for a bill, and Accounts Payable could not be built without this. Added
here rather than as a Finance-local bills table so that payments, parties and allocations
all work on bills unchanged, and so Inventory can raise them against its own purchase
orders later. `supplier_credit` came with it: a supplier's credit note is to a bill what a
credit note is to an invoice, and adding the pair avoided a second migration the first
time anyone returns goods.

**Open against this map:**
- **Credit notes link to their invoice under two different keys.** Service writes
  `source_ref.invoice_id` (`module-fsm/lib/invoices/mutations.ts#voidInvoiceViaCreditNote`)
  and Inventory writes `source_ref.sales_invoice_id` (`inventory.create_credit_note()`).
  Finance reads both (`lib/accounting/receivables.ts#creditedInvoiceId`) because reading
  one would silently overstate receivables for the other module. Flagged, not reconciled —
  unifying the key is a change to two other modules' data.

---

## 6. Module architecture — how "not a monolith" is enforced

### Repository (npm workspaces, single repo)

```
cofounderai/
├── apps/
│   └── web/                      # the Next.js 16 host shell (App Router). Thin.
│       ├── app/(dashboard)/[businessSlug]/
│       │   ├── discovery/...     # re-exports from module packages
│       │   ├── fsm/...
│       │   ├── inventory/...
│       │   ├── crm/...
│       │   └── gst/...
│       └── proxy.ts              # session + business resolution + license gate
├── packages/
│   ├── core/                     # @cofounderai/core — the only universal dependency
│   │   ├── db/                   # supabase clients (browser/server/admin), schema types
│   │   ├── tenancy/              # account/business/workspace resolution
│   │   ├── licensing/            # entitlement resolution + guards
│   │   ├── rbac/                 # permissions
│   │   ├── parties/ items/ documents/ payments/ numbering/ tags/ fields/ files/ messaging/
│   │   ├── events/               # publish() + consume() over core.domain_events
│   │   ├── ai/                   # moved from lib/ai — shared by every module
│   │   └── ui/                   # shadcn primitives (hand-vendored, per CLAUDE.md)
│   ├── module-discovery/
│   ├── module-fsm/
│   ├── module-inventory/
│   ├── module-crm/               # skeleton
│   ├── module-gst/               # skeleton
│   └── module-registry/          # static manifest of all 5 modules (nav, routes, deps)
├── supabase/migrations/          # ONE ordered migration timeline for the whole platform
└── docs/
```

### Module contract (every module package looks identical)

```
packages/module-fsm/
├── src/
│   ├── contract/index.ts     # ← the ONLY thing other modules may import
│   ├── routes/               # server components + server actions
│   ├── domain/               # business logic
│   ├── db/                   # queries/mutations, fsm schema only
│   ├── events/
│   │   ├── published.ts      # job.completed, estimate.approved, invoice.issued
│   │   └── handlers.ts       # subscribes to prospect.won, stock.reserved.failed
│   └── manifest.ts           # key, name, nav items, routes, required/optional deps
└── package.json               # dependencies: @cofounderai/core ONLY
```

**Enforced boundaries (CI-failing, not advisory):**
- `eslint-plugin-boundaries` (or `dependency-cruiser`): a `module-*` package may import `@cofounderai/core` and `@cofounderai/module-*/contract`. Importing `@cofounderai/module-x/src/...` fails the build.
- A grep-based migration lint: a migration file in module X may not `create table` or `alter table` outside schema X (or `core`, for core-owned migrations).
- Each module exports a `manifest.ts`; `apps/web` builds navigation, routes and dashboards **from the registry**, never from a hardcoded list. Adding a module = adding a package + registry entry.

### Cross-module communication — three legal mechanisms, ranked

1. **Read shared data from `core`** (preferred). FSM reads `core.items`, `core.parties`. No coupling at all.
2. **Call another module's contract function** (synchronous, when you need an answer now). `inventory.contract.reserveStock({ businessId, lines, ref })` returns success/insufficient. The caller must handle `MODULE_NOT_LICENSED` as a normal, expected result.
3. **Publish a domain event** (asynchronous, when you don't need an answer). Row in `core.domain_events` (`business_id`, `type`, `payload jsonb`, `published_at`, `processed_at`, `attempts`), drained by the same DB-backed job processor blueprint §23 already mandates. No Redis, no broker, no Kafka — this is a table with a cron, which is why it does not violate the spirit of §41.

**Core event catalogue (v1):**

| Event | Publisher | Consumers |
|---|---|---|
| `prospect.won` | discovery | fsm (create opportunity), crm |
| `prospect.lost` | discovery | crm |
| `party.role_added` | core | all |
| `opportunity.created` | fsm | crm |
| `estimate.sent` / `estimate.approved` / `estimate.declined` | fsm | discovery (feedback loop), crm |
| `job.scheduled` / `job.started` / `job.completed` / `job.cancelled` | fsm | inventory (consume parts), crm, gst |
| `document.issued` (invoice) | fsm, inventory | gst (e-invoice), crm |
| `payment.recorded` | core | fsm, inventory, gst |
| `stock.low` / `stock.out` | inventory | fsm (warn dispatcher), crm |
| `message.received` | core | crm (triage), fsm (attach to job) |
| `license.activated` / `license.deactivated` | core | all (cache invalidation, nav rebuild) |

### Why this is still one Vercel deployment today
Vercel-native, no infra to run, one build, one set of env vars. But because every module talks only through `core` + contracts + events, splitting `module-fsm` into its own Next.js app behind a shared Supabase project later is a routing change, not a rewrite. Document that path; do not build it now.

---

## 7. Licensing — five SKUs, mix and match

### Data model (`core`)

```sql
core.modules            (key pk, name, description, sort_order, is_active)
core.licenses           (id, account_id, business_id NULL, module_key,
                         status: trial|active|past_due|cancelled|expired,
                         plan_tier, seats, starts_at, ends_at, grace_ends_at,
                         source: self_serve|manual|partner, created_at, updated_at,
                         unique (account_id, business_id, module_key))
core.license_events     (id, license_id, event: activated|renewed|downgraded|
                         cancelled|expired|reactivated, actor_id, at, metadata)
core.module_usage       (license_id, period, metric, quantity)   -- seat/usage billing later
```

`business_id NULL` = license applies to every business in the account.

### Enforcement — four layers, all four required

1. **Database (authoritative).** Every module table's RLS policy is `tenant AND licensed`:
   ```sql
   create policy "fsm jobs read"
     on fsm.jobs for select
     using (business_id in (select core.user_business_ids())
            and core.has_module(business_id, 'fsm'));
   ```
   Write policies additionally require `core.has_module_write(business_id, 'fsm')`, which returns false during the read-only grace period. `core.has_module()` is `stable security definer` and must be indexed-friendly — cache per transaction, follow the `user_workspace_ids()` precedent so the planner can inline it.
2. **Route guard.** `proxy.ts` resolves the active business, loads its entitlement set once per request, and 404s (not 403 — don't advertise) unlicensed module routes.
3. **Server actions.** `requireModule('fsm')` at the top of every mutating action. Defence in depth; the DB is the real gate.
4. **UI.** Navigation, dashboard widgets and command palette are built from `module-registry` filtered by entitlements. Unlicensed modules render as an upsell card, never as a broken link.

### Lifecycle rules (these are product decisions — confirm them)
- **Adding** a module mid-life: instant. Run its idempotent seed (permissions, default settings, number sequences), publish `license.activated`, rebuild nav.
- **Removing** a module: data is **never deleted**. Status → `cancelled`, `grace_ends_at = now() + 30 days`. During grace: read-only + export. After grace: rows remain but RLS denies all access until reactivation. This is the safe default; deletion is a separate, explicit, irreversible action.
- **Dependencies between modules are soft, never hard.** No module may be *required* by another — that would destroy mix-and-match. Instead every cross-module feature has a documented degraded mode:

| Feature | Both licensed | Missing counterpart |
|---|---|---|
| FSM job consumes parts | reserves + decrements `inventory.stock_levels`, creates movement | line item is a plain non-stocked charge; no stock effect |
| FSM invoice → e-invoice/IRN | GST module generates IRN + e-way bill | plain invoice PDF, GST fields still computed and stored |
| Inventory sales invoice → e-invoice | same | same |
| Discovery win → FSM opportunity | auto-creates opportunity | prospect marked won, stays in discovery; event parked in `domain_events` unconsumed |
| Customer replies to estimate | CRM inbox routes + assigns | message still lands on the job's Messages tab (FSM-local view of `core.messages`) |
| GST returns | pulls from `core.documents` regardless of which module wrote them | works with whatever documents exist |

Parked events must not be lost: `core.domain_events` rows with no licensed consumer stay `processed_at = null` with `status='no_consumer'` and are replayed on `license.activated`. This is what makes "buy FSM three months later and your won prospects flow in" actually true.

---

## 8. Phasing

| Phase | Goal | Exit criteria |
|---|---|---|
| **P0 — Foundations** (1 epic) | Monorepo, module registry, `core` schema for tenancy + licensing + RBAC, business switcher, license admin UI, discovery relocated into `module-discovery` with zero behaviour change | Existing discovery app works exactly as today, now under `apps/web` + `packages/module-discovery`; licenses togglable; all existing tests green |
| **P1 — Core domain** | `core.parties`, `core.items`, `core.documents`, `core.payments`, `core.number_sequences`, `core.tags`, `core.custom_fields`, `core.attachments`, `core.domain_events`, job processor | Backfill of discovery prospects → parties done; contract tests pass |
| **P2 — StockPilot migration** | Inventory module live on the platform DB with compat views | StockPilot's own test suite (if any) + a parity checklist pass against migrated data; ≤3 changed files in the copied code |
| **P3 — FSM build** | Kickserv-equivalent: opportunities → estimates → jobs → scheduling → completion → invoicing → payments → customer center | `02-FSM-PRD.md` acceptance criteria |
| **P4 — Convergence + skeletons** | Discovery messages → `core.messages`; CRM and GST skeletons with real nav, empty screens, seeded schemas; optional `public` → `discovery` schema rename | Nav shows 5 modules; CRM/GST render "coming soon" behind their own licenses |

FSM deliberately comes after the migration: FSM's estimates and invoices must be built directly on the converged `core.documents`, not on a throwaway.

---

## 9. Risks and the mitigation for each

| Risk | Why it matters | Mitigation |
|---|---|---|
| **StockPilot code is unseen** | Whole "copy-paste" premise rests on its client wrapper being centralised | `SP-0` is a read-only audit story that must complete before any migration code. If the Supabase client is instantiated ad hoc in 60 files, the migration is *still* mechanical but becomes a codemod, not a copy — replan at that point |
| `auth.users` IDs differ between the two Supabase projects | 237 profiles / 6 org members reference user UUIDs; `created_by`, `actor_id` FKs everywhere | Migrate `auth.users` rows preserving UUIDs (both projects are PG 17.6, same Supabase major — this is viable), else build `core.user_id_map` and rewrite FKs during load. Decide in `SP-1`. Password hashes migrate; if not, force reset-password on first login |
| `public.products` (tenancy tier) vs StockPilot `products` (SKU) name collision | Two utterly different nouns, same name, same database | Schema separation + the canonical name is `core.items`. `inventory.products` exists only as a compat view. Never resolve this by renaming CoFounderAI's `products` — that breaks the live app |
| `core.documents` as one table for 7 document types | Over-generalisation can produce a table nobody can query | Strict `doc_type` check constraint, partial indexes per type, per-type typed views (`core.invoices`, `core.estimates`), and per-type Zod schemas. If it starts hurting in P3, split invoices out — but do not pre-split |
| Compat views must be **updatable** | StockPilot writes to `customers`, `sales_orders`, etc. | Simple views are auto-updatable; anything with a join needs `INSTEAD OF` triggers. Every view gets a write test in `SP-4` |
| RLS + license check on every policy could be slow | `has_module()` called per row | Follow the existing `tenancy_rls_perf` migration's approach (`in (select ...)` so the planner evaluates once); benchmark on seeded data in `P0-6` |
| Architecture rules in `CLAUDE.md` contradict this plan | Claude Code will refuse or drift | `01-ADR-DECISIONS.md` + patch `CLAUDE.md` and blueprint §41 in the first commit |
| Scope explosion in FSM | Kickserv is 15 years of product | `02-FSM-PRD.md` marks every requirement MUST/SHOULD/LATER. Only MUST is in P3 |

---

## 10. What I need from you before Claude Code starts

1. **Approve `01-ADR-DECISIONS.md`** (module packages, `core` schema, domain events table, `business_id` tenancy for the four non-discovery modules).
2. **Repo decision:** does CoFounderAI become the monorepo (my recommendation — it holds the live app and the tenancy foundation), or is a new `cofounderai-platform` repo created and both imported?
3. **Access to `stockpilot-ai-ops` source.** Make it public temporarily, add a read-only collaborator, or paste `package.json` + the Supabase client file + the org-resolution helper into a chat. Without it, `SP-0` is guesswork.
4. **Confirm the license lifecycle rules** in §7 (30-day read-only grace, never auto-delete).
5. **Confirm pricing grain:** per-account or per-business licenses? The schema supports both; the UI shouldn't.

# Finance: Accounting, Banking & Tax

Finance is your books: a real double-entry ledger that the rest of the
platform posts into automatically, plus bank reconciliation, financial
statements, and tax registration and filing preparation.

It started life as an India-GST-only module, which is why its URL prefix and
internal key are still `gst` in a few places, and why the tax screens carry
GST-flavoured labels. The accounting half applies to every business
regardless of country; the tax half supports **India GST, US Sales Tax (plus
1099 information returns), Canada GST/HST, Singapore GST, and EU VAT
(Germany, France, Belgium, Poland, Italy)** today, with more countries
visible in the picker as "(Planned)" but not yet selectable.

Last updated: 2026-10-17

## Navigation

Everyday pages, at the top of the menu: Dashboard, Invoices, Bills, Expenses, Banking,
GST Filing
**Accounting**: Chart of Accounts, Journal, Receivables, Payables, Recurring Entries,
Accounting Periods, Budget, Dimensions
**Tax & GST**: Filing Readiness, GST Ledger, GSTR-2B Reconciliation, e-Invoicing,
e-Way Bill, GST Profile, GST Registrations
**Reports and records**: Financial Reports, Operational Reports, Exceptions, Evidence,
Audit Log, Backfill

## The Finance dashboard

Finance opens on a dashboard that puts the money first: **Cash and bank**,
**Owed to you**, **You owe**, **Profit this month** and **Net GST position**.
Underneath are a notice of any **unposted documents** (see below), the
month's GST snapshot, a **Compliance risk** list — each risk rated high,
medium or low — and **Upcoming filings**. Until Finance is activated, a banner at the top says "Finish setting up Finance" with
**Continue →**. The whole dashboard exports to
Excel or CSV.

## Activating Finance

The setup checklist ticks each step off as you finish it: business profile, accounting
method (accrual or cash), fiscal year, chart of accounts, tax profile, account mappings,
opening balances and bank accounts. You can leave and come back; progress is kept. When
you're ready, **Activate** (only Owner and Admin can) turns Finance on and immediately runs
a **Backfill**: it posts the invoices, bills, payments and expenses your other modules
already recorded. To see what it would post first, use the **Backfill** page ("What the scan
found", then **Run backfill**). Anything it can't post safely — a document in a locked
period, a missing account mapping — goes to **Exceptions** instead of stopping the run.
Running it twice never posts anything twice; **Run again** repeats it.

**Exceptions** is the one queue for anything that needs a person: unposted
documents, input tax credit at risk, filing blockers. Each item says what
happened, why it matters, where it came from and what to do, and moves
through **Open → In review → Resolved** (or **Ignored**).

## First run: set up your chart of accounts

Nothing else in Finance works until there is somewhere for money to land.
Open **Chart of Accounts** and use **Set up chart of accounts** — this provisions a
conventional chart (assets, liabilities, equity, income, expenses) including the *system
accounts* the platform posts into by itself, such as Cash, Bank, Accounts Receivable,
Accounts Payable, Product Sales, Service Revenue, GST Payable, Input GST, Inventory Asset,
Product COGS and Retained Earnings.

You can add your own accounts alongside them, rename anything, and group
accounts under parents to whatever depth you like. What you cannot do is
delete or deactivate a system account, because an automatic posting that
suddenly has nowhere to go would fail silently at exactly the moment nobody
is looking.

## Accounting periods

Periods are how a set of books gets closed. Open **Accounting Periods** and add the months
of a financial year (for example **Open FY 2026-27**). Each month moves through **Open → In
review → Locked → Filed → Closed** with **Start review**, **Lock**, **Mark filed** and
**Close**:

- **Open** — entries can be added and reversed.
- **In review** — being checked before it's locked.
- **Locked** — no new entries. A locked period can still be **Reopen**ed.
- **Filed** and **Closed** — final; they can't be reopened.

Correction is always by **reversal, never by edit**. Reversing an entry
leaves both halves in the account's history, which is what an audit asks
for; quietly editing yesterday's number does not.

## The journal and automatic posting

Most of what lands in your ledger you never type. When another module issues
a document — a Service invoice, an Inventory sales invoice, a supplier bill,
a credit note — or a payment is allocated against one, Finance posts the
matching journal entry by itself, using the account each role maps to.

**Journal** shows every entry, automatic and manual, with its lines,
its source document, and a **Reverse** action. When a recorded payment is
voided (see "Payments are corrected by voiding" below), the journal gets the
reversing entries for it automatically. To record something the
platform cannot know about (a director's loan, a depreciation charge, an
opening balance), use **New entry** and enter the lines yourself. **Save as draft** works at any time;
**Post entry** needs debits to equal credits. Posted entries can't be edited — use
**Reverse** on the entry's page.

### When a document doesn't post

Two things are not retryable failures, so they are not treated as errors:
a document with no accounting consequence, and a chart of accounts that
isn't set up yet. Both surface as **unposted documents** on the Finance
dashboard instead, with the reason. Automatic posting that silently does
nothing would be worse than none at all.

## Banking

**Banking** holds your bank and cash accounts, imported statements, and
reconciliations.

- **A bank account is not a ledger account.** One is where money physically
  sits, the other is where it is recorded. Each bank account points at a
  ledger account, so three current accounts can share one "Bank" line on the
  balance sheet, or each have their own.
- **Import a statement** from CSV. The importer reads the header row to find
  your date, description and amount columns (including separate debit/credit
  columns), and it never drops a row silently — anything it cannot read is
  reported rather than skipped.
- **Matching suggests, it never decides.** Candidate matches come back ranked
  with the reason for each, and the amount is a gate: a wrong amount or the
  wrong sign scores nothing at all. Finance only claims "one clear match"
  when the best candidate is both confident *and* unrivalled. You confirm
  every match.
- **Reconcile** a statement period against the ledger. A reconciliation with
  a known, explained difference still records — a gap someone has accepted is
  a normal outcome, and refusing to save it just pushes the reconciliation
  into a spreadsheet nobody can see. "Reconciled" needs agreement *and*
  nothing left hanging.
- **Bank rules** (**Banking → Rules**) remember how you categorise recurring
  lines — "description contains AWS, money out → Software". An
  unmatched line shows the rule that fits it, and **Post and match** posts the
  entry and matches the line in one step. Rules only suggest: nothing is
  posted until you click, and a double-click can't post twice. Managing rules
  needs `gst.bank_rules.manage`.

## Payments are corrected by voiding

A recorded payment can't be edited or deleted, so the books can't be changed
quietly after the fact. A payment entered wrongly is **voided** with a reason
(today with **Void payment** on a Service invoice). It needs the permission to void payments
— Owner, Admin and Accountant have it — and a reason of at least 5 characters, and the
person who recorded the payment can't void it unless they're an Owner or Admin. See
[Correcting a payment](/help/service-fsm#correcting-a-payment-void-never-edit). The documents it paid become owed again in
**Receivables**, and Finance reverses the settlement entries
it had posted — as new entries, with the originals kept, exactly like any
other correction. Voided payments stay visible, marked as voided, and are left
out of 1099 totals.

## Money in: Receivables

**Receivables** ages what customers owe you, by customer and by invoice, in
the usual buckets (current, 1–30, 31–60, 61–90, 90+). It reads the same
invoices and payment allocations the rest of the platform already holds, so
there is nothing to keep in sync.

## Money out: Payables, Bills, Expenses

- **Bills** — **New bill**: supplier, bill date, due date, the amount before GST, the GST
  rate and the account it goes to; tick **Already paid** to record the payment too. Bills
  raised here are ordinary platform documents, so payments, parties and allocations work on
  them exactly as on a sales invoice. (A purchase order is deliberately *not* a payable — it
  creates no liability.)
- **Expenses** — **New expense**, a faster path for the small stuff: pick the account, enter
  the amount, and optionally mark it paid on the spot.
- **Payables** — ages what you owe, by supplier and by bill. **Pay {supplier}** → **Record
  payment** covers several of one supplier's bills at once.

## Financial Reports

**Financial Reports** produces, for any period you choose:

- **Profit & Loss** — income and expenses, with the period's result.
- **Balance Sheet** — assets, liabilities and equity **as at the end of the
  period** (a balance sheet is a position on a date, so "This month" shows
  every balance up to the month end, not just the month's movement). Profit
  appears as its own **Profit to date** equity line: until the year is
  closed, nothing has moved trading results into retained earnings, and
  leaving that line out puts the sheet out by exactly the profit.
- **Cash Flow** — where cash came from and went, grouped into operating,
  investing and financing, read straight off the ledger. When it doesn't reconcile to the cash accounts, the export
says so.
- **Trial Balance** — every account's debit and credit totals, which should
  agree.

**Every figure drills down.** Click any line on any statement to open that
account for the same period; the entries listed there add up to the figure
you clicked. From an entry you can open the document that caused it.

Excel exports all four statements together; CSV exports the one you're viewing.

## Operational Reports

**Operational Reports** answers the everyday questions from the same books:

- **Sales** — by customer, and by product or service.
- **Purchases** and **Expenses** — what you bought and spent in the period, by category and
  by payee.
- **Inventory valuation** — stock on hand at cost, if Inventory is licensed
  and your role can see costs (otherwise the tab says why). Oversold stock is
  flagged next to the total, never quietly subtracted.
- **COGS & gross margin** — cost of sales against revenue.

## Invoices

**Invoices** lists every invoice your business has raised — from Inventory,
Service or Finance — with four separate statuses, because they answer
different questions:

| Status | Question it answers |
|---|---|
| Accounting | Has it been posted to the ledger? |
| Payment | Unpaid, partly paid or paid (credit notes included) |
| GST | Which return period it belongs to, and whether that period is filed |
| e-Invoice | Generated, cancelled, failed or not needed |

The tiles at the top count what needs attention and filter the list.

## From a document to its entries

From a journal entry or an invoice, open the source document's **accounting
view** to see every journal entry it caused — the sale itself, the cost of goods, payments against it and
any reversals — and the net effect on each account. It is the reverse of the
explanation every automatic entry already carries ("posted by rule … from
document …").

## Dimensions

**Dimensions** lets a business report profit and loss by **party**, **item**,
**location** or **project**. Switch on only the ones you use and give them
your own names ("Branch" for location, "Job" for project). They are never
required: untagged lines appear as **Unassigned**. The manual journal form
shows location and project only when they're switched on. Managing dimensions
needs `gst.dimensions.manage`.

## Budget and Recurring Entries

- **Budget** — compares budget against actual with the variance, year to date. To enter the
  figures, click **Set budget** (Owner, Admin, Accountant and Finance Manager roles — anyone
  with permission to edit the chart of accounts). Pick the **Fiscal year**, type a monthly
  amount for each income, cost of sales and expense account you want to track — a grid of
  accounts and months on a wide screen, one card per account on a phone — and click **Save**.
  A blank month means no budget for it; clearing a figure removes it. Each save is recorded in
  the audit log.
- **Recurring Entries** — a journal template plus a schedule: every month, every three
  months, every six months or every year. Due entries are posted automatically once a day (a missed day catches up, and nothing posts twice); each is a normal journal entry you can review and reverse.

Neither uses AI. Finance is deterministic arithmetic, and the platform's own
engineering rules say not to put a language model where arithmetic belongs.

## Tax: set your country and regime

A **country/regime bar** appears above every Finance tax page. Until you
explicitly set one, your business defaults to **India / GST** — this is a
default, not a real setting, and shows a "(default)" tag until you save an
explicit choice.

To change it (needs the settings permission, which Owner and Admin have — not Accountant):
pick your country from the
dropdown; if that country has more than one regime (e.g. the US has both
Sales Tax and 1099 Information Returns), a second dropdown appears. The
selection saves and applies immediately across every tax page.

## Tax: add your registration(s)

Go to **GST Registrations** — its title adapts to your regime (e.g. "VAT
registrations," "Sales Tax registrations," "GST/HST registrations"). Click
to add a registration:

- **India + GST**: enter your **GSTIN** (15 characters, uppercase, validated
  against the standard format) and select a state jurisdiction.
- **US or Canada**: enter your registration number (EIN/permit number, or
  Canadian business number) and select a state/province jurisdiction.
- **EU VAT countries**: enter your VAT number — there's no jurisdiction
  field, since VAT registration is national, not regional.

Check **"Set as primary"** (checked by default) — the primary registration
is the one every other document (invoices, e-way bills, tax splitting) uses.
A registration's number and jurisdiction can't be edited after creation; to
fix a mistake, cancel it and add a new one. Adding and editing registrations needs the same settings permission. From the
registrations list you can also **Set primary**, Suspend, Reactivate, or Cancel a
registration, and — for India/GST
only — edit additional profile details (registration type, return
frequency, e-invoice eligibility).

## Tax: day-to-day workflows

- **GST Profile** — your "GST registration type", "GSTIN" and "State (for GST place of
  supply)".
- **GST Ledger** — your tax accounts in ledger form, reconciled against what the return
  says, and the input-tax-credit view (what is claimable and what is at risk). If the two
  disagree, that difference is the thing to look at before filing.
- **Filing Readiness** — one pre-flight check before you file, drawing on the
  ledger, the sales and purchase registers, GSTR-2B, your bank
  reconciliation and the period lock. It tells you what is not ready, not
  just whether it is.
- **GST Filing** — builds a purchase register and sales register for a chosen
  month. This produces return-preparation output; it does **not** submit
  anything to a tax authority on your behalf.
- **GSTR-2B Reconciliation** — match your records against GSTR-2B/IMS-style
  exceptions for a chosen month. **Sync exceptions** pulls the latest, then
  **Resolve** or **Dismiss** each one.
- **e-Invoicing** and **e-Way Bill** — these pages hold your GSP credentials (below).
  e-Invoices and e-way bills are generated and cancelled from a Service invoice's page.
- **Evidence** — return acknowledgments, government notices and payment
  challans kept on file for the business.
- **Audit Log** — a read-only, chronological record of who changed what and
  when, which you can filter by type, person and date and export. Entries
  can't be edited or deleted, so it stays a record you can rely on.

A GST return covers the supplies of the **business**, not of whichever module
raised the paperwork — Service invoices, Inventory invoices and bills entered
by hand all count towards the same return.

## e-Invoicing / e-Way Bill: connecting your GSP (India only)

If you file under India GST and need e-invoicing or e-way bills, you'll need
credentials from a **GST Suvidha Provider (GSP)** — the government-mandated
intermediary these documents must be submitted through. Enter these once on
the **e-Invoicing** and **e-Way Bill** settings forms:

- GSP provider name
- Auth URL, Generate URL, Cancel URL (and optionally Status/Fetch URLs; for e-way bills also
  "Vehicle update URL" and "Extend validity URL")
- GSP username and password
- Client ID and client secret

Saving them needs the settings permission. Your GSP issues all of these when you sign up
with them — WonderArk doesn't
provide a GSP relationship itself. Your password and client secret are
encrypted at rest and only briefly decrypted at the moment WonderArk makes
the one outbound call to your GSP that needs them.

## Working without the other modules

Finance never hard-depends on Inventory or Service. If neither is licensed,
you enter bills and expenses by hand and the ledger works exactly the same;
if they are, their documents post into it automatically. Turning one off
later stops new automatic postings — it does not remove what was already
recorded.

## Legacy links

URLs under the old `/gst/...` and `/compliance/...` paths (e.g.
`/your-business/gst/profile`) still work — they redirect automatically to the
equivalent `/finance/...` URL. Update any bookmarks when convenient, but
nothing breaks if you don't.

## A note on regulatory content

Finance ships with real, dated regulatory content for each supported
country/regime, but tax rules change. Treat the built-in rates and rules as
a strong starting point, and verify against current regulations (or your
accountant) before relying on this for an actual filing in production.

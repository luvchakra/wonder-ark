# Service: Field Service Management

Service (module key `fsm`, so you may still see "FSM" in a few older places)
runs your field-service business: turning a lead into a scheduled job, a
completed visit, and an invoice — with crew dispatch and inventory
parts-tracking built in.

Last updated: 2026-11-12

## The Service dashboard

Service opens on the **Service Dashboard**, the dispatcher's view of the day:
tiles for **Open jobs** (and how many are in progress), **Revenue (month)**,
**Outstanding** (and how many invoices are overdue) and **Win rate** (won ÷
won + lost opportunities); an **Invoiced (30 days)** trend and **Jobs by
status**; and working lists for **Today's schedule** (or this week's), the
**Unassigned queue**, **Jobs in progress**, **Overdue invoices** and
**Estimates awaiting response**. Switch the schedule between today and **This week**.
Each list ends with **View all**, which opens the page that manages it (Schedule, Jobs,
Invoices or Opportunities); new jobs and opportunities are created on those pages.

## Setup before you start

All under **Service → Settings** (needs the permission to manage settings; anyone else sees
"You don't have permission to view FSM settings"). The page has four tabs:

- **Document & reminders** — "Customer reminder lead time (hours)", "Default arrival window
  (minutes)", "Estimate expiry (days, blank = never)", "Auto-generate an invoice when a job is
  completed", "Enable Customer Center (tokenised customer self-serve portal)" and "Enable the
  public contact/request-service form". Click **Save settings**.
- **Service types** — the categories jobs and opportunities are tagged with (for example
  "Repair" or "Installation"). Only active ones are offered when you create a job or
  opportunity.
- **Job charge types** — categories for invoice and estimate lines.
- **Numbering** — read-only: each number series used this fiscal year and its next number
  ("Next: PREFIX/FY/0001").

**Technicians** are set up on the **Schedule** page, not in Settings: the **Technicians**
button under the calendar opens the list that chooses which members can be assigned
schedule events. Someone who isn't a technician
sees a message on **My Day** asking an owner or admin to add them. There are no service
areas or zones today.

## The opportunity → job → invoice lifecycle

1. **Opportunity** — capture a lead (new or existing customer), assign a
   service type, and write up the scope of work.
2. **Estimate** — build a quote with charge lines and **Send estimate** (or **Resend
   estimate**). The customer gets a link to approve or decline it, or your staff can
   **Approve internally** / **Decline internally**. **Mark lost** and **Reopen** close or
   revive an opportunity.
3. **Job** — approving an estimate creates the job automatically, with a
   generated job number. Re-approving an already-approved estimate won't
   create a duplicate job.
4. **Invoice** — click **Invoice** on the job (at any status), or let it be created on
   completion if that setting is on. It copies the lines of an approved estimate; otherwise
   it starts empty. Reorder lines with the up and down arrows. **Send invoice** emails the
   customer a link to a read-only invoice page (valid for 90 days); sending is refused when
   the invoice has no charges, the customer has no email, or email isn't set up. Record
   payments against it. **Void** cancels the whole invoice with a credit note and can't be
   undone. If Finance is licensed, an e-invoice / e-way bill panel appears here too.

### Working a job

The job page is the busiest screen in the module. Its tabs are **Job details**, **Field
work**, **Materials** (with Inventory), **Messages** and **History**. Its actions are **Mark
scheduled**, **Start job**, **Put on hold** / **Resume**, **Complete**, **Reopen** (needs the
reopen permission), **Duplicate**, **Invoice**, **Convert to opportunity** (only before it's
invoiced) and **Cancel** → **Cancel job**. You can also clock time in and out, log expenses,
add notes (**Internal only** or **Visible to customer**), attach files, capture a signature
and message the customer. **Send Customer Center access** emails the customer a link valid
for 30 days; it needs the Customer Center setting on and an email address for the customer.

**Completing a job** asks for an outcome from a fixed list: completed
successfully, completed with a recommendation, additional work required, parts required
later, customer declined additional work, **Warranty/revisit required**, or unresolved.
"Warranty/revisit required" creates an unscheduled follow-up job linked to the original (each
links to the other). "Additional work required" lets CRM know, so a follow-up can be sold.

### Scheduling and dispatch

- **Schedule** — a dispatch calendar (**Today**, **Day**, **Week**) per technician. **New
  event** → **Create event**; **Edit**, **Cancel event** or **Delete** an event; **Print work
  orders** (needs its own permission). With Inventory, a **Low stock** banner warns
  dispatchers before a crew goes out.
- **My Day** — a technician's agenda for today, with **Open** and **Map** on each visit and
  **Clock in** / **Clock out**. **Notify: on the way** (which also emails the customer when
  email is set up), **Mark arrived** and **Mark done** need the permission to manage the
  schedule — the built-in **Field Technician** template doesn't include it, so add it if your
  technicians should use them.

## Correcting a payment: void, never edit

A recorded payment can't be edited or deleted. If one was entered wrongly
(a cheque that bounced, the wrong invoice), open the invoice and use **Void
payment** on that payment's row (**Void** in the table on a wide screen). You
must give a reason (at least 5 characters), and:

- you need the permission to void payments — by default the Owner, Admin and
  Accountant roles have it;
- the person who recorded the payment can't void it themselves unless they
  are an Owner or Admin, so a second person checks the correction;
- everything the payment settled becomes owed again, the invoice's status is
  recalculated (back to *issued*, or *partially paid* if other payments
  remain), and — if Finance is licensed — the ledger entries the payment
  created are reversed automatically;
- the payment stays in the history, marked **Voided** with its reason, and the
  action is recorded in the audit log. A voided payment can't be un-voided: if
  the money really arrived, record a new payment.

## Customer-facing pages

Customers don't need an account for any of these — each is reached through a
link:

- **Estimates** — the link in the estimate email opens a page where the
  customer can **Approve** or **Decline**.
- **Invoices** — a read-only invoice page showing the total and balance.
- **Customer center** — if you switched it on in Settings, a customer you send access to
  sees their **Upcoming work**, **My estimates** (with Approve / Decline) and **My invoices**
  in one place. Send access from the job with **Send Customer Center access**; the emailed
  link works for 30 days.
- **Service request form** — if you switched the contact form on, your
  business has a public form at `/p/request/<your-business-slug>`. A
  visitor enters their name, email, phone, service address and what they
  need, then clicks **Send request**; each submission arrives as a new **Opportunity**
  (credited to the business owner) for you to follow up.

## Jobs and opportunities views

**Jobs** and **Opportunities** each switch between a **Board** and a **Table** view.
Assessments (site surveys) open from a CRM opportunity's link into Service. Overdue Service
invoices also appear in the topbar bell.

## Customers

**Customers** lists the people and companies you do work for — the same list
Inventory sees, when both are licensed — and lets anyone with edit permission
update their details. It can be exported.

## Reports

**Reports** has a date range at the top (7 days, 30 days, 90 days, this month,
this year, all time) and a tab per report: **Jobs completed**, **Revenue by
service**, **Revenue by tag**, **Revenue by charge type**, **Marketing
sources**, **Customer balances**, **Account aging**, **Payments**,
**Timecards** and **Productivity**. **Export** gives you the report as CSV or
a full Excel workbook.

## Parts reservation (if Inventory is licensed)

This runs automatically and is entirely optional — if Inventory isn't
licensed, jobs just work as plain charges with no material tracking:

- Scheduling a job **reserves** the parts it needs from your first active
  warehouse. Anything that can't be reserved shows up as a shortfall you can
  resolve — **Wait for replenishment**, **Substitute item**, **Reschedule the job** or
  **Obtain manually (outside this system)** — and retry later.
- Completing a job **consumes** the reserved parts — unless a technician has
  already filed an explicit actual-usage report (actual used / returned /
  wasted), in which case that report is what moves stock, correctly
  accounting for any prior partial reports.
- Cancelling a job **releases** any reservation back to available stock.

## How this connects to other modules

- **CRM**: a Service opportunity can originate from a CRM opportunity, and
  the resulting job links back to it — useful for seeing the full lifecycle
  from first contact to a completed on-site visit.
- **Inventory**: parts reservation/consumption, described above.
- **Finance**: invoices show e-invoice/e-way-bill status when relevant, and
  every issued invoice posts to the ledger automatically.

Service is meant to sit downstream of CRM and alongside Inventory and
Finance, but every one of those integrations is optional — the module
works completely standalone if you only license Service.

# Getting Started

Everything from your first login to a working business: creating an account,
setting up your first business, understanding how businesses and offerings
differ, licensing the modules you need, plans and billing, and adding your
team. The last section (§14) is for whoever runs the platform itself rather than for
everyday users.

Last updated: 2026-10-21

## 1. Creating an account

Go to **Sign up**. You'll need:

- **Email** (required)
- **Password** (required, minimum 8 characters)
- **Name** (optional)

Or use **Continue with Google**, **Continue with Microsoft** or **Continue
with LinkedIn** to skip the password step entirely. These buttons are on both
the sign-up and the login page, and each one only appears if that sign-in
method has been switched on for the deployment you're using — if you don't
see one, use your email and password.

There is no separate sign-up step for these buttons: signing in with one for
the first time creates your account and takes you to your dashboard (§2); if
you came from an invitation, you're taken back to it instead (§8).

After signing up with email/password, check your inbox and confirm your
email address before you can log in — the signup page shows a "check your
email" screen as a reminder.

**Forgot your password?** Use the "Forgot password?" link on the login page.
If you signed in with Google, Microsoft or LinkedIn and would also like a
password, the same link lets you set one — the reset email goes to the email
address on your account.

**Setting a new password** signs you out on every other device, in case someone else had the
old one.

**On an organization's own address** (`acme.ark.wonderapps.biz`, see §12), only that
organization's members can sign in, and you land on its home page. Anyone else sees "This
account isn't a member of … Ask its owner for an invitation."; a paused organization says
sign-in is closed.

**If a link or sign-in fails**, the page you land on says why (for example, a
password-reset link that has expired or was opened in a different browser
from the one that asked for it). Request a fresh link and open it in the
same browser.

## 2. Onboarding: your first business

New accounts go straight to the dashboard. Until you have a business, the sidebar shows
**Create a business**; later, create more from **Manage organizations** (the last item in the
business switcher) with **New organization**. The **Create a new business** dialog has two
tabs:

- **From website** — enter "Your Business Website" and click **Understand My Business**.
  The business is created straight away and the AI reads your site in the background; you
  review and approve what it found before it changes anything.
- **Manual entry** — "Business Name", then optionally the address prefix and environment
  (under **Address and environment**, with a live preview), website and description. Click
  **Create Business**.

The name can be changed later on the **Business** page.

## 3. Businesses, offerings, and why there are two concepts

This trips up new users, so it's worth explaining once:

- A **business** is your one shared operational back office: one inventory,
  one tax registration, one crew, one customer ledger — regardless of how
  many things you sell.
- A **business offering** (managed inside the Discovery module) is one
  product or service line you market — its own ideal customer profile, its
  own prospect list, its own AI usage. A single business can have several
  offerings (e.g. a hardware store that also does installation), each with
  its own Discovery pipeline, but they all still share the *same* Inventory
  stock, the *same* GST/tax registrations, and the *same* CRM customer
  records underneath.

In short: **offerings are "what you sell,"** and they sit *on top of* a
single shared business. Inventory, Service, CRM, and Finance all operate
at the business level; only Discovery operates per-offering.

## 4. Switching between businesses and modules

- The **business switcher** (top bar) lists every business on your account, with your role
  on each. Pin the ones you use most so they float to the top. A coloured dot shows the
  active business's environment, and chips switch between its environments (Production,
  Development, Test, Staging). **Manage organizations** is the last item.
- The **sidebar** lists the business's modules (Discovery / Inventory / Service / CRM /
  Finance). A module the business hasn't licensed — or that your role can't use — shows
  greyed out with a lock and "… isn't licensed for this business"; clicking it explains
  instead of crashing. The foot of the sidebar shows **AI Usage** for the month.
- **AI Assistant** (top bar) answers questions about your business from its own data. It
  answers only; it never changes anything.
- The **bell** (top bar) collects what needs you: plan and payment notices,
  background exports that are ready (or failed), AI allowance warnings once an
  offering has used 80% and 100% of its monthly allowance, offerings that
  still need a profile, prospects waiting for a next action, and each licensed
  module's own alerts (low stock, overdue invoices, open tickets, GSTIN
  problems). It shows the selected business's alerts by default; **Show all** / **Show only
this business** switches. Which ones you've read is remembered in this
  browser only.

## 5. Your dashboard

Signing in lands you on the **Executive Dashboard**. It is account-wide —
every business you belong to, whichever modules each has licensed — and it is
where you start your day:

- **Quick links** to Admin & settings, Licenses, Usage and Billing.
- **Overview** tiles for your businesses, offerings, prospects (with how many
  are qualified or new) and the AI credits used this month. Each tile links
  to where the detail lives.
- **Modules** — one card per module you have licensed, showing what needs you
  right now: open jobs (Service), low-stock alerts (Inventory), open tickets
  (CRM) and e-invoices this month (Finance). A card links straight through
  when exactly one of your businesses holds that module.
- **Conversions** — Discovery's prospect-to-customer funnel, win rate and fit
  scores, which you can slice by **Business**, **Offering** and **Industry**.
- **Needs attention** — a short to-do list: a module that is set to cancel
  (with **Undo**), a module in its read-only grace period (with **Reactivate**), and a business with Finance licensed but no GSTIN set (with **Set
up**).

**Download PDF** opens your browser's print dialog, so you can save the
dashboard as a PDF; the quick links and the button itself are left out of the
printout.

Each business also has its own landing page: opening a business takes you to
its Discovery dashboard.

## 6. Licensing a module

Open the avatar menu → **Admin** (the **Business Configurations** page, or **Licenses** on
the Executive Dashboard) and expand a business's **Licenses** chip to see every module with a
status:

| Status | Meaning |
|---|---|
| Active | Fully usable |
| Cancels *\<date\>* | You cancelled, but keep full access until the current billing cycle ends |
| Grace · *N*d left | Past cancellation — read-only access only, counting down the grace window (30 days unless the platform sets longer) |
| Expired / Cancelled | No access; your data is retained, never deleted |
| Not licensed | Never activated |

Buttons let you **Activate** a module, **Cancel** an active one (a confirm dialog explains the grace period; **Keep it active** or
**Cancel license**), **Reactivate** during
grace or after cancellation (this restores full access and replays anything
that was queued up while you were on hold), or **Undo cancellation** while
it's still pending.

Cancelling a module **never deletes your data** — you get a read-only grace window, then the
module is simply inaccessible until you reactivate. When WonderArk takes a module down
platform-wide, its pages say it is temporarily unavailable or down for maintenance.

**Licenses and plans.** Licensing is tied to the business's plan (§7):

- Only people who can manage billing for the business (the Owner, plus anyone
  whose role grants `billing.subscription.change`) can activate, cancel or
  reactivate a module.
- Once online checkout is available, you can only switch a module on if your
  current plan includes it. Otherwise the page tells you to choose a plan
  that does, on the Billing page.
- A module that comes with your plan can't be cancelled from the Licenses
  screen — change or cancel the plan on the Billing page instead, so the two
  never disagree.
- What a person sees also depends on their role (§8). In the sidebar, a module their role
  doesn't allow looks the same as an unlicensed one (locked). A module the business hasn't
  licensed opens a page saying "… isn't part of your plan yet" with **View plans**; opening
  a page their role doesn't allow by its address says they don't have permission.

**Disabling a business.** In **Admin** (the business list), **Disable** hides
a business from the switcher and navigation without deleting anything;
**Re-enable** brings it back.

## 7. Plans, billing and AI credits

Each business has its own plan, which decides the modules it can use. Open
**\<business\> → Billing** (the **Billing** button on the **Business** page,
or **Manage plan** in the Plans list under avatar menu → Billing) to see the
current plan, its price, the modules it includes and your next billing date.
Everyone in the business can see the plan; changing it and seeing payments is
for people who hold `billing.subscription.change` (the Owner, plus anyone the
business grants it to). Everyone else is told to ask an owner or admin of the
account to change the plan.

The Billing page has three tabs — **Overview**, **Plans** and **Payment
history**.

- **Choosing a plan.** **Plans** ("Choose your plan") lists each plan with
  the modules it includes. Pick a plan and a monthly or yearly cycle, check
  the **Review your plan** summary (the price, the billing cycle, and that
  taxes, if any, are shown on the payment page), then pay through the secure
  checkout. Your licences update as soon as the payment is confirmed. The
  success page says "Subscription active" only once the payment has really
  been confirmed; until then it says "Payment received" and keeps checking,
  which usually takes a few seconds. If online payment isn't available for
  your business's currency yet, the Plans page tells you so.
- **If a payment doesn't go through,** nothing changes: you stay on your
  current plan, and the page says either "Checkout cancelled" (you left
  before paying; nothing was charged) or "Payment didn't go through" (you
  haven't been charged). Choose **Try again**, or use a different payment
  method.
- **Free plans.** A free plan shows **Get started**, then **Activate free plan** — no
  payment. Someone who can't change the plan sees "Only account owners and admins can change
  the plan."
- **Upgrading or downgrading.** On a paid plan, **Change plan** (**Upgrade plan** on a free
  plan, **Choose a plan** with none) shows the
  current and new plan side by side and says when the change takes effect:
  straight away (with a prorated charge or credit, if that is how billing is
  set up) or on your next billing date, when you keep the current plan until
  then. Modules the new plan doesn't include become read-only for 30 days
  after the change takes effect; your data is kept.
- **Past-due payments.** If your latest payment couldn't be confirmed, a
  "Payment needs attention" banner appears. While payment is only past due,
  the subscription stays active; if further payments fail, the modules
  become read-only until you **Update payment method**.
- **Manage billing** and **View invoices** open the secure billing portal,
  where you update the payment method and see your invoices. **Payment
  history** lists every payment with its status (Pending, Paid, Failed,
  Refunded, Partly refunded, Disputed, Charged back). WonderArk never stores
  card details.
- If checkout didn't finish, the success page says "Checkout didn't complete".
- **Cancel subscription** stops renewal (you can tell us why — optional). You keep full access until the end
  of the period you paid for, then the modules move to the 30-day read-only
  grace described in §6, and there are no further charges. Your data is never
  deleted. Until the period ends, **Keep my plan** undoes the cancellation, and
  subscribing again later restores everything.

**Avatar menu → Billing** (account-wide) is where AI is configured, and it
also lists each business's current plan with a **Manage plan** (or **Choose
a plan**) link:

- **AI.** Connect your own AI provider key — OpenAI, Anthropic or Google Gemini — so AI
  features run on your own provider account and bill straight to it, with no monthly allowance
from WonderArk. WonderArk tests the key before
  saving it and only ever shows back a fingerprint of it. Or choose
  **App Internal AI** to use WonderArk's included credits instead — no key
  needed. Switching providers is a matter of pasting a new key
  (**Replace key**); **Disconnect**, or choosing App Internal AI, goes back to
  the included credits.
- **Monthly allowance.** On the included credits, each offering (workspace) gets 200 AI runs
  or $20 of AI cost a month, whichever is reached first; then AI features pause for it until
  next month — unless you have bought credits.
- **AI credits.** Buy a credit pack — **Starter**, **Growth** or **Scale**;
  each card shows its price and how many AI runs it adds. Credits are spent
  automatically, one run at a time, only once a workspace has used up its
  free monthly allowance. They are shared across every business and offering
  on the account, and the page shows your **Remaining balance** and your
  **purchase history**. If you close the checkout window part-way through a
  payment, check the purchase history for its status before paying again.

**Avatar menu → Usage** shows your account-wide AI usage this month,
remaining credit balance, and a breakdown per business and offering; each
business's **Business** page also has an **AI usage** button. Repeated AI
requests are cached, so asking for the same research twice doesn't cost
twice.

## 8. Users, roles and invitations

**Users & access** — the chip on each business in avatar menu → **Admin**, or
on the **Business** page — is where you manage who can use a business and
what they can do. It has four tabs: **Users**, **Roles**, **Invitations** and
**Activity**. Everything here is per business: someone can be an Admin in one
business and a Viewer in another. (The older "Team" page now simply forwards
here.)

- **Invite user** sends an email invitation with any role except Owner (if email isn't set up
  for the deployment, the invitation is created and you share the link yourself). The link works for
  7 days, only for the email address it was sent to, and only once.
  Someone without an account signs up from the link and lands straight back
  on the invitation. Pending invitations can be revoked.
- **Change a role** from the user's details; it takes effect on their next
  page load. You can never give someone more than you hold yourself, and
  nobody can change their own role.
- **Suspend** removes access immediately without losing the person's history;
  reactivate to restore it. **Remove access** ends their membership.
- **Transfer ownership** hands the Owner role to another member (the old
  owner becomes an Admin). A business always keeps at least one Owner.
- **Activity** shows every invitation, role change and suspension.

**System roles** — Owner, Admin, Sales Manager, Accountant, Inventory
Manager, Procurement Manager, Warehouse Operator and Viewer — each show
exactly which permissions they grant, grouped by module. For anything else,
**Create role** builds a **custom role**, blank or ("Start from (optional)") from a template —
Business Admin, Sales Manager, Marketing Manager, Finance Manager, Operations Manager, Field
Technician, Accountant, Viewer — that you then adjust. Permissions marked **High risk** deserve
a second look. **Archive role** retires a custom role.

Roles are enforced by the platform itself, not just hidden in the menus:

- A role only sees the modules it has permission for, even when the business
  licenses more. A **Viewer** can read everything licensed and change
  nothing.
- A role that works in one module can still trigger the hand-offs that
  module owns — a Sales Manager creating a service quote from a CRM
  opportunity, or a technician reserving parts for a job — without being
  given the rest of the other module.
- If someone opens a page their role doesn't allow, they're told they don't have
  permission — different from the "isn't part of your plan yet" page for a module the
  business hasn't licensed.

## 9. API keys

**API keys** — the chip on each business in avatar menu → **Admin** — manages keys for
WonderArk's public REST API, which covers every licensed module's resources. A key is shown
once when it's created (it starts `sk_live_` and is sent as `Bearer sk_live_…`); revoke it
here and it stops working immediately. A key can do what its creator's role could do when it
was created — after a role change, issue a new key. Each business can make 120 requests a
minute. Generating and revoking keys needs the `settings.manage` permission; without it the
page tells you that you don't have permission.

The same key also connects an AI agent to WonderArk — see §13.

## 10. Exporting your data

Lists, reports and dashboards have an **Export** button in the page header.
Choose **CSV** or **Excel**:

- On a list, the file contains what you're looking at — the same filters,
  search and columns. Long lists also let you choose **Current filtered view**
  or **All matching records** before you pick the format.
- On a report or dashboard, **CSV** is the report's main table and **Excel**
  is the full workbook, with a sheet for each part of the report.

While a file is being prepared the button shows "Preparing…", so a double
click can't start two. Large exports run in the background: you'll see
"Export queued", and when the file is ready the **bell** shows "Export ready"
with a link to download it (or "Export failed", in which case nothing was
changed and you can simply try again). Background files are kept for about a
week and then removed. Exports respect permissions: each module has its own
export permission (for example `crm.export` or `finance.reports.export`), a
refusal tells you why (not licensed, no permission), and every export is
recorded in the audit log.

## 11. Your profile, your data and appearance

**Avatar menu → Profile** holds your personal details — name, photo, short
bio, phone, job title, location and time zone — visible only to you.

**Your data.** At the bottom of the Profile page, **Download my data** gives
you a copy of the personal data WonderArk holds about you as a person, as a
JSON file: your sign-in details (including which sign-in methods you use),
profile, account and business memberships, any employee records that name
you, the Terms and Privacy versions you accepted, and the actions recorded under your name (up
to the 5,000 most recent).
Records you created *for a business* — its customers, invoices, prospects and
so on — belong to that business and are exported from within each module
(§10). To correct or delete your data, or to close your account, email
connect@wonderapps.biz from the address on your account; the Profile page and
the Privacy Policy ("your rights") say the same.

The avatar menu also has **Get Help** (these guides — signed-in only) and **Log Out**.

**Avatar menu → Appearance** switches between **Light**, **Dark** and
**System** (follows your device). The choice is saved on the device you set
it on.

## 12. Organizations, addresses and environments

Each business is an **organization** with its own address, such as
`acme.ark.wonderapps.biz`. The address prefix is 3–32 lowercase letters, digits or hyphens,
and some words are reserved. An organization can have up to four **environments** —
Production (`acme`), Development (`acme-dev`), Test (`acme-test`) and Staging
(`acme-staging`) — each a separate business with its own data, switched between with the
chips in the business switcher.

**Manage organizations** (the last item in the business switcher) is for owners:

- **New organization** creates a business (see §2).
- **Rename** changes the name of the organization and its environments.
- **Disable** / **Enable** stops or restores access to the whole organization, or one
  environment: "Nobody can use the organization or its environments until you enable it."
  Nothing is deleted. An organization WonderArk has suspended shows "Suspended by WonderArk"
  and can't be re-enabled here.
- **Add an environment** → **Pay and set up**. Payments are in test mode for now: "Test
  payment: no money is charged."

An address nobody uses shows "No organization at this address"; a paused organization's
address says so and refuses sign-in.

When WonderArk updates its Terms or Privacy Policy, you're asked to accept the new version
("We've updated our terms", **I agree**) before continuing. Platform notices for your
business — information, maintenance, warnings — appear as a banner at the top.

## 13. Connecting an AI agent (MCP server)

An AI agent or tool that supports the Model Context Protocol (MCP) can connect to WonderArk
at `https://<your address>/api/mcp`, using a business API key (§9) as the bearer token. It
can use what that key can:

- **list_records** and **get_record** — read the business's records (tools).
- **ask_assistant** — an AI agent that answers a question from the business's records. It
  only answers; the answer is AI-generated and changes nothing.
- **draft_whatsapp_reply** — an AI agent that drafts a reply to the latest customer message in
  a WhatsApp conversation, from the business's own facts. The draft is saved for your team in
  CRM; nothing is sent.

The key's licences, permissions and rate limit apply. Apart from saving a reply draft,
nothing an agent does through MCP changes your business's records, and nothing is ever sent.

## 14. The Superadmin Platform Portal

If you operate a WonderArk deployment (rather than just using one), there is
a separate staff-only control plane at `/platform` — global branding, plans
and prices, feature entitlements, usage limits, which modules exist at all
and feature flags, AI providers, routing, feature policies and usage, the
email provider, templates and notification policies, integrations,
compliance packs, platform policies, announcements, organizations, business overrides,
legal documents, system health, audit search, and subscription, payment and billing-event
records. It is protected by
multi-factor sign-in, and every change there is recorded in the platform
audit log and configuration history.

A superadmin can also switch off a single AI feature for everyone (for
example, AI outreach drafts) from **AI Feature Policies**, without turning
off the module or any other AI feature — each switch needs a reason and is
audited.

On **Feature Flags**, each flag's **Rollout** opens its staged rollout: **Internal** (only the
businesses you name by slug), **Pilot** (those plus a share of all businesses), **Selected
Plans** (plus every business on the plans you tick) and **All Customers**. A business's place
in the share is fixed, so raising it only adds businesses. **Roll back** returns the flag to
its previous rollout, or turns it off when there is none, without a code change. Both need a
reason and are recorded in the flag's history.

The public **Careers** page (`/careers`, linked from the site footer) lists open positions
and takes applications. WonderJobs runs everything behind it — the jobs, the applications,
the emails to applicants and the hiring team, decisions and deletion — and WonderArk stores
no applicant's details. To connect it, register `https://<your address>/careers` in WonderJobs
(Hiring → Jobs → Career sites → Add a career site → "On our own website"), then paste the
career-site key it shows (it starts with `wjcs_`) on **Platform → Careers** and press
**Test connection**. The key is stored encrypted and shown only as `wjcs_••••••••` plus its
last four characters; every save and clear is recorded in Audit Search.

It's not a licensable module and ordinary business admins never
see it; it exists for whoever runs the WonderArk service itself.

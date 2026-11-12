# Module menus: everyday pages first

Owner, 2026-11-11: "simplify the module menus and pages, reduce and make it intuitive".

## What changed

Each module's menu in the sidebar now opens with the pages used every day, shown bare with
nothing to open. Everything else sits under one to three named groups that stay folded until
opened. No page moved: every link keeps its path, and a group opens by itself when it holds
the page you are on.

Before, every page sat under a heading, and a heading is folded until clicked. Service had
seven headings for nine pages, so reaching any page took two clicks.

| Module | Before (headings, pages) | After (everyday pages, groups) | Menu rows in all |
| --- | --- | --- | --- |
| Service | 7 headings, 9 pages | 6 everyday, 1 group (More) | 16 to 10 |
| Inventory | 4 headings, 13 pages | 5 everyday, 2 groups | 17 to 15 |
| CRM | 3 headings, 13 pages | 5 everyday, 2 groups | 16 to 15 |
| Finance | 4 headings, 27 pages | 6 everyday, 3 groups | 31 to 30 |

Everyday pages:

- **Service**: Dashboard, Jobs, Schedule, My Day, Customers, Invoices.
- **Inventory**: Dashboard, Products, Inventory, Sales Orders, Purchase Orders.
- **CRM**: Inbox, Dashboard, Leads, Sales Opportunities, Follow-ups.
- **Finance**: Dashboard, Invoices, Bills, Expenses, Banking, GST Filing.

Discovery's offering pages (four tabs per offering and a Today list) are in
`17-DISCOVERY-DATA-AND-CONSUMER.md`, package B6. Its sidebar menu is the next section.

## Discovery: four links, and Business above the modules

Owner, 2026-11-12, with a screenshot of the open Discovery menu: "re evaluate the menu as
shown and keep only required items, some may make more sense outside all modules, think and
try to minimize the menu and submenus".

Discovery's menu was two links and four folding sections: Overview, Business, Business
Offerings (one row per offering), Marketing (7 pages), Customer Acquisition (4) and Funding
(9). Every one of those sub-pages is also a tab across the top of its own page, so the
sidebar listed each page twice.

| | Before | After |
| --- | --- | --- |
| Rows in Discovery's menu, folded | 6 | 4 |
| Rows with every section open (one offering) | 27 | 4 |
| Sections to unfold | 4 | 0 |

- **Discovery** is now Overview, Customer Acquisition, Marketing, Funding. Each is a plain
  link to the section's first page; the tabs on the page reach the rest. Customer
  Acquisition opens the offering last worked in (the Business page when there is none).
- **Business** left Discovery. It is the business's profile and its offerings, which every
  module relies on, so it is one row above the modules, under Executive Dashboard.
- **Business Offerings** is gone from the sidebar. The Business page lists the offerings,
  and an offering's pages have a switcher in their header.

No route, permission or licence check changed, and every page is still reachable. What
takes one click more: a Marketing or Funding page other than the dashboard (open the
section, then its tab), and a second offering (the switcher on the offering's page, or the
Business page). Code: `packages/core/src/lib/discovery-nav.ts`.

## Not in the menu change

Labels are unchanged, so help and tests that name a page still match. The menu change left
page contents alone; the pages are the next section.

## Pages: fewer controls on the everyday pages

Second step of the same request. The 22 everyday pages of Service, Inventory, CRM and
Finance were audited and the ones with the most to gain simplified (CLAUDE.md, "Minimal
UI"). Discovery's pages are in `17-DISCOVERY-DATA-AND-CONSUMER.md`.

A control is something to press or change that is on screen when the page opens: a
button, a link, a select, an input, a tab, a switch. A row's action counts once however
many rows there are; a row link counts once; the Export button counts once. Counts are
for a user who may do everything on the page.

| Module | Page | Before | After | What moved where |
| --- | --- | --- | --- | --- |
| Service | Dashboard | 11 | 8 | "New opportunity", "New job" and "Schedule" removed: each only opened a list page that the menu and the card's "View all" open. |
| Service | Schedule | 10 | 10 | The technician list (a switch per team member) is behind one "Technicians" button under the calendar. |
| Service | Invoices | 4 | 4 | No control moved. Below `md` each invoice is a card; it was a seven-column table that scrolled sideways. |
| Inventory | Dashboard | 7 | 4 | Choosing a warehouse applies the filter, so Apply (and Clear, shown once a warehouse was chosen) are gone. "Quick links" removed: Products and Audit log are in the menu; alerts open from "All alerts" on the Reorder watchlist. |
| Inventory | Products | 6 | 4 | "Barcode / QR" and "Import" are under More. Activate / Deactivate is in the dialog a row's Edit opens. |
| Inventory | Purchase Orders | 5 | 3 | A row keeps View. Edit (drafts) and the next step are in the order View opens. |
| Inventory | Sales Orders | 4 | 3 | A row keeps View; the next step is in the order View opens. |
| CRM | Inbox | 7 | 4 | The create form is behind "New ticket". "Customer 360" and "Convert to prospect" share one More button on rows that have both. |
| CRM | Leads | 6 | 4 | Choosing a status or an owner saves it; Update and Assign are gone. |
| CRM | Sales Opportunities (List) | 8 | 5 | A row keeps View. Assign owner and Edit value are on the opportunity's page. |
| CRM | Follow-ups | 13 | 9 | The four filters are behind one "Filters" button; a filter applies when chosen, so Apply is gone. |
| Finance | Dashboard | 12 | 8 | "GST Profile", "e-Way Bill", "e-Invoicing" and "GST Filing" removed: all four are in the menu. A missing GST profile links to its page. |
| Finance | GST Filing | 5 | 5 | The boxed paragraph on each tab is one line. An empty month shows no download button (4 controls) where it showed a disabled one. |

Schedule's count is by kind, so it is unchanged: the switches became one button. With five
team members the page has four fewer things on it.

Three helpers in `packages/core/src/components/ui/` carry the repeated patterns:
`more-menu.tsx` (occasional actions behind "More", or behind one icon button on a row),
`fold.tsx` (one button that opens filters, a form or a rarely used list) and
`auto-submit-select.tsx` (a select that submits its own form when changed).

What did not change: no route, permission check, licence check, server action or query.
Every action is still there; these take one click more than before:

- Inventory: label printing and import (More); activate or deactivate a product (Edit
  first); approve, send, close or edit a purchase order and confirm, process, pack or ship
  a sales order (View first).
- CRM: create a ticket (New ticket first); Customer 360 or Convert to prospect on a ticket
  that has both (More first); assign an owner or edit the value of an opportunity from the
  List view (View first); filter follow-ups (Filters first).
- Service: mark a team member as a technician (Technicians first).

Audited and left alone, with their control counts: Service Jobs (5), My Day (5: a
technician needs Open, Map, the visit's next step and the clock), Customers (2);
Inventory stock (3); CRM Dashboard (Export and tiles that are the data); Finance Invoices
(the period chips and four status tiles are its filters), Bills (2), Expenses (2),
Banking (4).

## Stories

### PLATFORM-NAV-P0-01.1 — Service menu: everyday pages first, one More group
### PLATFORM-NAV-P0-01.2 — Inventory menu: everyday pages first, two groups
### PLATFORM-NAV-P0-01.3 — CRM menu: everyday pages first, Insights and Setup
### PLATFORM-NAV-P0-01.4 — Finance menu: everyday pages first, three groups
### PLATFORM-NAV-P0-02.1 — Service pages: dashboard, Schedule, invoice cards on a phone
### PLATFORM-NAV-P0-02.2 — Inventory pages: dashboard, Products, Purchase Orders, Sales Orders
### PLATFORM-NAV-P0-02.3 — CRM pages: Inbox, Leads, Sales Opportunities, Follow-ups
### PLATFORM-NAV-P0-02.4 — Finance pages: dashboard, GST Filing
### PLATFORM-NAV-P0-03.1 — Discovery menu: four plain links, no folding sections
### PLATFORM-NAV-P0-03.2 — Business: one row above the modules, outside Discovery

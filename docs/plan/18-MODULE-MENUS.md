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

Discovery's own menu (four tabs per offering and a Today list) is in
`17-DISCOVERY-DATA-AND-CONSUMER.md`, package B6.

## Not in this change

Labels are unchanged, so help and tests that name a page still match. Page contents are
unchanged. Simplifying the pages themselves, module by module, is the next step and needs
each page's controls counted before and after (CLAUDE.md, "Minimal UI").

## Stories

### PLATFORM-NAV-P0-01.1 — Service menu: everyday pages first, one More group
### PLATFORM-NAV-P0-01.2 — Inventory menu: everyday pages first, two groups
### PLATFORM-NAV-P0-01.3 — CRM menu: everyday pages first, Insights and Setup
### PLATFORM-NAV-P0-01.4 — Finance menu: everyday pages first, three groups

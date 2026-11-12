/**
 * PLATFORM-NAV-P0-02.1 -- the Service pages simplified under CLAUDE.md's "Minimal UI".
 * Pins what is on screen before anything is opened: the dashboard's control count, the
 * folded technician list, and the invoice cards a phone gets instead of a wide table.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DispatcherDashboardView } from "./dashboard/dispatcher-dashboard-view";
import { InvoicesList } from "./invoices/invoices-list";
import { TechnicianRosterPanel } from "./schedule/technician-roster-panel";
import type { DispatcherDashboard } from "../lib/dashboard/types";
import type { InvoiceListItem } from "../lib/invoices/types";

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const linkTexts = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());

const EMPTY: DispatcherDashboard = {
  todaysEvents: [],
  unassignedJobs: [],
  jobsInProgress: [],
  overdueInvoices: [],
  estimatesAwaitingResponse: [],
  jobs: [],
  invoices: [],
  opportunities: [],
};

describe("Service dashboard", () => {
  const html = renderToStaticMarkup(<DispatcherDashboardView businessId="b1" data={EMPTY} />);

  it("keeps the range switch and one View all per list, and nothing else to press", () => {
    const texts = linkTexts(html);
    expect(texts.filter((t) => t === "Today" || t === "This week")).toHaveLength(2);
    expect(texts.filter((t) => t.startsWith("View all"))).toHaveLength(5);
    // Was 10 here (plus Export in the page header): the three buttons that only opened
    // list pages are gone.
    expect(texts).toHaveLength(7);
    expect(count(html, /<button\b/g)).toBe(0);
  });

  it("no longer offers buttons that looked like create actions but opened a list", () => {
    expect(html).not.toContain("New opportunity");
    expect(html).not.toContain("New job");
  });

  it("still reaches every page those buttons opened", () => {
    for (const page of ["schedule", "jobs", "invoices", "opportunities"]) {
      expect(html).toContain(`/fsm/${page}"`);
    }
  });

  it("marks the range in use", () => {
    expect(html).toMatch(/aria-current="true"[^>]*>Today/);
  });
});

describe("Technician list on Schedule", () => {
  const roster = [
    { user_id: "u1", full_name: "Asha", email: null, role: "admin", employee_id: "e1", is_active: true },
    { user_id: "u2", full_name: "Ravi", email: null, role: "member", employee_id: null, is_active: false },
  ];
  const html = renderToStaticMarkup(<TechnicianRosterPanel roster={roster} toggleAction={async () => {}} />);

  it("is one button until opened, not a switch per team member", () => {
    expect(count(html, /<button\b/g)).toBe(1);
    expect(html).toContain("Technicians");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Asha");
  });

  it("renders nothing without team members", () => {
    expect(renderToStaticMarkup(<TechnicianRosterPanel roster={[]} toggleAction={async () => {}} />)).toBe("");
  });
});

describe("Service invoices", () => {
  const invoice = {
    id: "i1",
    business_id: "b1",
    number: "INV-7",
    status: "sent",
    total_amount: 1200,
    balance_amount: 400,
    created_at: "2026-11-01T00:00:00Z",
    party_name: "Acme Traders",
    job_number: "JOB-3",
  } as unknown as InvoiceListItem;
  const html = renderToStaticMarkup(<InvoicesList invoices={[invoice]} businessId="b1" />);

  it("gives a phone one card per invoice and keeps the table for md and up", () => {
    expect(html).toMatch(/<ul class="[^"]*md:hidden/);
    expect(html).toMatch(/<div class="hidden [^"]*md:block/);
  });

  it("puts the same invoice, one link each, in the card and in the table row", () => {
    expect(count(html, /href="\/dashboard\/businesses\/b1\/fsm\/invoices\/i1"/g)).toBe(2);
    expect(count(html, /Acme Traders/g)).toBe(2);
    expect(html).toContain("Job JOB-3");
    expect(html).toContain("Balance");
  });

  it("keeps its two tabs as the only buttons", () => {
    expect(count(html, /<button\b/g)).toBe(2);
  });
});

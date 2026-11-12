/**
 * PLATFORM-NAV-P0-02.3 -- the CRM list pages simplified under CLAUDE.md's "Minimal UI",
 * rendered to HTML with their queries mocked. Pins what a row carries and what is on
 * screen before anything is opened; the server actions themselves are untouched and keep
 * their own tests.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLeads: vi.fn(),
  listOpportunities: vi.fn(),
  listFollowUpQueue: vi.fn(),
}));
const action = vi.hoisted(() => async () => {});

vi.mock("@cofounderai/core/businesses/resolve", () => ({ resolveBusinessIdBySlug: async () => "b1" }));
vi.mock("@cofounderai/module-crm/lib/tenancy/queries", () => ({ getBusiness: async () => ({ id: "b1", name: "Acme" }) }));
vi.mock("@cofounderai/core/parties/queries", () => ({
  listPartiesForBusiness: async () => [{ id: "party1", name: "Asha Rao" }],
}));
vi.mock("@cofounderai/module-crm/lib/tickets/queries", () => ({
  listEmployeeOptions: async () => [{ id: "e1", full_name: "Ravi", email: null }],
}));
vi.mock("@cofounderai/module-crm/lib/leads/queries", () => ({ listLeads: mocks.listLeads }));
vi.mock("@cofounderai/module-crm/lib/opportunities/queries", () => ({ listOpportunities: mocks.listOpportunities }));
vi.mock("@cofounderai/module-crm/lib/opportunities/mutations", () => ({
  ensureDefaultStages: async () => [{ id: "s1", name: "Qualified" }],
}));
vi.mock("@cofounderai/module-crm/lib/follow-ups/queries", () => ({ listFollowUpQueue: mocks.listFollowUpQueue }));
vi.mock("./leads/actions", () => ({ assignLeadAction: action, updateLeadStatusAction: action }));
vi.mock("./opportunities/actions", () => ({
  assignOpportunityAction: action,
  updateOpportunityStageAction: action,
  updateOpportunityValueAction: action,
}));
vi.mock("./opportunities/opportunities-kanban", () => ({ OpportunitiesKanban: () => null }));
vi.mock("./follow-ups/actions", () => ({ completeFollowUpAction: action }));

const LeadsPage = (await import("./leads/page")).default;
const OpportunitiesPage = (await import("./opportunities/page")).default;
const FollowUpsPage = (await import("./follow-ups/page")).default;

const params = Promise.resolve({ businessSlug: "acme" });
const html = async (node: Promise<unknown>) => renderToStaticMarkup((await node) as never);
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
const buttons = (text: string) =>
  [...text.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());

beforeEach(() => {
  mocks.listLeads.mockResolvedValue([
    { id: "l1", party_id: "party1", source: "website", status: "new", owner_id: null, created_at: "2026-11-01T00:00:00Z" },
  ]);
  mocks.listOpportunities.mockResolvedValue([
    {
      id: "o1",
      party_id: "party1",
      status: "open",
      stage_id: "s1",
      estimated_value: 5000,
      currency: "INR",
      probability: 50,
      expected_close_date: null,
      owner_id: "e1",
      created_at: "2026-11-01T00:00:00Z",
    },
  ]);
  mocks.listFollowUpQueue.mockResolvedValue([
    {
      id: "f1",
      partyName: "Asha Rao",
      reviewSummary: null,
      productInterestSummary: null,
      priority: "high",
      source: "website",
      channel: "email",
      due_at: "2099-01-01T00:00:00Z",
      owner_id: "e1",
    },
  ]);
});

describe("CRM Leads", () => {
  it("saves a status or an owner by choosing it: two selects a row, no Update or Assign button", async () => {
    const page = await html(LeadsPage({ params }));
    // One lead, rendered once as a card and once as a table row.
    expect(count(page, /<select\b[^>]*name="status"/g)).toBe(2);
    expect(count(page, /<select\b[^>]*name="ownerId"/g)).toBe(2);
    expect(buttons(page)).toEqual(["Export"]);
    expect(page).not.toContain("Update");
    expect(page).not.toContain(">Assign<");
  });

  it("still shows an unassigned lead as Unassigned", async () => {
    expect(await html(LeadsPage({ params }))).toContain("Unassigned");
  });
});

describe("CRM Sales Opportunities, List view", () => {
  const list = () => html(OpportunitiesPage({ params, searchParams: Promise.resolve({ view: "list" }) }));

  it("carries one action per row: View, which opens the opportunity", async () => {
    const page = await list();
    expect(count(page, /href="\/acme\/crm\/opportunities\/o1"/g)).toBe(2);
    expect(count(page, /<select\b/g)).toBe(0);
    expect(buttons(page)).toEqual(["Export"]);
    expect(page).not.toContain(">Assign<");
    expect(page).not.toContain("Edit");
  });

  it("shows the owner and the value as text instead of as controls", async () => {
    const page = await list();
    expect(count(page, />Ravi</g)).toBe(2);
    expect(page).toContain("5,000");
  });
});

describe("CRM Follow-ups", () => {
  const queue = (search: Record<string, string> = {}) =>
    html(FollowUpsPage({ params, searchParams: Promise.resolve(search) }));

  it("opens with the filters folded behind one button", async () => {
    const page = await queue();
    expect(count(page, /<select\b/g)).toBe(0);
    expect(buttons(page)).toContain("Filters");
    expect(page).not.toContain("Apply");
    expect(page).not.toContain("Clear filters");
    // Export, Filters, and Complete on the one row's card and table row.
    expect(buttons(page)).toHaveLength(4);
  });

  it("keeps all six views and the row's Complete action", async () => {
    const page = await queue();
    for (const view of ["All", "Due today", "Overdue", "Upcoming", "Unassigned", "High priority"]) {
      expect(page).toContain(`>${view}</a>`);
    }
    expect(buttons(page).filter((b) => b === "Complete")).toHaveLength(2);
  });

  it("opens on the filters in effect, counts them and offers Clear filters", async () => {
    const page = await queue({ ownerId: "e1", priority: "high" });
    expect(buttons(page)).toContain("Filters· 2");
    expect(count(page, /<select\b/g)).toBe(4);
    expect(page).toContain("Clear filters");
    expect(page).toMatch(/<option value="high" selected=""/);
  });
});

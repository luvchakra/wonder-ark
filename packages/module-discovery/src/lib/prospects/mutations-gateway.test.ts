/**
 * DISC-DATA-P0-03.3 (B8): approving a suggestion staged from the prospect data gateway.
 * The prospect it becomes carries the same source; the organisation's own contact points
 * and the origin of every filled column are copied from the stored record; a company
 * that is already a prospect is refused, not added twice. An AI web-search suggestion is
 * approved exactly as it was before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";
import { businessItem } from "../data-sources/__tests__/fixtures/contract";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  ensureProspectParty: vi.fn(),
  findDuplicateProspect: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("./party-sync", () => ({ ensureProspectParty: h.ensureProspectParty, markProspectPartyWon: vi.fn() }));
vi.mock("./duplicates", () => ({ findDuplicateProspect: h.findDuplicateProspect }));

const { approveProspectSuggestions, approveProspectSuggestionsDetailed } = await import("./mutations");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";

const gatewaySuggestion = {
  id: "s1",
  workspace_id: WORKSPACE,
  kind: "company",
  company_name: "Shree Electricals",
  website: "https://shree-electricals.example/",
  industry: null,
  company_size: null,
  location: "Kothrud, Pune",
  description: null,
  match_reason: 'Matches your search for "electrician" in Pune.',
  source_url: "https://www.openstreetmap.org/node/123",
  source: "stored",
  source_name: "OpenStreetMap contributors (ODbL)",
  source_ref: "https://www.openstreetmap.org/node/123",
  external_id: "businesses_3f9a...",
  payload: { ...businessItem, phone: "+91 20 5555 0100", email: "info@shree-electricals.example" },
  created_at: "2026-11-11T13:00:00Z",
};

const webSearchSuggestion = {
  id: "s2",
  workspace_id: WORKSPACE,
  kind: "company",
  company_name: "Acme",
  website: "acme.com",
  industry: "Fintech",
  company_size: null,
  location: null,
  description: null,
  match_reason: "Hiring ops staff",
  source_url: "https://news.example/acme",
  source: "web_search",
  source_name: "Web search (AI)",
  source_ref: null,
  external_id: null,
  payload: null,
  created_at: "2026-11-11T13:00:00Z",
};

/** Suggestions come back from the fetch; an insert into prospects returns one row per
 * row written, in order. */
function mockApproval(suggestions: unknown[]) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (call.table === "prospect_suggestions") {
        return { data: usedOp(call, "delete") ? null : suggestions, error: null };
      }
      if (call.table === "prospects" && usedOp(call, "insert")) {
        const rows = writtenRow(call) as unknown as Record<string, unknown>[];
        return { data: rows.map((row, i) => ({ ...row, id: `p${i + 1}`, party_id: null })), error: null };
      }
      return { data: null, error: null };
    },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

function insertedProspects(supabase: ReturnType<typeof mockApproval>): Record<string, unknown>[] {
  const insert = supabase.queries("prospects").find((call) => usedOp(call, "insert"));
  return insert ? (writtenRow(insert) as unknown as Record<string, unknown>[]) : [];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.ensureProspectParty.mockResolvedValue("party-1");
  h.findDuplicateProspect.mockResolvedValue(null);
});

describe("approving a gateway suggestion", () => {
  it("creates a prospect carrying the same source", async () => {
    const supabase = mockApproval([gatewaySuggestion]);

    await expect(approveProspectSuggestionsDetailed(WORKSPACE, ["s1"])).resolves.toEqual({ added: 1, duplicates: 0 });

    expect(insertedProspects(supabase)).toEqual([
      expect.objectContaining({
        workspace_id: WORKSPACE,
        company_name: "Shree Electricals",
        website: "https://shree-electricals.example/",
        domain: "shree-electricals.example",
        location: "Kothrud, Pune",
        kind: "company",
        source: "stored",
        source_name: "OpenStreetMap contributors (ODbL)",
        source_ref: "https://www.openstreetmap.org/node/123",
      }),
    ]);
  });

  it("copies the organisation's own phone and mailbox from the stored record", async () => {
    const supabase = mockApproval([gatewaySuggestion]);

    await approveProspectSuggestionsDetailed(WORKSPACE, ["s1"]);

    expect(insertedProspects(supabase)[0]).toMatchObject({
      phone: "+91 20 5555 0100",
      company_email: "info@shree-electricals.example",
    });
  });

  it("notes where each column the source filled came from, and only those", async () => {
    const supabase = mockApproval([gatewaySuggestion]);

    await approveProspectSuggestionsDetailed(WORKSPACE, ["s1"]);

    const fieldSources = insertedProspects(supabase)[0]!.field_sources as Record<string, unknown>;
    expect(Object.keys(fieldSources).sort()).toEqual(["company_email", "location", "phone", "website"]);
    expect(fieldSources.phone).toEqual({
      provider: "stored",
      name: "OpenStreetMap contributors (ODbL)",
      url: "https://www.openstreetmap.org/node/123",
      observedAt: "2026-11-09T02:23:00Z",
    });
  });

  it("copies nothing from a stored record that is not what was expected", async () => {
    const supabase = mockApproval([{ ...gatewaySuggestion, payload: { phone: 12345, email: "not an address" } }]);

    await approveProspectSuggestionsDetailed(WORKSPACE, ["s1"]);

    expect(insertedProspects(supabase)[0]).toMatchObject({ phone: null, company_email: null });
  });

  it("carries the match reason and the source link into the seeded research row", async () => {
    const supabase = mockApproval([gatewaySuggestion]);

    await approveProspectSuggestionsDetailed(WORKSPACE, ["s1"]);

    const research = writtenRow(supabase.queries("prospect_research")[0]!) as unknown as Record<string, unknown>[];
    expect(research[0]).toMatchObject({
      prospect_id: "p1",
      recommended_angle: 'Matches your search for "electrician" in Pune.',
      evidence: [
        expect.objectContaining({ source_url: "https://www.openstreetmap.org/node/123", confidence: "inference" }),
      ],
    });
  });
});

describe("a duplicate is refused", () => {
  it("does not add a company that is already a prospect, and says so", async () => {
    const supabase = mockApproval([gatewaySuggestion]);
    h.findDuplicateProspect.mockResolvedValue({ id: "p-existing", company_name: "Shree Electricals" });

    await expect(approveProspectSuggestionsDetailed(WORKSPACE, ["s1"])).resolves.toEqual({ added: 0, duplicates: 1 });

    expect(h.findDuplicateProspect).toHaveBeenCalledWith(WORKSPACE, {
      companyName: "Shree Electricals",
      website: "https://shree-electricals.example/",
    });
    expect(insertedProspects(supabase)).toEqual([]);
    expect(supabase.queries("prospect_research")).toEqual([]);
  });

  it("clears the refused suggestion from the review list: there is nothing left to decide", async () => {
    const supabase = mockApproval([gatewaySuggestion]);
    h.findDuplicateProspect.mockResolvedValue({ id: "p-existing", company_name: "Shree Electricals" });

    await approveProspectSuggestionsDetailed(WORKSPACE, ["s1"]);

    expect(supabase.queries("prospect_suggestions").some((call) => usedOp(call, "delete"))).toBe(true);
  });

  it("adds a company once when two sources both found it and both are approved together", async () => {
    const twin = { ...gatewaySuggestion, id: "s3", source: "google_places", external_id: "places_1", company_name: "SHREE ELECTRICALS" };
    const supabase = mockApproval([gatewaySuggestion, twin]);

    await expect(approveProspectSuggestionsDetailed(WORKSPACE, ["s1", "s3"])).resolves.toEqual({ added: 1, duplicates: 1 });

    expect(insertedProspects(supabase).map((row) => row.source)).toEqual(["stored"]);
  });

  it("adds the rest of a batch when one of them is a duplicate", async () => {
    const other = { ...gatewaySuggestion, id: "s4", external_id: "businesses_other", company_name: "Volt Works", website: "https://volt.example/" };
    const supabase = mockApproval([gatewaySuggestion, other]);
    h.findDuplicateProspect.mockImplementation(async (_w: string, candidate: { companyName: string }) =>
      candidate.companyName === "Shree Electricals" ? { id: "p-existing", company_name: "Shree Electricals" } : null,
    );

    await expect(approveProspectSuggestionsDetailed(WORKSPACE, ["s1", "s4"])).resolves.toEqual({ added: 1, duplicates: 1 });

    expect(insertedProspects(supabase).map((row) => row.company_name)).toEqual(["Volt Works"]);
    // The research row is linked to the prospect that was actually created.
    const research = writtenRow(supabase.queries("prospect_research")[0]!) as unknown as Record<string, unknown>[];
    expect(research).toHaveLength(1);
    expect(research[0]).toMatchObject({ prospect_id: "p1" });
  });
});

describe("an AI web-search suggestion", () => {
  it("is approved as before, with no second duplicate check, and keeps its source", async () => {
    const supabase = mockApproval([webSearchSuggestion]);

    await expect(approveProspectSuggestions(WORKSPACE, ["s2"])).resolves.toBe(1);

    expect(h.findDuplicateProspect).not.toHaveBeenCalled();
    expect(insertedProspects(supabase)[0]).toMatchObject({
      company_name: "Acme",
      domain: "acme.com",
      kind: "company",
      source: "web_search",
      source_name: "Web search (AI)",
      source_ref: null,
      phone: null,
      field_sources: {},
    });
  });
});

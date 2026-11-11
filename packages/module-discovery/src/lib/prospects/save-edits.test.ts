/**
 * DISC-DATA-P0-04.1: `field_sources` says where a value came from. A value a person
 * typed came from them, so when they change a column a source had filled, that column
 * stops being credited to the source; an unchanged column keeps its credit. Also pins
 * that approval hands back the prospects it created, which is what enrichment is queued
 * for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "../data-sources/__tests__/memory-db";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/events/mutations", () => ({ publish: vi.fn() }));
vi.mock("./party-sync", () => ({
  ensureProspectParty: vi.fn(async () => "party-1"),
  markProspectPartyWon: vi.fn(),
  backfillCustomerContactsForWonProspect: vi.fn(),
}));
vi.mock("./duplicates", () => ({ findDuplicateProspect: vi.fn(async () => null) }));

const { approveProspectSuggestionsDetailed, approveProspectSuggestionsWithProspects, saveProspectEdits } = await import("./mutations");

const wikidata = { provider: "wikidata", name: "Wikidata", url: null, observedAt: "2026-10-30T00:00:00Z" };
const osm = { provider: "stored", name: "OpenStreetMap contributors (ODbL)", url: null, observedAt: null };

function setup(fieldSources: Record<string, unknown>) {
  const db = createMemoryDb({
    prospects: [
      {
        id: "p1",
        workspace_id: "w1",
        company_name: "Acme",
        website: "https://acme.example",
        domain: "acme.example",
        industry: "Software",
        company_size: null,
        location: "Pune, IN",
        description: null,
        linkedin_url: null,
        twitter_url: null,
        company_email: null,
        phone: "+91 20 5550 0100",
        field_sources: fieldSources,
      },
    ],
  });
  h.createClient.mockResolvedValue(db.client);
  return db;
}

const UNCHANGED = { companyName: "Acme", website: "https://acme.example", industry: "Software", location: "Pune, IN" };

beforeEach(() => vi.clearAllMocks());

describe("saveProspectEdits", () => {
  it("stops crediting a source for a column the person changed", async () => {
    const db = setup({ industry: wikidata, location: wikidata, phone: osm });

    await saveProspectEdits("p1", { ...UNCHANGED, industry: "Banking software" });

    const row = db.rows("prospects")[0]!;
    expect(row.industry).toBe("Banking software");
    expect(row.field_sources).toEqual({ location: wikidata, phone: osm });
  });

  it("stops crediting a source for a column the person cleared", async () => {
    const db = setup({ industry: wikidata, location: wikidata });
    await saveProspectEdits("p1", { ...UNCHANGED, location: "" });
    expect(db.rows("prospects")[0]!.field_sources).toEqual({ industry: wikidata });
  });

  it("keeps every credit, and writes nothing more, when no sourced value changed", async () => {
    const db = setup({ industry: wikidata, location: wikidata, phone: osm });

    await saveProspectEdits("p1", { ...UNCHANGED, description: "Typed by the founder" });

    expect(db.rows("prospects")[0]!.field_sources).toEqual({ industry: wikidata, location: wikidata, phone: osm });
    const writes = db.client.queries("prospects").filter((call) => call.ops.some((op) => op.method === "update"));
    expect(writes).toHaveLength(1);
  });

  it("saves the edit for a prospect no source ever filled", async () => {
    const db = setup({});
    await saveProspectEdits("p1", { ...UNCHANGED, industry: "Fintech" });
    expect(db.rows("prospects")[0]).toMatchObject({ industry: "Fintech", field_sources: {} });
  });
});

describe("approval returns the prospects it created", () => {
  function staged() {
    const db = createMemoryDb({
      prospect_suggestions: [
        { id: "s1", workspace_id: "w1", company_name: "Acme", website: "https://acme.example", source: "web_search", kind: "company" },
      ],
      prospects: [],
    });
    h.createClient.mockResolvedValue(db.client);
    return db;
  }

  it("hands back each new prospect, for the caller that queues its enrichment", async () => {
    const db = staged();
    const result = await approveProspectSuggestionsWithProspects("w1", ["s1"]);
    expect(result).toMatchObject({ added: 1, duplicates: 0 });
    expect(result.prospects.map((p) => p.company_name)).toEqual(["Acme"]);
    expect(result.prospects[0]!.id).toBe(db.rows("prospects")[0]!.id);
  });

  it("keeps the counts-only result unchanged for existing callers", async () => {
    staged();
    expect(await approveProspectSuggestionsDetailed("w1", ["s1"])).toEqual({ added: 1, duplicates: 0 });
    expect(await approveProspectSuggestionsWithProspects("w1", [])).toEqual({ added: 0, duplicates: 0, prospects: [] });
  });
});

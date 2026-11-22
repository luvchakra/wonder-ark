/**
 * Pipeline stage and next-action are computed on read (R3), not stored — no AI call, just
 * this join and aggregate. That makes this file the place where "what should I do next"
 * is actually decided, so the tests focus on the derivation: which embedded child row
 * counts as the latest, and how the priority sort (R7) puts prospects that still need an
 * action ahead of ones waiting on the prospect, regardless of score.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient }));

const {
  getProspect,
  listProspectSuggestions,
  getProspectCounts,
  getProspectCountsForWorkspaces,
  listProspectIndustries,
  listProspects,
  listProspectsForWorkspaces,
} = await import("./queries");

const WORKSPACE = "w1";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

/** A prospect row with every embedded child table empty. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    workspace_id: WORKSPACE,
    company_name: "Acme",
    updated_at: "2026-09-01T00:00:00.000Z",
    fit_score: null,
    prospect_research: null,
    prospect_scores: [],
    outreach_strategies: [],
    messages: [],
    conversations: [],
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("listProspects — query shape", () => {
  it("scopes to the workspace and embeds every pipeline child table", async () => {
    const supabase = mock([]);

    await listProspects(WORKSPACE);

    const call = supabase.queries("prospects")[0]!;
    expect(eqFilters(call)).toEqual({ workspace_id: WORKSPACE });
    const select = String(opArgs(call, "select")![0]);
    for (const table of ["prospect_research", "prospect_scores", "outreach_strategies", "messages", "conversations"]) {
      expect(select).toContain(table);
    }
  });

  it("applies status and industry filters in the query", async () => {
    const supabase = mock([]);

    await listProspects(WORKSPACE, { status: "qualified", industry: "Manufacturing" });

    expect(eqFilters(supabase.queries("prospects")[0]!)).toMatchObject({
      status: "qualified",
      industry: "Manufacturing",
    });
  });

  // DISC-PROS-P0-08.1: the Select tab lists those not picked yet; the working lists the picked.
  it("splits picked prospects from those waiting on the Select tab", async () => {
    let supabase = mock([]);
    await listProspects(WORKSPACE, { shortlisted: true });
    expect(opArgs(supabase.queries("prospects")[0]!, "not")).toEqual(["shortlisted_at", "is", null]);

    supabase = mock([]);
    await listProspects(WORKSPACE, { shortlisted: false });
    expect(opArgs(supabase.queries("prospects")[0]!, "is")).toEqual(["shortlisted_at", null]);

    supabase = mock([]);
    await listProspects(WORKSPACE, {});
    expect(opArgs(supabase.queries("prospects")[0]!, "is")).toBeUndefined();
    expect(opArgs(supabase.queries("prospects")[0]!, "not")).toBeUndefined();
  });

  it("applies a search as a case-insensitive contains", async () => {
    const supabase = mock([]);

    await listProspects(WORKSPACE, { search: "acme" });

    expect(opArgs(supabase.queries("prospects")[0]!, "ilike")).toEqual(["company_name", "%acme%"]);
  });

  it("adds no filter clauses when none are given", async () => {
    const supabase = mock([]);

    await listProspects(WORKSPACE);

    expect(eqFilters(supabase.queries("prospects")[0]!)).toEqual({ workspace_id: WORKSPACE });
  });
});

describe("listProspects — pipeline derivation", () => {
  it("derives a stage and next action onto every row", async () => {
    mock([row()]);

    const [prospect] = await listProspects(WORKSPACE);

    expect(prospect).toMatchObject({ id: "p1", stage: expect.any(String) });
    expect(prospect).toHaveProperty("nextAction");
  });

  it("advances the stage once research exists", async () => {
    mock([row({ prospect_research: { researched_at: "2026-09-02T00:00:00.000Z" } })]);

    const [prospect] = await listProspects(WORKSPACE);

    expect(prospect!.stage).toBe("researched");
  });

  it("picks the newest of several appended scores", async () => {
    mock([
      row({
        prospect_research: { researched_at: "2026-09-02T00:00:00.000Z" },
        prospect_scores: [
          { created_at: "2026-09-03T00:00:00.000Z" },
          { created_at: "2026-09-05T00:00:00.000Z" },
        ],
      }),
    ]);

    const [prospect] = await listProspects(WORKSPACE);

    expect(prospect!.stage).toBe("scored");
    expect(prospect!.lastActivityAt).toBe("2026-09-05T00:00:00.000Z");
  });

  it("picks the newest score whichever order the rows arrive in", async () => {
    mock([
      row({
        prospect_research: { researched_at: "2026-09-02T00:00:00.000Z" },
        prospect_scores: [
          { created_at: "2026-09-05T00:00:00.000Z" },
          { created_at: "2026-09-03T00:00:00.000Z" },
        ],
      }),
    ]);

    const [prospect] = await listProspects(WORKSPACE);

    expect(prospect!.lastActivityAt).toBe("2026-09-05T00:00:00.000Z");
  });

  it("takes the latest activity timestamp across every child table", async () => {
    mock([
      row({
        messages: [{ status: "sent", created_at: "2026-09-04T00:00:00.000Z", sent_at: "2026-09-06T00:00:00.000Z" }],
        conversations: [{ status: "awaiting_reply", last_message_at: "2026-09-07T00:00:00.000Z" }],
      }),
    ]);

    const [prospect] = await listProspects(WORKSPACE);

    expect(prospect!.lastActivityAt).toBe("2026-09-07T00:00:00.000Z");
  });

  it("filters by derived stage in application code, since it is not a column", async () => {
    mock([row({ id: "p1" }), row({ id: "p2", prospect_research: { researched_at: "2026-09-02T00:00:00.000Z" } })]);

    const results = await listProspects(WORKSPACE, { stage: "researched" });

    expect(results.map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("listProspects — sorting", () => {
  it("defaults to newest first, done by the database", async () => {
    const supabase = mock([]);

    await listProspects(WORKSPACE);

    expect(opArgs(supabase.queries("prospects")[0]!, "order")).toEqual([
      "created_at",
      { ascending: false },
    ]);
  });

  it("orders by pipeline stage when asked", async () => {
    mock([
      row({ id: "researched", prospect_research: { researched_at: "2026-09-02T00:00:00.000Z" } }),
      row({ id: "new" }),
    ]);

    const results = await listProspects(WORKSPACE, {}, "stage");

    expect(results.map((p) => p.id)).toEqual(["new", "researched"]);
  });

  it("puts prospects needing an action ahead of ones that do not, whatever the score (R7)", async () => {
    mock([
      // Sent and awaiting the prospect: nothing to act on, but a high score.
      row({
        id: "waiting",
        fit_score: 99,
        messages: [{ status: "sent", created_at: "2026-09-04T00:00:00.000Z", sent_at: "2026-09-04T00:00:00.000Z" }],
        conversations: [{ status: "awaiting_reply", last_message_at: "2026-09-04T00:00:00.000Z" }],
      }),
      row({ id: "actionable", fit_score: 10 }),
    ]);

    const results = await listProspects(WORKSPACE, {}, "priority");

    expect(results[0]!.id).toBe("actionable");
  });

  it("orders by fit score within the same action bucket", async () => {
    mock([row({ id: "low", fit_score: 10 }), row({ id: "high", fit_score: 80 })]);

    const results = await listProspects(WORKSPACE, {}, "priority");

    expect(results.map((p) => p.id)).toEqual(["high", "low"]);
  });

  it("sorts an unscored prospect below a scored one", async () => {
    mock([row({ id: "unscored", fit_score: null }), row({ id: "scored", fit_score: 1 })]);

    const results = await listProspects(WORKSPACE, {}, "priority");

    expect(results.map((p) => p.id)).toEqual(["scored", "unscored"]);
  });

  it("reaches the same order whichever way the rows arrive", async () => {
    mock([row({ id: "scored", fit_score: 1 }), row({ id: "unscored", fit_score: null })]);

    const results = await listProspects(WORKSPACE, {}, "priority");

    expect(results.map((p) => p.id)).toEqual(["scored", "unscored"]);
  });

  it("still lifts the actionable prospect when it arrives first", async () => {
    mock([
      row({ id: "actionable", fit_score: 10 }),
      row({
        id: "waiting",
        fit_score: 99,
        messages: [{ status: "sent", created_at: "2026-09-04T00:00:00.000Z", sent_at: "2026-09-04T00:00:00.000Z" }],
        conversations: [{ status: "awaiting_reply", last_message_at: "2026-09-04T00:00:00.000Z" }],
      }),
    ]);

    const results = await listProspects(WORKSPACE, {}, "priority");

    expect(results.map((p) => p.id)).toEqual(["actionable", "waiting"]);
  });
});

describe("listProspectsForWorkspaces", () => {
  it("fetches every workspace's prospects in one call, with the same derivation", async () => {
    const supabase = mock([row()]);

    const results = await listProspectsForWorkspaces(["w1", "w2"]);

    expect(supabase.queries("prospects")).toHaveLength(1);
    expect(opArgs(supabase.queries("prospects")[0]!, "in")).toEqual(["workspace_id", ["w1", "w2"]]);
    expect(results[0]).toHaveProperty("stage");
  });

  it("short-circuits an empty list", async () => {
    const supabase = mock([]);

    await expect(listProspectsForWorkspaces([])).resolves.toEqual([]);
    expect(supabase.queries()).toEqual([]);
  });
});

describe("getProspect", () => {
  it("returns null for a prospect the caller cannot see", async () => {
    mock(null);
    await expect(getProspect("p1")).resolves.toBeNull();
  });
});

describe("listProspectIndustries", () => {
  it("returns distinct industries, sorted, excluding nulls at the query level", async () => {
    const supabase = mock([
      { industry: "Retail" },
      { industry: "Manufacturing" },
      { industry: "Retail" },
    ]);

    await expect(listProspectIndustries(WORKSPACE)).resolves.toEqual(["Manufacturing", "Retail"]);
    expect(opArgs(supabase.queries("prospects")[0]!, "not")).toEqual(["industry", "is", null]);
  });

  it("returns an empty list when the query yields null", async () => {
    mock(null);
    await expect(listProspectIndustries(WORKSPACE)).resolves.toEqual([]);
  });
});

describe("prospect counts", () => {
  it("counts by status without joining the pipeline tables", async () => {
    const supabase = mock([{ status: "new" }, { status: "new" }, { status: "qualified" }]);

    await expect(getProspectCounts(WORKSPACE)).resolves.toEqual({
      total: 3,
      new: 2,
      qualified: 1,
      disqualified: 0,
    });
    expect(String(opArgs(supabase.queries("prospects")[0]!, "select")![0])).toBe("status");
  });

  it("returns zeroes for a workspace with no prospects", async () => {
    mock([]);

    await expect(getProspectCounts(WORKSPACE)).resolves.toEqual({
      total: 0,
      new: 0,
      qualified: 0,
      disqualified: 0,
    });
  });

  it("batches counts across workspaces in one round trip", async () => {
    const supabase = mock([
      { workspace_id: "w1", status: "new" },
      { workspace_id: "w1", status: "qualified" },
      { workspace_id: "w2", status: "disqualified" },
    ]);

    const result = await getProspectCountsForWorkspaces(["w1", "w2"]);

    expect(supabase.queries("prospects")).toHaveLength(1);
    expect(result.w1).toEqual({ total: 2, new: 1, qualified: 1, disqualified: 0 });
    expect(result.w2).toEqual({ total: 1, new: 0, qualified: 0, disqualified: 1 });
  });

  it("omits a workspace with no prospects rather than inventing zeroes", async () => {
    mock([{ workspace_id: "w1", status: "new" }]);

    const result = await getProspectCountsForWorkspaces(["w1", "w2"]);

    expect(Object.keys(result)).toEqual(["w1"]);
  });

  it("short-circuits an empty list", async () => {
    const supabase = mock([]);

    await expect(getProspectCountsForWorkspaces([])).resolves.toEqual({});
    expect(supabase.queries()).toEqual([]);
  });
});

describe("failure propagation", () => {
  it.each([
    ["listProspects", () => listProspects(WORKSPACE)],
    ["listProspectsForWorkspaces", () => listProspectsForWorkspaces(["w1"])],
    ["getProspect", () => getProspect("p1")],
    ["listProspectIndustries", () => listProspectIndustries(WORKSPACE)],
    ["getProspectCounts", () => getProspectCounts(WORKSPACE)],
    ["getProspectCountsForWorkspaces", () => getProspectCountsForWorkspaces(["w1"])],
  ])("%s propagates", async (_label, run) => {
    mock(null, new Error("denied"));
    await expect(run()).rejects.toThrow("denied");
  });
});

describe("listProspectSuggestions", () => {
  it("returns the workspace's staged suggestions, newest first", async () => {
    const supabase = mock([{ id: "s1", company_name: "Acme" }]);

    await expect(listProspectSuggestions(WORKSPACE)).resolves.toEqual([
      { id: "s1", company_name: "Acme" },
    ]);

    const call = supabase.queries("prospect_suggestions")[0]!;
    expect(eqFilters(call)).toEqual({ workspace_id: WORKSPACE });
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: false }]);
  });

  it("propagates a failure rather than showing an empty review queue", async () => {
    mock(null, new Error("select failed"));

    await expect(listProspectSuggestions(WORKSPACE)).rejects.toThrow("select failed");
  });
});

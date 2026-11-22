/** DISC-AUTO-P0-02.1: the first search uses only what the person approved. */
import { describe, expect, it, vi } from "vitest";

vi.mock("./find", () => ({ runFind: vi.fn() }));
vi.mock("./index", () => ({ listDataSources: vi.fn() }));
vi.mock("./saved-searches", () => ({ saveWeeklySearch: vi.fn() }));

const { defaultSource, firstSearchQuery, runFirstSearch } = await import("./first-search");
const { runFind } = await import("./find");
const { listDataSources } = await import("./index");
const { saveWeeklySearch } = await import("./saved-searches");

const icp = { status: "approved" as const, industries: ["Bakeries", "Cafes"], geographies: ["Pune", "Mumbai"], audience: null };
const source = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, action: "search", origin: "gateway", kinds: ["business"], status: "active", paid: false, ...extra });

describe("firstSearchQuery", () => {
  it("searches the approved industries and places for companies", () => {
    expect(firstSearchQuery(icp, "business")).toEqual({ target: "companies", what: "Bakeries, Cafes", where: "Pune; Mumbai" });
  });
  it("searches the Ideal user's interests for channels, for an offering sold to consumers", () => {
    const audience = { ideal_user: { interests: ["home organising"], online_places: ["Instagram"], offline_places: [] } };
    expect(firstSearchQuery({ ...icp, audience } as never, "consumer").target).toBe("channels");
  });
});

describe("defaultSource", () => {
  it("prefers a free WorksLake search over a paid one and skips inactive ones", () => {
    const picked = defaultSource([source("paid", { paid: true }), source("off", { status: "needs_setup" }), source("free")] as never, "companies");
    expect(picked?.id).toBe("free");
  });
});

describe("runFirstSearch", () => {
  it("doesn't search, and says why, when the ideal customer names nothing to search for", async () => {
    const result = await runFirstSearch("w1", { ...icp, industries: [] }, "business");
    expect(result).toMatchObject({ status: "not_run" });
    expect(runFind).not.toHaveBeenCalled();
  });

  it("runs the search, saves it weekly when it may be, and reports what was added", async () => {
    vi.mocked(listDataSources).mockResolvedValue({ sources: [source("free")] } as never);
    vi.mocked(runFind).mockResolvedValue({ status: "completed", added: 5, sourceLabel: "WorksLake", weekly: { sourceId: "free", what: "Bakeries, Cafes", where: "Pune; Mumbai" } } as never);
    vi.mocked(saveWeeklySearch).mockResolvedValue({ status: "saved" });
    expect(await runFirstSearch("w1", icp, "business")).toEqual({ status: "searched", added: 5, sourceLabel: "WorksLake", weekly: true });
    expect(saveWeeklySearch).toHaveBeenCalledWith("w1", expect.objectContaining({ sourceId: "free" }), { replace: false });
  });

  it("reports a failed search as not run, in the search's own words", async () => {
    vi.mocked(listDataSources).mockResolvedValue({ sources: [source("free")] } as never);
    vi.mocked(runFind).mockResolvedValue({ status: "failed", reason: "unavailable", message: "WorksLake: Unavailable." });
    expect(await runFirstSearch("w1", icp, "business")).toEqual({ status: "not_run", message: "WorksLake: Unavailable." });
  });
});

/**
 * DISC-DATA-P0-04.1: the drain's side of "enrich on approval". The handler runs with no
 * signed-in user, so what matters is what it passes on (the service-role client, the
 * event's business, free sources only) and which outcomes make the drain retry.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainEvent } from "@cofounderai/core/events/types";

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => Promise<void>>(),
  enrichProspect: vi.fn(),
  runSavedSearch: vi.fn(),
  adminClient: { admin: true },
}));

vi.mock("@cofounderai/core/events/registry", () => ({
  registerEventHandler: (type: string, handler: (event: unknown) => Promise<void>) => h.handlers.set(type, handler),
}));
vi.mock("../db/admin", () => ({ createAdminClient: () => h.adminClient }));
vi.mock("../lib/data-sources/enrichment", () => ({
  ENRICHMENT_REQUESTED_EVENT: "discovery.prospect.enrichment_requested",
  enrichProspect: h.enrichProspect,
}));

vi.mock("../lib/data-sources/saved-searches", () => ({
  SAVED_SEARCH_RUN_REQUESTED_EVENT: "discovery.saved_search.run_requested",
  runSavedSearch: h.runSavedSearch,
}));

const { UsageLimitExceededError } = await import("../lib/usage/limits");
await import("./handlers");

const handle = (payload: Record<string, unknown>) =>
  h.handlers.get("discovery.prospect.enrichment_requested")!({
    id: "e1",
    business_id: "b1",
    type: "discovery.prospect.enrichment_requested",
    payload,
  } as unknown as DomainEvent);

beforeEach(() => {
  vi.clearAllMocks();
  h.enrichProspect.mockResolvedValue({ status: "completed", filled: [], unitsSpent: 0, paidRemaining: 50, providerIssues: [] });
});

describe("discovery.prospect.enrichment_requested", () => {
  it("runs the free lookup for the event's business, with the service role", async () => {
    await handle({ prospectId: "p1" });
    expect(h.enrichProspect).toHaveBeenCalledWith("p1", { allowPaid: false, client: h.adminClient, businessId: "b1" });
  });

  it("ignores an event that names no prospect", async () => {
    await handle({});
    await handle({ prospectId: 42 });
    expect(h.enrichProspect).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "quota"])("throws so the drain retries when the lookup was %s", async (reason) => {
    h.enrichProspect.mockResolvedValue({ status: "failed", reason, message: "x" });
    await expect(handle({ prospectId: "p1" })).rejects.toThrow(reason);
  });

  it.each([
    { status: "failed", reason: "needs_setup", message: "x" },
    { status: "failed", reason: "not_found", message: "x" },
    { status: "nothing_to_fill" },
    { status: "already_done" },
  ])("finishes without a retry for $status $reason", async (outcome) => {
    h.enrichProspect.mockResolvedValue(outcome);
    await expect(handle({ prospectId: "p1" })).resolves.toBeUndefined();
  });

  it("finishes without a retry when the month's run allowance is used up", async () => {
    h.enrichProspect.mockRejectedValue(new UsageLimitExceededError("runs"));
    await expect(handle({ prospectId: "p1" })).resolves.toBeUndefined();
  });

  it("lets any other error through, so the drain retries it", async () => {
    h.enrichProspect.mockRejectedValue(new Error("database is down"));
    await expect(handle({ prospectId: "p1" })).rejects.toThrow("database is down");
  });
});

describe("discovery.saved_search.run_requested (DISC-DATA-P0-05.1)", () => {
  const run = (payload: Record<string, unknown>) =>
    h.handlers.get("discovery.saved_search.run_requested")!({
      id: "e2",
      business_id: "b1",
      type: "discovery.saved_search.run_requested",
      payload,
    } as unknown as DomainEvent);

  it("runs the saved search for the event's business and its due date", async () => {
    h.runSavedSearch.mockResolvedValue({ status: "ran", result: { status: "completed", found: 2, added: 1 } });
    await run({ savedSearchId: "ss1", dueAt: "2026-11-12T05:00:00.000Z" });
    expect(h.runSavedSearch).toHaveBeenCalledWith("ss1", "2026-11-12T05:00:00.000Z", "b1");
  });

  it("finishes without a retry when the search failed or was skipped", async () => {
    h.runSavedSearch.mockResolvedValue({ status: "ran", result: { status: "failed", message: "Unavailable" } });
    await expect(run({ savedSearchId: "ss1", dueAt: "d" })).resolves.toBeUndefined();
    h.runSavedSearch.mockResolvedValue({ status: "skipped", reason: "paused" });
    await expect(run({ savedSearchId: "ss1", dueAt: "d" })).resolves.toBeUndefined();
  });

  it("ignores an event that does not name a search and a due date", async () => {
    await run({});
    await run({ savedSearchId: "ss1" });
    await run({ savedSearchId: 7, dueAt: "d" });
    expect(h.runSavedSearch).not.toHaveBeenCalled();
  });

  it("lets a database error through, so the drain retries it", async () => {
    h.runSavedSearch.mockRejectedValue(new Error("database is down"));
    await expect(run({ savedSearchId: "ss1", dueAt: "d" })).rejects.toThrow("database is down");
  });
});

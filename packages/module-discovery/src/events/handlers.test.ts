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

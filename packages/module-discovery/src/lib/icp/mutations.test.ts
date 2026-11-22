/**
 * DISC-OFFER-P0-12.4: a person can edit the Evidence the AI wrote for an Ideal customer
 * profile. What they save is kept; a caller that does not send it clears it as before.
 * The AI's confidence score always goes on a person's edit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[] }));

const CURRENT = {
  id: "icp-1",
  workspace_id: "w1",
  version: 0,
  name: "Old",
  confidence: 0.85,
  evidence: ["AI evidence"],
  audience: null,
};

vi.mock("../../db/server", () => ({
  createClient: async () => ({
    from: () => {
      let payload: Record<string, unknown> | null = null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        insert: async () => ({ error: null }),
        update: (row: Record<string, unknown>) => {
          payload = row;
          h.updates.push(row);
          return chain;
        },
        single: async () => ({ data: payload ? { ...CURRENT, ...payload } : CURRENT, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  }),
}));

const { updateIcpProfile } = await import("./mutations");

const base = {
  name: "Overwhelmed household manager",
  description: "",
  industries: [],
  companySizes: [],
  geographies: [],
  roles: [],
  painPoints: [],
  buyingSignals: [],
  exclusions: [],
  revenue: [],
  businessModel: [],
  technology: [],
  growthStage: [],
  existingTools: [],
};

beforeEach(() => {
  h.updates.length = 0;
});

describe("updateIcpProfile and Evidence", () => {
  it("saves the Evidence the person edited", async () => {
    await updateIcpProfile("icp-1", { ...base, evidence: ["Parents carry the mental load", "My own note"] });
    expect(h.updates[0]).toMatchObject({ evidence: ["Parents carry the mental load", "My own note"], confidence: null, status: "draft" });
  });

  it("keeps an empty list when the person cleared it", async () => {
    await updateIcpProfile("icp-1", { ...base, evidence: [] });
    expect(h.updates[0]).toMatchObject({ evidence: [] });
  });

  it("clears it when the caller does not edit it, as before", async () => {
    await updateIcpProfile("icp-1", base);
    expect(h.updates[0]).toMatchObject({ evidence: [], confidence: null });
  });
});

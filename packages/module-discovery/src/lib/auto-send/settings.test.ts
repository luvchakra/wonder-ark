/** DISC-AUTO-P0-03.1: the setting fails closed. */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));
vi.mock("@cofounderai/core/db/server", () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => h.result }) }) }) }),
}));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: vi.fn() }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn() }));

const { getAutoSend } = await import("./settings");

describe("getAutoSend", () => {
  it("is on only when the business turned it on", async () => {
    h.result = { data: { discovery_auto_send: true }, error: null };
    expect(await getAutoSend("b1")).toBe(true);
    h.result = { data: { discovery_auto_send: false }, error: null };
    expect(await getAutoSend("b1")).toBe(false);
  });

  it("is off when there is no setting or it can't be read", async () => {
    h.result = { data: null, error: null };
    expect(await getAutoSend("b1")).toBe(false);
    h.result = { data: null, error: { message: "permission denied" } };
    expect(await getAutoSend("b1")).toBe(false);
  });
});

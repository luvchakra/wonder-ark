/**
 * DISC-CONS-P0-03.5/04.1: what a person does from an email, with no session. Their
 * private token reaches only their own record; unsubscribing is recorded on the person
 * and on the business's opt-out list; answers are stored once, as append-only feedback.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, usedOp, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({ recordUnsubscribe: vi.fn(), businessForWorkspace: vi.fn(), coreRpc: vi.fn() }));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ recordUnsubscribe: h.recordUnsubscribe }));
vi.mock("@cofounderai/core/privacy/unsubscribe-token", () => ({ emailHash: (email: string) => `hash(${email})` }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: () => ({ rpc: h.coreRpc }) }));
vi.mock("../../db/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./send", () => ({ businessForWorkspace: h.businessForWorkspace }));

const { getSurvey, submitSurveyAnswers, unsubscribeLead } = await import("./public");

const TOKEN = "d".repeat(48);
const LEAD = { id: "lead-1", workspace_id: "w1", email: "asha@example.com", status: "new", survey: { questions: ["What do you use today?"], sent_at: "2026-11-12" } };

function db(lead: unknown = LEAD, opts: { claimed?: boolean; allowed?: boolean } = {}) {
  return createFakeSupabase({
    rpc: () => ({ data: opts.allowed ?? true, error: null }),
    query: (call: RecordedQuery) => {
      if (call.table === "audience_leads" && usedOp(call, "update")) return { data: opts.claimed === false ? null : { id: "lead-1" }, error: null };
      if (call.table === "audience_leads") return { data: lead, error: null };
      return { data: null, error: null };
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.businessForWorkspace.mockResolvedValue({ businessId: "b1", businessName: "Tidy Co", offeringName: "Tidy Kit", website: null });
  h.coreRpc.mockResolvedValue({ error: null });
});

describe("unsubscribeLead", () => {
  it("marks the person unsubscribed and adds the address to the business's opt-out list", async () => {
    const client = db();
    await expect(unsubscribeLead(TOKEN, client as never)).resolves.toBe(true);
    const update = client.queries("audience_leads").find((c) => usedOp(c, "update"))!;
    expect(opArgs(update, "update")![0]).toEqual({ status: "unsubscribed", survey: null });
    expect(h.recordUnsubscribe).toHaveBeenCalledWith("b1", "hash(asha@example.com)");
  });

  it("is a no-op for someone already unsubscribed, and false for an unknown or malformed link", async () => {
    const client = db({ ...LEAD, status: "unsubscribed" });
    await expect(unsubscribeLead(TOKEN, client as never)).resolves.toBe(true);
    expect(client.queries("audience_leads").some((c) => usedOp(c, "update"))).toBe(false);
    await expect(unsubscribeLead(TOKEN, db(null) as never)).resolves.toBe(false);
    await expect(unsubscribeLead("../x", db() as never)).resolves.toBe(false);
  });
});

describe("answering questions", () => {
  it("shows the waiting questions, and nothing for an unsubscribed person", async () => {
    await expect(getSurvey(TOKEN, db() as never)).resolves.toMatchObject({ questions: ["What do you use today?"] });
    await expect(getSurvey(TOKEN, db({ ...LEAD, status: "unsubscribed" }) as never)).resolves.toBeNull();
  });

  it("stores the answers once, as a survey entry, only for the questions asked", async () => {
    const client = db();
    await expect(submitSurveyAnswers(TOKEN, (i) => (i === 0 ? "Paper lists" : "ignored"), client as never)).resolves.toEqual({ status: "saved" });
    const insert = client.queries("audience_feedback").find((c) => usedOp(c, "insert"))!;
    expect(opArgs(insert, "insert")![0]).toEqual({ workspace_id: "w1", lead_id: "lead-1", kind: "survey", body: "What do you use today?\nPaper lists" });
  });

  it("stores nothing for a second submit that lost the claim", async () => {
    const client = db(LEAD, { claimed: false });
    await expect(submitSurveyAnswers(TOKEN, () => "x", client as never)).resolves.toEqual({ status: "unavailable" });
    expect(client.queries("audience_feedback")).toEqual([]);
  });

  it("is rate limited, and refuses empty answers", async () => {
    await expect(submitSurveyAnswers(TOKEN, () => "x", db(LEAD, { allowed: false }) as never)).resolves.toEqual({ status: "rate_limited" });
    await expect(submitSurveyAnswers(TOKEN, () => " ", db() as never)).resolves.toEqual({ status: "empty" });
  });
});

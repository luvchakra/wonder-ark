/**
 * FND-01/06/09/11/12/13. The Funding write layer's own guarantees, independent of the UI:
 * licence then permission before anything is touched; outward actions need
 * funding.approve; stage changes go through the atomic function with a stale-state
 * guard; outreach is sent once, only when approved, and recorded as the provider
 * reported it; shares store only a token hash; and "Ready"/"Accepted" record who decided.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, writtenRow, type FakeSupabase, type RecordedCall } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  createCoreClient: vi.fn(),
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLog: vi.fn(),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  requireUser: vi.fn(),
  getBusiness: vi.fn(),
  deliver: vi.fn(),
  order: [] as string[],
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: h.writeAuditLog }));
vi.mock("@cofounderai/core/attachments/mutations", () => ({ uploadAttachment: h.uploadAttachment, deleteAttachment: h.deleteAttachment }));
vi.mock("../tenancy/queries", () => ({ requireUser: h.requireUser, getBusiness: h.getBusiness }));
vi.mock("./outreach-send", () => ({ deliverInvestorEmail: h.deliver }));

const m = await import("./mutations");
const { hashShareToken } = await import("./files");

const BUSINESS = "11111111-1111-4111-8111-111111111111";
let fake: FakeSupabase;
let core: FakeSupabase;

type Responder = (call: RecordedCall) => { data: unknown; error: unknown };

function useFake(discovery: Responder, coreResponder: Responder = () => ({ data: null, error: null })) {
  fake = createFakeSupabase({
    query: (call) => {
      h.order.push(`query:${call.table}`);
      return discovery(call);
    },
    rpc: (call) => {
      h.order.push(`rpc:${call.fn}`);
      return discovery(call);
    },
  });
  core = createFakeSupabase({ query: coreResponder });
  h.createClient.mockResolvedValue(fake);
  h.createCoreClient.mockResolvedValue(core);
}

const isUpdate = (c: RecordedCall) => c.kind === "query" && c.ops.some((o) => o.method === "update");
const isInsert = (c: RecordedCall) => c.kind === "query" && c.ops.some((o) => o.method === "insert");

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  h.requireModule.mockImplementation(async () => void h.order.push("requireModule"));
  h.requirePermission.mockImplementation(async (_b: string, key: string) => void h.order.push(`perm:${key}`));
  h.requireUser.mockResolvedValue({ id: "user-1" });
  h.writeAuditLog.mockResolvedValue("audit-1");
  h.getBusiness.mockResolvedValue({ name: "Acme", website: null });
});

describe("licence and permission come first", () => {
  it("writes nothing when the licence check refuses", async () => {
    useFake(() => ({ data: { id: "r1" }, error: null }));
    h.requireModule.mockRejectedValueOnce(new Error("Discovery isn't licensed"));
    await expect(m.createDiligenceItem(BUSINESS, { request: "Cap table", requester: null, investorId: null, roundId: null, dueAt: null })).rejects.toThrow(
      /licensed/,
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("checks licence, then funding.manage, then writes", async () => {
    useFake(() => ({ data: { id: "r1" }, error: null }));
    await m.createDiligenceItem(BUSINESS, { request: "Cap table", requester: null, investorId: null, roundId: null, dueAt: null });
    expect(h.order.slice(0, 3)).toEqual(["requireModule", "perm:funding.manage", "query:due_diligence_items"]);
  });
});

describe("moveInvestorStage", () => {
  it("refuses an illegal move before touching the pipeline", async () => {
    useFake(() => ({ data: { stage: "invested", committed_amount: 1, invested_amount: 1, currency: "INR" }, error: null }));
    await expect(m.moveInvestorStage(BUSINESS, "p1", "meeting")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(fake.rpcs()).toHaveLength(0);
  });

  it("records the commitment guarded on the stage it read, then moves through the atomic function", async () => {
    useFake((call) => {
      if (call.kind === "rpc") return { data: null, error: null };
      if (isUpdate(call)) return { data: [{ id: "p1" }], error: null };
      return { data: { stage: "term_discussion", committed_amount: null, invested_amount: null, currency: null }, error: null };
    });
    await m.moveInvestorStage(BUSINESS, "p1", "committed", { committedAmount: 500000, currency: "INR" });

    const update = fake.queries("investor_pipeline").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(update)).toMatchObject({ committed_amount: 500000, currency: "INR" });
    expect(eqFilters(update)).toMatchObject({ business_id: BUSINESS, id: "p1", stage: "term_discussion" });
    expect(fake.rpcs("move_investor_stage")[0]!.args).toMatchObject({ p_pipeline_id: "p1", p_from: "term_discussion", p_to: "committed" });
  });

  it("turns the function's stale-stage refusal into a conflict", async () => {
    useFake((call) => {
      if (call.kind === "rpc") return { data: null, error: { message: "STAGE_CONFLICT" } };
      return { data: { stage: "contacted", committed_amount: null, invested_amount: null, currency: null }, error: null };
    });
    await expect(m.moveInvestorStage(BUSINESS, "p1", "meeting")).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("outreach", () => {
  it("needs funding.approve to approve, and records the approver", async () => {
    useFake((call) => (isUpdate(call) ? { data: [{ id: "o1" }], error: null } : { data: { status: "awaiting_approval" }, error: null }));
    await m.transitionOutreach(BUSINESS, "o1", "approved");
    expect(h.requirePermission).toHaveBeenCalledWith(BUSINESS, "funding.approve");
    const update = fake.queries("investor_outreach").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "approved", approved_by: "user-1" });
  });

  it("will not send a draft that is not approved, and never calls the provider", async () => {
    useFake(() => ({ data: { status: "draft", approved_at: null }, error: null }));
    await expect(m.sendApprovedOutreach(BUSINESS, "o1")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(h.deliver).not.toHaveBeenCalled();
  });

  const approvedDraft = {
    status: "approved",
    approved_at: "2026-09-25T00:00:00Z",
    investor_id: "i1",
    contact_id: "c1",
    round_id: null,
    subject: "Intro",
    body: "Hello",
  };

  it("claims the draft before sending, so a second click cannot deliver it again", async () => {
    useFake((call) => (isUpdate(call) ? { data: [], error: null } : { data: approvedDraft, error: null }), () => ({ data: { email: "p@fund.vc" }, error: null }));
    await expect(m.sendApprovedOutreach(BUSINESS, "o1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.deliver).not.toHaveBeenCalled();
  });

  it("records sent only with the provider's message id, and logs the email", async () => {
    useFake(
      (call) => {
        if (isUpdate(call)) return { data: [{ id: "o1" }], error: null };
        if (isInsert(call)) return { data: { id: "int-1" }, error: null };
        return { data: approvedDraft, error: null };
      },
      () => ({ data: { email: "p@fund.vc" }, error: null }),
    );
    h.deliver.mockResolvedValue({ ok: true, provider: "smtp", messageId: "msg_123" });

    await expect(m.sendApprovedOutreach(BUSINESS, "o1")).resolves.toEqual({ ok: true });
    expect(h.deliver).toHaveBeenCalledWith(expect.objectContaining({ to: "p@fund.vc", subject: "Intro" }));
    const updates = fake.queries("investor_outreach").filter((q) => q.ops.some((o) => o.method === "update"));
    expect(writtenRow(updates[0]!)).toMatchObject({ status: "sending" });
    expect(eqFilters(updates[0]!)).toMatchObject({ status: "approved" });
    expect(writtenRow(updates[1]!)).toMatchObject({ status: "sent", provider_message_id: "msg_123" });
    expect(fake.queries("investor_interactions")).toHaveLength(1);
  });

  it("records a provider failure as failed, with its reason, and reports it", async () => {
    useFake((call) => (isUpdate(call) ? { data: [{ id: "o1" }], error: null } : { data: approvedDraft, error: null }), () => ({ data: { email: "p@fund.vc" }, error: null }));
    h.deliver.mockResolvedValue({ ok: false, provider: "smtp", reason: "The mail server refused the sign-in." });

    await expect(m.sendApprovedOutreach(BUSINESS, "o1")).resolves.toEqual({ ok: false, reason: "The mail server refused the sign-in." });
    const updates = fake.queries("investor_outreach").filter((q) => q.ops.some((o) => o.method === "update"));
    expect(writtenRow(updates[1]!)).toMatchObject({ status: "failed", failure_reason: "The mail server refused the sign-in." });
    expect(fake.queries("investor_interactions")).toHaveLength(0);
  });

  it("refuses to send without a recipient address", async () => {
    useFake((call) => (call.kind === "query" && call.table === "investors" ? { data: { party_id: "pt1" }, error: null } : { data: approvedDraft, error: null }));
    await expect(m.sendApprovedOutreach(BUSINESS, "o1")).rejects.toMatchObject({ code: "NO_RECIPIENT" });
    expect(h.deliver).not.toHaveBeenCalled();
  });
});

describe("shareDataRoomItem", () => {
  it("needs funding.approve and only shares documents marked ready", async () => {
    useFake(() => ({ data: { status: "draft", attachment_id: "a1", is_current: true }, error: null }));
    await expect(
      m.shareDataRoomItem(BUSINESS, "d1", { investorId: null, recipientEmail: "p@fund.vc", permission: "view", days: 14 }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(h.requirePermission).toHaveBeenCalledWith(BUSINESS, "funding.approve");
  });

  it("stores the token's hash, never the token, with an expiry", async () => {
    useFake((call) => (isInsert(call) ? { data: { id: "s1" }, error: null } : { data: { status: "ready", attachment_id: "a1", is_current: true }, error: null }));
    const token = await m.shareDataRoomItem(BUSINESS, "d1", { investorId: null, recipientEmail: "p@fund.vc", permission: "view", days: 7 });
    const insert = fake.queries("data_room_shares")[0]!;
    const row = writtenRow(insert) as Record<string, unknown>;
    expect(row.token_hash).toBe(hashShareToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(new Date(row.expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("uploadDataRoomFile", () => {
  it("refuses a disguised file before uploading", async () => {
    useFake(() => ({ data: null, error: null }));
    const file = new File(["<html>"], "deck.pdf", { type: "text/html" });
    await expect(m.uploadDataRoomFile(BUSINESS, file, { itemId: "d1" })).rejects.toMatchObject({ code: "FILE_INVALID" });
    expect(h.uploadAttachment).not.toHaveBeenCalled();
  });

  it("creates a new version instead of overwriting a document that has a file", async () => {
    useFake((call) =>
      isInsert(call) || isUpdate(call)
        ? { data: null, error: null }
        : {
            data: {
              id: "d1",
              name: "Deck",
              category: "fundraising",
              round_id: null,
              description: null,
              sensitivity: "confidential",
              expires_at: null,
              attachment_id: "old-att",
              version: 2,
              is_current: true,
            },
            error: null,
          },
    );
    h.uploadAttachment.mockResolvedValue({ id: "new-att" });
    const file = new File(["%PDF"], "deck.pdf", { type: "application/pdf" });
    await m.uploadDataRoomFile(BUSINESS, file, { itemId: "d1" });
    const insert = fake.queries("data_room_items").find((q) => q.ops.some((o) => o.method === "insert"))!;
    expect(writtenRow(insert)).toMatchObject({ version: 3, supersedes_id: "d1", attachment_id: "new-att", status: "draft" });
    const retire = fake.queries("data_room_items").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(retire)).toEqual({ is_current: false });
    expect(h.deleteAttachment).not.toHaveBeenCalled();
  });
});

describe("decisions record who made them", () => {
  it("marking readiness Ready records the person", async () => {
    useFake(() => ({ data: [{ id: "r1" }], error: null }));
    await m.setReadinessStatus(BUSINESS, "r1", "ready");
    expect(writtenRow(fake.queries("funding_readiness_items")[0]!)).toMatchObject({ status: "ready", marked_ready_by: "user-1" });
  });

  it("accepting diligence needs funding.approve and records the decider", async () => {
    useFake((call) => (isUpdate(call) ? { data: [{ id: "d1" }], error: null } : { data: { status: "submitted", response: "See room" }, error: null }));
    await m.transitionDiligence(BUSINESS, "d1", "accepted");
    expect(h.requirePermission).toHaveBeenCalledWith(BUSINESS, "funding.approve");
    const update = fake.queries("due_diligence_items").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "accepted", decided_by: "user-1" });
  });
});

describe("createInvestor", () => {
  it("creates the firm as a core party with the investor role, and removes it if the investor row fails", async () => {
    useFake(() => ({ data: null, error: { message: "insert failed" } }), (call) => {
      if (call.kind === "query" && call.table === "parties" && call.ops.some((o) => o.method === "insert")) return { data: { id: "pt1" }, error: null };
      return { data: null, error: null };
    });
    await expect(
      m.createInvestor(BUSINESS, {
        name: "Acme Ventures",
        email: null,
        investorType: "vc",
        website: null,
        geographies: [],
        stages: [],
        sectors: [],
        checkMin: null,
        checkMax: null,
        currency: null,
        source: "referral",
        sourceNote: null,
        notes: null,
      }),
    ).rejects.toBeTruthy();
    expect(writtenRow(core.queries("party_roles")[0]!)).toMatchObject({ role: "investor", party_id: "pt1" });
    expect(core.queries("parties").some((q) => q.ops.some((o) => o.method === "delete"))).toBe(true);
  });
});

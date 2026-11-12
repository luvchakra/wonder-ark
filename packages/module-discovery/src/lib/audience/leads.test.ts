/**
 * DISC-CONS-P0-03.6/03.7/04.1/05.2: what a member does with a person. Pinned: an import
 * needs the consent confirmation and stores it; a person who unsubscribed or never
 * consented cannot be sent questions or an email; a conversation is appended, never
 * edited; first contact links the person to core.parties as a 'person' with role 'lead'.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, usedOp, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  adminClient: vi.fn(),
  requireModule: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
  createParty: vi.fn(),
  addPartyRole: vi.fn(),
  sendLeadEmail: vi.fn(),
  businessForWorkspace: vi.fn(),
}));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../../db/admin", () => ({ createAdminClient: h.adminClient }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/parties/mutations", () => ({ createParty: h.createParty, addPartyRole: h.addPartyRole }));
vi.mock("../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));
vi.mock("./send", () => ({
  sendLeadEmail: h.sendLeadEmail,
  businessForWorkspace: h.businessForWorkspace,
  answerUrlFor: (t: string) => `https://app.example/p/s/${t}`,
}));

const { importPeople, logConversation, messageLead, sendQuestions } = await import("./leads");

const LEAD = {
  id: "lead-1", workspace_id: "w1", email: "asha@example.com", name: "Asha", answers: {}, consent_text: "ok", consent_at: "2026-11-12",
  source: "waitlist", referrer_lead_id: null, utm: {}, status: "new", party_id: null, tags: [], referral_code: "0123456789abcdef",
  confirmation_sent_at: null, survey: null, created_at: "2026-11-12",
};

function mockDb(lead: unknown = LEAD, existingEmails: string[] = []) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (call.table === "audience_leads" && usedOp(call, "update")) return { data: { id: "lead-1" }, error: null };
      if (call.table === "audience_leads" && usedOp(call, "insert")) return { data: null, error: null };
      if (call.table === "audience_leads" && opArgs(call, "select")?.[0] === "email") return { data: existingEmails.map((email) => ({ email })), error: null };
      if (call.table === "audience_leads") return { data: lead, error: null };
      return { data: null, error: null };
    },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getBusinessIdForWorkspace.mockResolvedValue("b1");
  h.requireModule.mockResolvedValue(undefined);
  h.createParty.mockResolvedValue({ id: "party-1" });
  h.sendLeadEmail.mockResolvedValue({ status: "sent" });
  h.businessForWorkspace.mockResolvedValue({ businessId: "b1", businessName: "Tidy Co", offeringName: "Tidy Kit", website: null });
  h.adminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: { lead_token: "c".repeat(48) }, error: null }) }));
});

describe("importPeople", () => {
  it("is refused without the consent confirmation, before anything is read", async () => {
    const db = mockDb();
    await expect(importPeople("w1", [{ email: "a@example.com", name: null, tags: null }], false)).rejects.toThrow(/agreed to hear from me/);
    expect(db.calls).toEqual([]);
  });

  it("stores the confirmation as each person's consent, and skips duplicates and invalid addresses", async () => {
    const db = mockDb(LEAD, ["old@example.com"]);
    const outcome = await importPeople(
      "w1",
      [
        { email: "New@Example.com", name: "New", tags: "a, b" },
        { email: "new@example.com", name: "Twice", tags: null },
        { email: "old@example.com", name: null, tags: null },
        { email: "nope", name: null, tags: null },
      ],
      true,
    );
    expect(outcome).toEqual({ added: 1, duplicates: 2, invalid: 1 });
    const insert = db.queries("audience_leads").find((c) => usedOp(c, "insert"))!;
    expect(opArgs(insert, "insert")![0]).toEqual([
      expect.objectContaining({ email: "new@example.com", source: "import", consent_text: "These people agreed to hear from me.", consent_at: expect.any(String), tags: ["a", "b"] }),
    ]);
    expect(h.sendLeadEmail).not.toHaveBeenCalled();
  });

  it("requires the Discovery licence", async () => {
    mockDb();
    h.requireModule.mockRejectedValue(new Error("not licensed"));
    await expect(importPeople("w1", [], true)).rejects.toThrow("not licensed");
  });
});

describe("sending to a person (DISC-CONS-P0-05.2)", () => {
  it("refuses questions and email to someone who unsubscribed, writing and sending nothing", async () => {
    const db = mockDb({ ...LEAD, status: "unsubscribed" });
    await expect(sendQuestions("lead-1", ["Why?"])).resolves.toMatchObject({ status: "failed", message: expect.stringMatching(/unsubscribed/) });
    await expect(messageLead("lead-1", { subject: "Hi", body: "Hello" })).resolves.toMatchObject({ status: "failed" });
    expect(h.sendLeadEmail).not.toHaveBeenCalled();
    expect(db.queries("audience_leads").some((c) => usedOp(c, "update"))).toBe(false);
  });

  it("refuses someone added without consent", async () => {
    mockDb({ ...LEAD, source: "manual", consent_at: null });
    await expect(messageLead("lead-1", { subject: "Hi", body: "Hello" })).resolves.toMatchObject({ status: "failed", message: expect.stringMatching(/hasn't agreed/) });
    expect(h.sendLeadEmail).not.toHaveBeenCalled();
  });

  it("sends questions with a link to answer them, and links the person to a party on first contact", async () => {
    const db = mockDb();
    await expect(sendQuestions("lead-1", ["What do you use today?"])).resolves.toEqual({ status: "completed", message: "Questions sent." });
    const sent = h.sendLeadEmail.mock.calls[0]![0];
    expect(sent.body).toContain(`https://app.example/p/s/${"c".repeat(48)}`);
    expect(sent.idempotencyKey).toMatch(/^audience-survey\/lead-1\//);
    expect(h.createParty).toHaveBeenCalledWith({ businessId: "b1", kind: "person", name: "Asha", email: "asha@example.com" });
    expect(h.addPartyRole).toHaveBeenCalledWith("b1", "party-1", "lead");
    const kept = db.queries("audience_leads").find((c) => usedOp(c, "update"))!;
    expect(opArgs(kept, "update")![0]).toMatchObject({ survey: { questions: ["What do you use today?"] }, status: "contacted" });
  });

  it("clears the questions again when the email is refused", async () => {
    h.sendLeadEmail.mockResolvedValue({ status: "refused", message: "This person unsubscribed from your emails, so it wasn't sent." });
    const db = mockDb();
    await expect(sendQuestions("lead-1", ["Why?"])).resolves.toMatchObject({ status: "failed" });
    const updates = db.queries("audience_leads").filter((c) => usedOp(c, "update"));
    expect(opArgs(updates.at(-1)!, "update")![0]).toEqual({ survey: null });
    expect(h.createParty).not.toHaveBeenCalled();
  });

  it("uses the same key for the same email, so a double click sends once", async () => {
    mockDb();
    await messageLead("lead-1", { subject: "Hi", body: "Hello" });
    await messageLead("lead-1", { subject: "Hi", body: "Hello" });
    const [first, second] = h.sendLeadEmail.mock.calls.map((call) => call[0].idempotencyKey);
    expect(first).toBe(second);
  });
});

describe("logConversation", () => {
  it("appends an interview entry and links the person to a party", async () => {
    const db = mockDb({ ...LEAD, party_id: "party-0" });
    await logConversation("lead-1", { body: "Wants weekend slots", tags: "timing" });
    const insert = db.queries("audience_feedback").find((c) => usedOp(c, "insert"))!;
    expect(opArgs(insert, "insert")![0]).toEqual({ workspace_id: "w1", lead_id: "lead-1", kind: "interview", body: "Wants weekend slots", tags: ["timing"] });
    expect(db.queries("audience_feedback").some((c) => usedOp(c, "update") || usedOp(c, "delete"))).toBe(false);
    expect(h.createParty).not.toHaveBeenCalled();
  });

  it("refuses an empty conversation", async () => {
    mockDb();
    await expect(logConversation("lead-1", { body: "  ", tags: "" })).rejects.toThrow("Write what was said.");
  });
});

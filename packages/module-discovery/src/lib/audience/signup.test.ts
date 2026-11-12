/**
 * DISC-CONS-P0-03.2/03.3/03.4/03.5: the public sign-up. Pinned: the workspace comes from
 * the page's token and nothing the visitor posts; a referrer is found only on the same
 * list; the honeypot, the two rate limits and the email checks; no answer reveals that
 * an address was already on the list; consent is recorded with the exact line shown;
 * the confirmation is claimed once and sent with the person's unsubscribe link.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, usedOp, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  businessForWorkspace: vi.fn(),
  sendLeadEmail: vi.fn(),
  coreRpc: vi.fn(),
}));
vi.mock("./send", () => ({ businessForWorkspace: h.businessForWorkspace, sendLeadEmail: h.sendLeadEmail }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: () => ({ rpc: h.coreRpc }) }));
vi.mock("../../db/admin", () => ({ createAdminClient: vi.fn() }));

const { submitSignup, resolveSignupPage } = await import("./signup");

const TOKEN = "a".repeat(32);
const PAGE = { id: "page-1", workspace_id: "w-alice", enabled: true, value_line: "Tidy homes", questions: ["Where do you live?"], consent_text: "I agree to hear from Tidy Co." };

type Db = { page?: unknown; existing?: unknown; referrer?: unknown; insertError?: unknown; claimed?: boolean; attempts?: boolean[] };

function mockDb(db: Db = {}) {
  const attempts = [...(db.attempts ?? [true, true])];
  return createFakeSupabase({
    rpc: () => ({ data: attempts.length ? attempts.shift() : true, error: null }),
    query: (call: RecordedQuery) => {
      if (call.table === "audience_signup_pages") return { data: db.page === undefined ? PAGE : db.page, error: null };
      if (call.table === "audience_leads") {
        if (usedOp(call, "insert")) {
          const row = opArgs(call, "insert")![0] as Record<string, unknown>;
          return db.insertError ? { data: null, error: db.insertError } : { data: { ...row, id: "lead-1", status: "new" }, error: null };
        }
        if (usedOp(call, "update")) return { data: db.claimed === false ? null : { id: "lead-1" }, error: null };
        if ("referral_code" in eqFilters(call)) return { data: db.referrer ?? null, error: null };
        return { data: db.existing ?? null, error: null };
      }
      return { data: null, error: null };
    },
  });
}

const input = (fields: Record<string, unknown> = {}) => ({
  email: "Asha@Example.com",
  name: "Asha",
  answer: (i: number) => (i === 0 ? "Pune" : undefined),
  website: "",
  ref: null,
  utm: () => undefined,
  ...fields,
});

function inserted(db: ReturnType<typeof mockDb>) {
  const call = db.queries("audience_leads").find((c) => usedOp(c, "insert"));
  return call ? (opArgs(call, "insert")![0] as Record<string, unknown>) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.businessForWorkspace.mockResolvedValue({ businessId: "b-alice", businessName: "Tidy Co", offeringName: "Tidy Kit", website: null });
  h.coreRpc.mockResolvedValue({ data: true, error: null });
  h.sendLeadEmail.mockResolvedValue({ status: "sent" });
});

describe("submitSignup", () => {
  it("records the person in the token's workspace, with the exact consent line and a referral code", async () => {
    const db = mockDb();
    await expect(submitSignup(TOKEN, input(), db as never)).resolves.toEqual({ status: "joined" });
    expect(inserted(db)).toMatchObject({
      workspace_id: "w-alice",
      email: "asha@example.com",
      name: "Asha",
      answers: { "Where do you live?": "Pune" },
      consent_text: PAGE.consent_text,
      consent_at: expect.any(String),
      source: "waitlist",
      referral_code: expect.stringMatching(/^[a-f0-9]{16}$/),
      lead_token: expect.stringMatching(/^[a-f0-9]{48}$/),
    });
  });

  it("cannot be pointed at another workspace: posted fields never name one", async () => {
    const db = mockDb();
    await submitSignup(TOKEN, input({ workspace_id: "w-bob", workspaceId: "w-bob" } as never), db as never);
    expect(inserted(db)!.workspace_id).toBe("w-alice");
  });

  it("looks a referral code up only on the same list, and links the referrer", async () => {
    const db = mockDb({ referrer: { id: "lead-ref" } });
    await submitSignup(TOKEN, input({ ref: "0123456789abcdef" }), db as never);
    const lookup = db.queries("audience_leads").find((c) => "referral_code" in eqFilters(c))!;
    expect(eqFilters(lookup)).toMatchObject({ workspace_id: "w-alice", referral_code: "0123456789abcdef" });
    expect(inserted(db)!.referrer_lead_id).toBe("lead-ref");
  });

  it("tells a bot that filled the honeypot it joined, and stores nothing", async () => {
    const db = mockDb();
    await expect(submitSignup(TOKEN, input({ website: "http://spam.example" }), db as never)).resolves.toEqual({ status: "joined" });
    expect(db.calls).toEqual([]);
  });

  it("refuses an invalid or too long address before reading anything", async () => {
    const db = mockDb();
    await expect(submitSignup(TOKEN, input({ email: "not-an-email" }), db as never)).resolves.toMatchObject({ status: "invalid" });
    await expect(submitSignup(TOKEN, input({ email: `${"a".repeat(260)}@x.com` }), db as never)).resolves.toMatchObject({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("is rate limited per page and per address", async () => {
    let db = mockDb({ attempts: [false] });
    await expect(submitSignup(TOKEN, input(), db as never)).resolves.toEqual({ status: "rate_limited" });
    expect(inserted(db)).toBeNull();
    db = mockDb({ attempts: [true, false] });
    await expect(submitSignup(TOKEN, input(), db as never)).resolves.toEqual({ status: "rate_limited" });
    expect(db.rpcs("take_signup_attempt").map((c) => c.args.p_key)).toEqual(["page:page-1", expect.stringMatching(/^email:page-1:[a-f0-9]{40}$/)]);
    expect(inserted(db)).toBeNull();
  });

  it("does not reveal that an address is already on the list", async () => {
    const db = mockDb({ existing: { id: "lead-0", status: "active" } });
    await expect(submitSignup(TOKEN, input(), db as never)).resolves.toEqual({ status: "joined" });
    expect(inserted(db)).toBeNull();
    expect(h.sendLeadEmail).not.toHaveBeenCalled();
  });

  it("answers a race on the unique key the same way", async () => {
    const db = mockDb({ insertError: { code: "23505" } });
    await expect(submitSignup(TOKEN, input(), db as never)).resolves.toEqual({ status: "joined" });
  });

  it("takes a fresh consent from someone who unsubscribed and signs up again", async () => {
    const db = mockDb({ existing: { id: "lead-0", status: "unsubscribed" } });
    await submitSignup(TOKEN, input(), db as never);
    const update = db.queries("audience_leads").find((c) => usedOp(c, "update"))!;
    expect(opArgs(update, "update")![0]).toMatchObject({ status: "new", consent_text: PAGE.consent_text, consent_at: expect.any(String) });
  });

  it("is unavailable for a disabled page, an unknown token or an unlicensed business", async () => {
    await expect(submitSignup(TOKEN, input(), mockDb({ page: { ...PAGE, enabled: false } }) as never)).resolves.toEqual({ status: "unavailable" });
    await expect(submitSignup(TOKEN, input(), mockDb({ page: null }) as never)).resolves.toEqual({ status: "unavailable" });
    await expect(submitSignup("not-a-token", input(), mockDb() as never)).resolves.toEqual({ status: "unavailable" });
    h.coreRpc.mockResolvedValue({ data: false, error: null });
    await expect(resolveSignupPage(TOKEN, mockDb() as never)).resolves.toBeNull();
  });

  it("claims the confirmation once and sends it with the person's own token, once", async () => {
    const db = mockDb();
    await submitSignup(TOKEN, input(), db as never);
    const claim = db.queries("audience_leads").find((c) => usedOp(c, "update"))!;
    expect(usedOp(claim, "is")).toBe(true);
    expect(h.sendLeadEmail).toHaveBeenCalledTimes(1);
    const sent = h.sendLeadEmail.mock.calls[0]![0];
    expect(sent.idempotencyKey).toBe("audience-confirm/lead-1");
    expect(sent.body).toContain(`/p/w/${TOKEN}?ref=`);
  });

  it("sends no confirmation when another request already claimed it", async () => {
    await submitSignup(TOKEN, input(), mockDb({ claimed: false }) as never);
    expect(h.sendLeadEmail).not.toHaveBeenCalled();
  });

  it("keeps the sign-up when the confirmation fails to send", async () => {
    h.sendLeadEmail.mockRejectedValue(new Error("provider down"));
    await expect(submitSignup(TOKEN, input(), mockDb() as never)).resolves.toEqual({ status: "joined" });
  });
});

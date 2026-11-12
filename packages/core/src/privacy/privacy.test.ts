import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test-support/fake-supabase";

const { createClient, createAdminClient } = vi.hoisted(() => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));
vi.mock("../db/admin", () => ({ createAdminClient }));

const { createUnsubscribeToken, emailHash, verifyUnsubscribeToken, UnsubscribeNotConfiguredError } = await import(
  "./unsubscribe-token"
);
const { prepareOutreachEmail, recordUnsubscribe, suppressEmailOnRequest } = await import("./suppression");

const BUSINESS = "b0000000-0000-4000-8000-000000000001";
const OTHER = "b0000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

describe("emailHash (PRIV-1)", () => {
  it("normalises like core.email_hash(): trimmed, lower-cased, sha256 hex", () => {
    const expected = createHash("sha256").update("ravi@example.in").digest("hex");
    expect(emailHash("  Ravi@Example.IN ")).toBe(expected);
  });
});

describe("unsubscribe tokens (PRIV-1)", () => {
  it("round-trips the business and the address hash, never the address", () => {
    const hash = emailHash("ravi@example.in");
    const token = createUnsubscribeToken(BUSINESS, hash);
    expect(token).not.toContain("ravi");
    expect(verifyUnsubscribeToken(token)).toEqual({ businessId: BUSINESS, emailHash: hash });
  });

  it("rejects a token re-pointed at another business or address", () => {
    const hash = emailHash("ravi@example.in");
    const [, , signature] = createUnsubscribeToken(BUSINESS, hash).split(".");
    expect(verifyUnsubscribeToken(`${OTHER}.${hash}.${signature}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${BUSINESS}.${emailHash("someone@else.in")}.${signature}`)).toBeNull();
  });

  it("rejects a token signed under another key", () => {
    const token = createUnsubscribeToken(BUSINESS, emailHash("ravi@example.in"));
    process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it.each([null, "", "x", "a.b.c", `${BUSINESS}.nothex.sig`, `not-a-uuid.${"a".repeat(64)}.sig`])(
    "rejects malformed input %s",
    (token) => {
      expect(verifyUnsubscribeToken(token)).toBeNull();
    },
  );

  it("refuses to sign without the secret rather than issuing unverifiable links", () => {
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    expect(() => createUnsubscribeToken(BUSINESS, emailHash("a@b.c"))).toThrow(UnsubscribeNotConfiguredError);
  });
});

describe("prepareOutreachEmail (PRIV-1)", () => {
  function mockSuppressed(suppressed: boolean) {
    const supabase = createFakeSupabase({ rpc: () => ({ data: suppressed, error: null }) });
    createClient.mockResolvedValue(supabase);
    return supabase;
  }

  it("blocks a send to someone who opted out", async () => {
    const supabase = mockSuppressed(true);
    expect(await prepareOutreachEmail(BUSINESS, "ravi@example.in")).toEqual({ suppressed: true });
    expect(supabase.rpcs("is_email_suppressed")[0]!.args).toEqual({ p_business_id: BUSINESS, p_email: "ravi@example.in" });
  });

  it("otherwise returns a verifiable unsubscribe link and the RFC 8058 headers", async () => {
    mockSuppressed(false);
    const result = await prepareOutreachEmail(BUSINESS, "Ravi@Example.in");
    if (result.suppressed) throw new Error("expected not suppressed");
    const token = new URL(result.unsubscribeUrl).searchParams.get("t");
    expect(verifyUnsubscribeToken(token)).toEqual({ businessId: BUSINESS, emailHash: emailHash("ravi@example.in") });
    expect(result.headers).toEqual({
      "List-Unsubscribe": `<${result.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("fails closed when the suppression check fails", async () => {
    createClient.mockResolvedValue(createFakeSupabase({ rpc: () => ({ data: null, error: new Error("db down") }) }));
    await expect(prepareOutreachEmail(BUSINESS, "ravi@example.in")).rejects.toThrow("db down");
  });
});

describe("recordUnsubscribe (PRIV-1)", () => {
  it("stores only the hash, idempotently", async () => {
    const supabase = createFakeSupabase({});
    createAdminClient.mockReturnValue(supabase);
    const hash = emailHash("ravi@example.in");

    await recordUnsubscribe(BUSINESS, hash);

    const call = supabase.queries("communication_suppressions")[0]!;
    const upsert = call.ops.find((op) => op.method === "upsert")!;
    expect(upsert.args[0]).toEqual({ business_id: BUSINESS, email_hash: hash, reason: "unsubscribe" });
    expect(upsert.args[1]).toMatchObject({ ignoreDuplicates: true });
  });

  it("treats a business that no longer exists as nothing left to suppress", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: null, error: { code: "23503" } }) }));
    await expect(recordUnsubscribe(BUSINESS, emailHash("a@b.c"))).resolves.toBeUndefined();
  });

  it("surfaces any other failure", async () => {
    createAdminClient.mockReturnValue(createFakeSupabase({ query: () => ({ data: null, error: { code: "42501", message: "denied" } }) }));
    await expect(recordUnsubscribe(BUSINESS, emailHash("a@b.c"))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("suppressEmailOnRequest (DISC-DATA-P0-04.3)", () => {
  const signedIn = (supabase: ReturnType<typeof createFakeSupabase>, userId: string | null) =>
    Object.assign(supabase, { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } });

  it("adds only the hash to the business's opt-out list, as the signed-in member, idempotently", async () => {
    const supabase = signedIn(createFakeSupabase({}), "u1");
    createClient.mockResolvedValue(supabase);

    await suppressEmailOnRequest(BUSINESS, " Ravi@Example.in ");

    const upsert = supabase.queries("communication_suppressions")[0]!.ops.find((op) => op.method === "upsert")!;
    expect(upsert.args[0]).toEqual({
      business_id: BUSINESS,
      email_hash: emailHash("ravi@example.in"),
      reason: "manual",
      created_by: "u1",
    });
    expect(upsert.args[1]).toMatchObject({ onConflict: "business_id,email_hash", ignoreDuplicates: true });
    expect(JSON.stringify(supabase.calls)).not.toContain("example.in");
    // The caller's own client, so the table's insert policy decides; never the service role.
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("refuses without a signed-in user", async () => {
    const supabase = signedIn(createFakeSupabase({}), null);
    createClient.mockResolvedValue(supabase);
    await expect(suppressEmailOnRequest(BUSINESS, "a@b.c")).rejects.toThrow("Not signed in");
    expect(supabase.queries("communication_suppressions")).toHaveLength(0);
  });

  it("surfaces a refused write, so the caller does not report the address as blocked", async () => {
    const supabase = signedIn(createFakeSupabase({ query: () => ({ data: null, error: { code: "42501", message: "denied" } }) }), "u1");
    createClient.mockResolvedValue(supabase);
    await expect(suppressEmailOnRequest(BUSINESS, "a@b.c")).rejects.toMatchObject({ code: "42501" });
  });
});

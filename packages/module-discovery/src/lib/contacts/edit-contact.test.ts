/**
 * DISC-DATA-P0-04.2: a person's edit of a looked-up contact. What a lookup said about an
 * address ("verified") is about that address; once a person changes it, nothing has
 * checked the new one, so the status is cleared. Otherwise a risky or invalid address
 * could be swapped in under a "Verified" mark and sent to without the sending rule.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/parties/mutations", () => ({ addPartyContact: vi.fn() }));
vi.mock("../prospects/party-sync", () => ({ ensureProspectParty: vi.fn() }));
vi.mock("../prospects/queries", () => ({ getProspect: vi.fn() }));
vi.mock("../tenancy/queries", () => ({ getBusinessIdForWorkspace: vi.fn() }));

const { createContact, editContact } = await import("./mutations");

function mock(before: Record<string, unknown> | null) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => ({
      data: usedOp(call, "update") || usedOp(call, "insert") ? { id: "c1", saved: true } : before,
      error: null,
    }),
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}
const updates = (supabase: ReturnType<typeof mock>) =>
  supabase.queries("contacts").filter((call) => usedOp(call, "update"));

beforeEach(() => vi.clearAllMocks());

describe("editContact", () => {
  it("clears the address status when the address changes on a looked-up contact", async () => {
    const supabase = mock({ email: "a.b@acme.example", email_status: "verified" });

    await editContact("c1", { firstName: "A", email: "someone.else@acme.example" });

    const [edit, clear] = updates(supabase);
    expect(writtenRow(edit!)).toMatchObject({ email: "someone.else@acme.example" });
    expect(writtenRow(clear!)).toEqual({ email_status: null });
    expect(eqFilters(clear!)).toEqual({ id: "c1" });
  });

  it("clears it when the address is removed", async () => {
    const supabase = mock({ email: "a.b@acme.example", email_status: "risky" });
    await editContact("c1", { firstName: "A", email: "" });
    expect(updates(supabase)).toHaveLength(2);
  });

  it("keeps the status when the address is unchanged, whatever its case or spacing", async () => {
    const supabase = mock({ email: "a.b@acme.example", email_status: "verified" });
    await editContact("c1", { firstName: "Renamed", email: " A.B@Acme.example " });
    expect(updates(supabase)).toHaveLength(1);
  });

  it("makes one update for a contact a person typed, which has no status to clear", async () => {
    const supabase = mock({ email: "typed@acme.example", email_status: null });
    await editContact("c1", { email: "new@acme.example" });
    expect(updates(supabase)).toHaveLength(1);
  });
});

describe("createContact with a lookup's provenance", () => {
  it("writes the address status, the source and when it was found", async () => {
    const supabase = mock(null);
    await createContact(
      "w1",
      "p1",
      { firstName: "A", email: "a.b@acme.example" },
      { emailStatus: "verified", source: "Hunter", retrievedAt: "2026-11-11T13:00:00.000Z" },
    );
    expect(writtenRow(supabase.queries("contacts")[0]!)).toMatchObject({
      email: "a.b@acme.example",
      email_status: "verified",
      source: "Hunter",
      source_retrieved_at: "2026-11-11T13:00:00.000Z",
    });
  });

  it("writes none of the three for a contact a person typed", async () => {
    const supabase = mock(null);
    await createContact("w1", "p1", { firstName: "A", email: "a.b@acme.example" });
    const row = writtenRow(supabase.queries("contacts")[0]!)!;
    expect(row).not.toHaveProperty("email_status");
    expect(row).not.toHaveProperty("source");
    expect(row).not.toHaveProperty("source_retrieved_at");
  });
});

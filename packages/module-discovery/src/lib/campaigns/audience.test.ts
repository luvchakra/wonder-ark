/**
 * DISC-CAMP-P0-02.1: who a campaign enrols, and why everyone else is left out. Pure.
 */
import { describe, expect, it } from "vitest";
import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import { isOrganisationMailbox, lineOfWorkOf, segmentsFor, selectAudience, type AudienceContact, type AudienceProspect } from "./audience";

const prospect = (id: string, overrides: Partial<AudienceProspect> = {}): AudienceProspect => ({
  id,
  kind: "company",
  status: "qualified",
  outcome: "open",
  fit_score: 80,
  industry: "Plumber",
  company_email: null,
  ...overrides,
});
const contact = (id: string, prospectId: string, email: string | null, overrides: Partial<AudienceContact> = {}): AudienceContact => ({
  id,
  prospect_id: prospectId,
  email,
  status: "active",
  email_status: null,
  source: null,
  ...overrides,
});
const select = (prospects: AudienceProspect[], contacts: AudienceContact[], extra: Partial<Parameters<typeof selectAudience>[0]> = {}) =>
  selectAudience({ prospects, contacts, alreadyEnrolled: new Set(), suppressed: new Set(), audience: {}, includeUnverified: false, ...extra });

describe("selectAudience", () => {
  it("enrols a qualified, open company at a typed contact's address", () => {
    expect(select([prospect("p1")], [contact("c1", "p1", "ravi@acme.example")])).toEqual({
      enrol: [{ prospectId: "p1", contactId: "c1", recipient: "contact", lineOfWork: "plumber" }],
      leftOut: {},
    });
  });

  it("falls back to the prospect's general company email when no contact can be written to", () => {
    const result = select([prospect("p1", { company_email: "info@acme.example" })], [contact("c1", "p1", null)]);
    expect(result.enrol).toEqual([{ prospectId: "p1", contactId: null, recipient: "company_email", lineOfWork: "plumber" }]);
  });

  it.each([
    ["a channel", { kind: "channel" as const }, "channel"],
    ["a prospect not marked qualified", { status: "new" as const }, "not_qualified"],
    ["a disqualified prospect", { status: "disqualified" as const }, "disqualified"],
    ["a won prospect", { outcome: "won" as const }, "closed"],
    ["a lost prospect", { outcome: "lost" as const }, "closed"],
  ])("leaves out %s, with the reason counted", (_label, overrides, reason) => {
    expect(select([prospect("p1", overrides)], [contact("c1", "p1", "ravi@acme.example")])).toEqual({ enrol: [], leftOut: { [reason]: 1 } });
  });

  it("enrols prospects not yet marked qualified only when the campaign says so, and never a disqualified one", () => {
    const prospects = [prospect("p1", { status: "new" }), prospect("p2", { status: "disqualified" })];
    const contacts = prospects.map((p) => contact(`c-${p.id}`, p.id, `${p.id}@x.example`));
    const result = select(prospects, contacts, { audience: { onlyQualified: false } });
    expect(result.enrol.map((e) => e.prospectId)).toEqual(["p1"]);
    expect(result.leftOut).toEqual({ disqualified: 1 });
  });

  it("leaves out a prospect already in a campaign of the workspace", () => {
    const result = select([prospect("p1")], [contact("c1", "p1", "ravi@acme.example")], { alreadyEnrolled: new Set(["p1"]) });
    expect(result).toEqual({ enrol: [], leftOut: { already_in_a_campaign: 1 } });
  });

  it("applies the campaign's own filter: lines of work and minimum fit score", () => {
    const prospects = [prospect("p1"), prospect("p2", { industry: "Dentist" }), prospect("p3", { fit_score: 40 }), prospect("p4", { fit_score: null })];
    const contacts = prospects.map((p) => contact(`c-${p.id}`, p.id, `${p.id}@x.example`));
    const result = select(prospects, contacts, { audience: { linesOfWork: [" PLUMBER "], minFitScore: 60 } });
    expect(result.enrol.map((e) => e.prospectId)).toEqual(["p1"]);
    expect(result.leftOut).toEqual({ other_line_of_work: 1, below_fit_score: 2 });
  });

  it("never enrols an address on the business's opt-out list, contact or general", () => {
    const suppressed = new Set([emailHash("Ravi@Acme.example"), emailHash("info@acme.example")]);
    const result = select([prospect("p1", { company_email: "info@acme.example" })], [contact("c1", "p1", "ravi@acme.example")], { suppressed });
    expect(result).toEqual({ enrol: [], leftOut: { suppressed: 1 } });
  });

  it("leaves out an address marked invalid, and a risky or unverified one unless the campaign includes them", () => {
    const prospects = [prospect("p1"), prospect("p2"), prospect("p3")];
    const contacts = [
      contact("c1", "p1", "a@x.example", { email_status: "invalid" }),
      contact("c2", "p2", "b@x.example", { email_status: "risky" }),
      contact("c3", "p3", "c@x.example", { email_status: "unverified" }),
    ];
    expect(select(prospects, contacts).leftOut).toEqual({ invalid_email: 1, unverified_email: 2 });
    const included = select(prospects, contacts, { includeUnverified: true });
    expect(included.enrol.map((e) => e.prospectId)).toEqual(["p2", "p3"]);
    expect(included.leftOut).toEqual({ invalid_email: 1 });
  });

  it("writes to a contact a lookup found only at an organisation mailbox, never a named person", () => {
    const prospects = [prospect("p1"), prospect("p2")];
    const contacts = [
      contact("c1", "p1", "priya.sharma@acme.example", { source: "Hunter", email_status: "verified" }),
      contact("c2", "p2", "sales@beta.example", { source: "Hunter", email_status: "verified" }),
    ];
    const result = select(prospects, contacts);
    expect(result.enrol).toEqual([{ prospectId: "p2", contactId: "c2", recipient: "contact", lineOfWork: "plumber" }]);
    expect(result.leftOut).toEqual({ sourced_person: 1 });
  });

  it("uses the next contact when the first cannot be written to, and skips inactive ones", () => {
    const contacts = [
      contact("c1", "p1", "old@x.example", { status: "inactive" }),
      contact("c2", "p1", "bad@x.example", { email_status: "invalid" }),
      contact("c3", "p1", "good@x.example"),
    ];
    expect(select([prospect("p1")], contacts).enrol).toEqual([{ prospectId: "p1", contactId: "c3", recipient: "contact", lineOfWork: "plumber" }]);
  });

  it("counts a prospect with no address at all", () => {
    expect(select([prospect("p1")], [])).toEqual({ enrol: [], leftOut: { no_email: 1 } });
  });

  it("puts a prospect with no industry in the general segment", () => {
    expect(select([prospect("p1", { industry: "  " })], [contact("c1", "p1", "a@x.example")]).enrol[0]!.lineOfWork).toBe("general");
  });
});

describe("segments", () => {
  it("normalises a line of work to one key", () => {
    expect(lineOfWorkOf("  Plumbing   Services ")).toBe("plumbing services");
    expect(lineOfWorkOf(null)).toBe("general");
  });

  it("gives the twelve most common lines of work their own text, most common first", () => {
    const enrolees = [
      ...Array.from({ length: 3 }, () => ({ lineOfWork: "plumber" })),
      ...Array.from({ length: 5 }, () => ({ lineOfWork: "dentist" })),
      { lineOfWork: "general" },
      ...Array.from({ length: 14 }, (_, i) => ({ lineOfWork: `trade ${String(i).padStart(2, "0")}` })),
    ];
    const segments = segmentsFor(enrolees);
    expect(segments).toHaveLength(12);
    expect(segments.slice(0, 3)).toEqual([
      { segment: "dentist", count: 5 },
      { segment: "plumber", count: 3 },
      { segment: "trade 00", count: 1 },
    ]);
    expect(segments.some((entry) => entry.segment === "general")).toBe(false);
  });
});

describe("isOrganisationMailbox", () => {
  it.each(["info@x.example", "Sales@x.example", "hello@x.example", "support-team@x.example", "contact.us@x.example"])("%s is one", (email) => {
    expect(isOrganisationMailbox(email)).toBe(true);
  });
  it.each(["priya.sharma@x.example", "ravi@x.example", "j.doe@x.example"])("%s is a person's", (email) => {
    expect(isOrganisationMailbox(email)).toBe(false);
  });
});

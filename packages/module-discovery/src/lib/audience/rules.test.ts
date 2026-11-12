/** DISC-CONS-P0-03.x / 05.2: the deterministic rules for people who opted in. */
import { describe, expect, it } from "vitest";
import { cleanQuestions, messagingRefusal, normaliseEmail, parseTags, readAnswers, readReferralCode, readUtm } from "./rules";
import { parsePeopleCsv } from "./people-csv";

describe("normaliseEmail", () => {
  it("accepts a plain address, lower-cased and trimmed", () => {
    expect(normaliseEmail("  Asha@Example.COM ")).toBe("asha@example.com");
  });
  it("refuses what is not an address, or is too long", () => {
    for (const bad of ["", "asha", "asha@", "@example.com", "a b@example.com", "asha@example", "<x>@example.com", 42, null]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
    expect(normaliseEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
});

describe("reading the sign-up form", () => {
  it("keeps answers only to the page's own questions", () => {
    const answers = readAnswers(["Where do you live?"], (i) => (i === 0 ? " Pune " : "extra"));
    expect(answers).toEqual({ "Where do you live?": "Pune" });
  });
  it("keeps at most two one-line questions", () => {
    expect(cleanQuestions(["One", " ", "Two\nlines", "Three"])).toEqual(["One", "Two lines"]);
  });
  it("reads utm parameters and a referral code, nothing else", () => {
    expect(readUtm((key) => ({ utm_source: "insta", utm_x: "no" })[key])).toEqual({ source: "insta" });
    expect(readReferralCode("0123456789abcdef")).toBe("0123456789abcdef");
    expect(readReferralCode("'; drop table")).toBeNull();
  });
  it("parses tags", () => {
    expect(parseTags("Parent, pune; parent")).toEqual(["parent", "pune"]);
  });
});

describe("messagingRefusal (DISC-CONS-P0-05.2)", () => {
  it("allows only a person who consented and has not unsubscribed", () => {
    expect(messagingRefusal({ consent_at: "2026-11-12", status: "new" })).toBeNull();
    expect(messagingRefusal({ consent_at: null, status: "new" })).toMatch(/hasn't agreed/);
    expect(messagingRefusal({ consent_at: "2026-11-12", status: "unsubscribed" })).toMatch(/unsubscribed/);
  });
});

describe("parsePeopleCsv", () => {
  it("needs an email column and reads name and tags", () => {
    expect(parsePeopleCsv("name\nAsha").errors).toEqual(["Missing required column: email"]);
    const result = parsePeopleCsv("Email,Name,Tags\nasha@example.com,Asha,parent\n,No email,\n");
    expect(result.rows).toEqual([{ email: "asha@example.com", name: "Asha", tags: "parent" }]);
    expect(result.errors).toHaveLength(1);
  });
});

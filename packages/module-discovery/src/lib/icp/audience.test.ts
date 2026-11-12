/**
 * DISC-CONS-P0-01.1/01.2/01.3: who buys an offering, the Ideal user's shape, and the
 * words the screens use. Pure functions.
 */
import { describe, expect, it } from "vitest";
import {
  audienceTypeOf,
  audienceWords,
  IdealUserDraftSchema,
  idealUserContent,
  prospectNoun,
  readIdealUser,
  suggestAudienceType,
} from "./audience";

describe("audienceTypeOf", () => {
  it("reads the stored answer, and treats anything else as companies (the column default)", () => {
    expect(audienceTypeOf({ audience_type: "consumer" })).toBe("consumer");
    expect(audienceTypeOf({ audience_type: "both" })).toBe("both");
    expect(audienceTypeOf({ audience_type: "business" })).toBe("business");
    expect(audienceTypeOf({ audience_type: "everyone" })).toBe("business");
    expect(audienceTypeOf({})).toBe("business");
    expect(audienceTypeOf(null)).toBe("business");
  });
});

describe("suggestAudienceType", () => {
  it("suggests consumers from the profile's own words", () => {
    expect(suggestAudienceType({ product_profile: { category: "D2C skincare subscription" } })).toBe("consumer");
    expect(suggestAudienceType({ target_market: "Parents of school-age children" })).toBe("consumer");
  });

  it("suggests companies, or both when the profile names both", () => {
    expect(suggestAudienceType({ category: "B2B SaaS - invoice reconciliation" })).toBe("business");
    expect(suggestAudienceType({ target_market: "Small businesses and individuals" })).toBe("both");
  });

  it("suggests nothing when the profile says nothing either way", () => {
    expect(suggestAudienceType({})).toBeNull();
    expect(suggestAudienceType({ category: "Widgets" })).toBeNull();
  });
});

describe("readIdealUser", () => {
  it("tidies what was stored: trims, drops control characters and duplicates, caps lists", () => {
    const user = readIdealUser({
      who: "  Parents\u0000 of toddlers  ",
      goals: ["Sleep more", "sleep more", "", 42, ...Array.from({ length: 20 }, (_, i) => `goal ${i}`)],
      interests: "not a list",
    });
    expect(user?.who).toBe("Parents of toddlers");
    expect(user?.goals[0]).toBe("Sleep more");
    expect(user?.goals.filter((g) => g.toLowerCase() === "sleep more")).toHaveLength(1);
    expect(user?.goals.length).toBeLessThanOrEqual(12);
    expect(user?.interests).toEqual([]);
  });

  it("returns null for nothing, a non-object, or an empty Ideal user", () => {
    expect(readIdealUser(null)).toBeNull();
    expect(readIdealUser("text")).toBeNull();
    expect(readIdealUser([])).toBeNull();
    expect(readIdealUser({ who: " ", goals: [] })).toBeNull();
  });

  it("keeps where an AI draft came from, and idealUserContent drops it", () => {
    const user = readIdealUser({ who: "Students", generated_from: { input_hash: "h", prompt_version: "v" } });
    expect(user?.generated_from).toEqual({ input_hash: "h", prompt_version: "v" });
    expect(idealUserContent(user)).not.toHaveProperty("generated_from");
  });
});

describe("IdealUserDraftSchema", () => {
  it("refuses output that breaks the schema (malformed model output)", () => {
    expect(IdealUserDraftSchema.safeParse({ name: "x", who: "y" }).success).toBe(false);
    expect(
      IdealUserDraftSchema.safeParse({
        name: "x", description: "", who: "", goals: "not a list", triggers: [], current_solutions: [], interests: [],
        online_places: [], offline_places: [], words: [], confidence: 2, evidence: [],
      }).success,
    ).toBe(false);
  });
});

describe("wording (DISC-CONS-P0-01.3)", () => {
  it("keeps a business offering's words and uses channel words for consumers", () => {
    expect(audienceWords("business")).toEqual({ ideal: "Ideal customer", findHeading: "Find prospects", prospect: "company" });
    expect(audienceWords("consumer").findHeading).toBe("Find channels");
    expect(audienceWords("consumer").ideal).toBe("Ideal user");
    expect(prospectNoun("channel")).toBe("channel");
    expect(prospectNoun(undefined)).toBe("company");
  });
});

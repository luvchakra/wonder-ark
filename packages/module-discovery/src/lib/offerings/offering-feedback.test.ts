import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectIcpFieldCorrections, ICP_CONTENT_FIELDS, type IcpContentFields } from "./offering-feedback";

function baseFields(overrides: Partial<IcpContentFields> = {}): IcpContentFields {
  return {
    name: "Mid-market SaaS",
    description: "Sells to mid-market software teams.",
    industries: ["Retail"],
    company_sizes: ["50-200"],
    geographies: ["United States"],
    roles: ["VP Sales"],
    pain_points: ["Manual outreach"],
    buying_signals: ["Recent funding"],
    exclusions: ["Enterprise"],
    revenue: ["$1M-$10M"],
    business_model: ["B2B SaaS"],
    technology: ["Salesforce"],
    growth_stage: ["Series A"],
    existing_tools: ["HubSpot"],
    ...overrides,
  };
}

describe("detectIcpFieldCorrections", () => {
  it("returns nothing when the founder saved the AI's values unchanged", () => {
    const fields = baseFields();
    expect(detectIcpFieldCorrections(fields, { ...fields })).toEqual([]);
  });

  it("reproduces the doc's own worked example -- one list field corrected", () => {
    const ai = baseFields({ industries: ["Retail"] });
    const user = baseFields({ industries: ["Banking"] });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "industries", aiValue: ["Retail"], userValue: ["Banking"] },
    ]);
  });

  it("detects a scalar field correction, including null-to-value", () => {
    const ai = baseFields({ description: null });
    const user = baseFields({ description: "Sells to enterprise IT teams." });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "description", aiValue: null, userValue: "Sells to enterprise IT teams." },
    ]);
  });

  it("reports every field that changed, in field-declaration order, when several are corrected", () => {
    const ai = baseFields();
    const user = baseFields({ industries: ["Banking"], roles: ["CFO"] });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "industries", aiValue: ["Retail"], userValue: ["Banking"] },
      { field: "roles", aiValue: ["VP Sales"], userValue: ["CFO"] },
    ]);
  });

  it("treats a same-elements-different-order list as a correction -- exact order comparison, not a set comparison", () => {
    const ai = baseFields({ industries: ["Retail", "Healthcare"] });
    const user = baseFields({ industries: ["Healthcare", "Retail"] });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "industries", aiValue: ["Retail", "Healthcare"], userValue: ["Healthcare", "Retail"] },
    ]);
  });

  it("ignores an emptied-then-refilled field that lands back on the same value", () => {
    const fields = baseFields({ exclusions: [] });
    expect(detectIcpFieldCorrections(fields, { ...fields, exclusions: [] })).toEqual([]);
  });
});

// DISC-CONS-P0-01.2: the Ideal user's fields are corrections too, and the closed list in
// code is the one the database checks.
describe("Ideal user feedback", () => {
  const user = { who: "Parents of toddlers", goals: ["Sleep"], triggers: [], current_solutions: [], interests: [], online_places: [], offline_places: [], words: [] };

  it("records each Ideal user field a person changed, prefixed audience_", () => {
    const ai = baseFields({ audience: { ...user, generated_from: { input_hash: "h", prompt_version: "v" } } });
    const edited = baseFields({ audience: { ...user, goals: ["Sleep", "Calm evenings"] } });
    expect(detectIcpFieldCorrections(ai, edited)).toEqual([
      { field: "audience_goals", aiValue: ["Sleep"], userValue: ["Sleep", "Calm evenings"] },
    ]);
  });

  it("ignores where a draft came from: an unchanged Ideal user is no correction", () => {
    const ai = baseFields({ audience: { ...user, generated_from: { input_hash: "h", prompt_version: "v" } } });
    expect(detectIcpFieldCorrections(ai, baseFields({ audience: user }))).toEqual([]);
  });

  it("an offering with no Ideal user on either side records nothing for it", () => {
    expect(detectIcpFieldCorrections(baseFields(), baseFields())).toEqual([]);
  });

  it("lists exactly the field names the migration's check allows", () => {
    const sql = readFileSync(
      new URL("../../../../../supabase/migrations/20261112160000_discovery_consumer_channels.sql", import.meta.url),
      "utf8",
    );
    const check = sql.slice(sql.indexOf("add constraint offering_feedback_field_name_check"));
    const inList = check.slice(check.indexOf("field_name in ("), check.indexOf(")\n  );"));
    const names = [...inList.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(names).toEqual([...ICP_CONTENT_FIELDS]);
  });
});

/** DISC-NAV-P0-01.4: the folded sections of an offering's tab pages, and their one-line summaries. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionFold } from "./section-fold";
import { icpHint } from "../offerings/offering-overview-summary";
import type { IcpProfile } from "../../lib/icp/types";

const BASE = "/acme/discovery/offerings/p1";

describe("SectionFold", () => {
  it("is closed unless asked, with its title, summary and a chevron", () => {
    const html = renderToStaticMarkup(
      <SectionFold id="import" title="Import" hint="Add prospects from a file">
        <p>inside</p>
      </SectionFold>,
    );
    expect(html).toMatch(/^<details id="import"/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Import");
    expect(html).toContain("Add prospects from a file");
    expect(html).toContain("<svg");
  });

  it("opens when asked", () => {
    expect(renderToStaticMarkup(<SectionFold title="Ideal customer" open>x</SectionFold>)).toMatch(/<details[^>]*\sopen=""/);
  });
});

describe("the Setup tab's summaries", () => {
  const icp = (overrides: Partial<IcpProfile> = {}) =>
    ({
      status: "draft",
      industries: ["Plumbing"],
      company_sizes: [],
      geographies: ["Pune"],
      roles: [],
      pain_points: [],
      buying_signals: [],
      exclusions: [],
      revenue: [],
      business_model: [],
      technology: [],
      growth_stage: [],
      existing_tools: [],
      ...overrides,
    }) as unknown as IcpProfile;

  it("summarises the ideal customer from its own fields", () => {
    expect(icpHint(null)).toBe("Not defined yet");
    expect(icpHint(icp())).toBe("Draft, not approved yet · 2 of 12 fields");
    expect(icpHint(icp({ status: "approved" }))).toBe("Approved · 2 of 12 fields");
  });

  // DISC-NAV-P0-01.11: a consumer offering is described by its Ideal user ("0 of 12 fields"
  // read as nothing defined).
  it("counts the Ideal user's fields for an offering sold to consumers", () => {
    const withUser = icp({ status: "approved", audience: { who: "Parents of school-age children", interests: ["homework"], pain_points: [] } });
    expect(icpHint(withUser, "consumer")).toMatch(/^Approved · 2 of \d+ fields$/);
  });
});

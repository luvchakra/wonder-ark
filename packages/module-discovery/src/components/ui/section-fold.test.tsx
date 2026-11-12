/** DISC-NAV-P0-01.4: the folded sections of an offering's tab pages, and their one-line summaries. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionFold } from "./section-fold";
import { icpHint, NextStepLine } from "../offerings/offering-overview-summary";
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

  it("points the next step at the Ideal customer section, opened, while it needs work", () => {
    const html = renderToStaticMarkup(<NextStepLine basePath={BASE} icp={icp()} personas={[]} prospectCounts={{ total: 0 } as never} />);
    expect(html).toContain("Review and approve your ideal customer");
    expect(html).toContain(`href="${BASE}?open=icp#icp"`);
  });

  it("points at Find once the setup is done and there are no prospects", () => {
    const html = renderToStaticMarkup(
      <NextStepLine basePath={BASE} icp={icp({ status: "approved" })} personas={[{ id: "x" } as never]} prospectCounts={{ total: 0 } as never} />,
    );
    expect(html).toContain(`href="${BASE}/prospects/discover"`);
  });
});

/** DISC-NAV-P0-02.3: Results reads as one line per question until a section is opened. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfferingPerformanceAnalysisView, leadingLine } from "./offering-performance-analysis";

const bucket = (label: string, matched: number, total: number) => ({ label, matched, total, rate: total ? Math.round((matched / total) * 100) : 0 });
const EMPTY = { signalsProducingConversations: [], industryConversionRates: [], locationConversionRates: [], buyerRolesThatRespond: [], scoreVsOutcome: [], playsPerformance: [] };

describe("leadingLine", () => {
  it("names the row with the most matches, from the rows it was given", () => {
    expect(leadingLine([bucket("Kochi", 1, 8), bucket("Bengaluru", 3, 11)], "none", "none won")).toBe("Bengaluru: 27% (3/11)");
  });

  it("says so when there are rows but no match, or no rows at all", () => {
    expect(leadingLine([bucket("Kochi", 0, 8)], "No prospects yet.", "None won yet.")).toBe("None won yet.");
    expect(leadingLine([], "No prospects yet.", "None won yet.")).toBe("No prospects yet.");
  });
});

describe("OfferingPerformanceAnalysisView", () => {
  it("shows five closed sections, each with its answer on the summary line", () => {
    const html = renderToStaticMarkup(
      <OfferingPerformanceAnalysisView analysis={{ ...EMPTY, buyerRolesThatRespond: [bucket("Owner", 1, 2)], locationConversionRates: [bucket("Kochi", 0, 8)] }} />,
    );
    expect(html.match(/<details/g)?.length).toBe(5);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Owner: 50% (1/2)");
    expect(html).toContain("None won yet.");
    expect(html).toContain("No signals recorded yet.");
  });
});

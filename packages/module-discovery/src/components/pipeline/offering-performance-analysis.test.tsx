/** DISC-NAV-P0-02.4: a question with rows gets a block; the rest are named in one line. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfferingPerformanceAnalysisView } from "./offering-performance-analysis";

const bucket = (label: string, matched: number, total: number) => ({ label, matched, total, rate: total ? Math.round((matched / total) * 100) : 0 });
const EMPTY = { signalsProducingConversations: [], industryConversionRates: [], locationConversionRates: [], buyerRolesThatRespond: [], scoreVsOutcome: [], playsPerformance: [] };

describe("OfferingPerformanceAnalysisView", () => {
  it("shows only the questions that have rows, and names the others once", () => {
    const html = renderToStaticMarkup(
      <OfferingPerformanceAnalysisView analysis={{ ...EMPTY, buyerRolesThatRespond: [bucket("Owner", 1, 2)], locationConversionRates: [bucket("Kochi", 0, 8)] }} />,
    );
    expect(html.match(/<section/g)?.length).toBe(2);
    expect(html).toContain("Owner");
    expect(html).toContain("50%");
    expect(html).toContain("(1/2)");
    expect(html).toContain("Nothing recorded yet for: Signals that start conversations, Industries that convert, Score against outcome, Discovery Plays.");
  });

  it("with no rows at all, is one line naming every question", () => {
    const html = renderToStaticMarkup(<OfferingPerformanceAnalysisView analysis={EMPTY} />);
    expect(html).not.toContain("<section");
    expect(html).toContain("Nothing recorded yet for: Signals that start conversations");
    expect(html).toContain("Discovery Plays.");
  });

  it("drops the closing line when every question is answered", () => {
    const one = [bucket("x", 1, 1)];
    const html = renderToStaticMarkup(
      <OfferingPerformanceAnalysisView
        analysis={{ signalsProducingConversations: one, industryConversionRates: one, locationConversionRates: one, buyerRolesThatRespond: one, scoreVsOutcome: one, playsPerformance: one }}
      />,
    );
    expect(html.match(/<section/g)?.length).toBe(6);
    expect(html).not.toContain("Nothing recorded yet");
  });
});

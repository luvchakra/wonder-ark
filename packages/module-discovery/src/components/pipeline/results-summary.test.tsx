/** DISC-NAV-P0-02.4: Results opens on four counts of the offering's own prospects. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { computeConversionFunnel, type ProspectStage } from "../../lib/prospects/pipeline";
import { ResultsSummary } from "./results-summary";

const funnelOf = (stages: ProspectStage[]) => computeConversionFunnel(stages.map((stage) => ({ stage })));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("ResultsSummary", () => {
  it("counts prospects, contacted, replied and won from the prospects' own stages", () => {
    const html = renderToStaticMarkup(<ResultsSummary funnel={funnelOf(["new", "scored", "sent", "sent", "replied", "closed"])} wonCount={1} />);
    expect(text(html)).toBe("Prospects 6 Contacted 4 Replied 2 50% of contacted Won 1");
  });

  it("shows zeros and no rates when nothing was sent", () => {
    const html = renderToStaticMarkup(<ResultsSummary funnel={funnelOf(["new", "researched"])} wonCount={0} />);
    expect(text(html)).toBe("Prospects 2 Contacted 0 Replied 0 Won 0");
    expect(html).not.toContain("%");
  });
});

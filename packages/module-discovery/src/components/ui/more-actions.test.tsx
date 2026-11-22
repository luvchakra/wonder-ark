/**
 * DISC-NAV-P0-01.9: a stage shows its main action and folds the rest under one "More".
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("../opportunities/send-to-crm-button", () => ({ SendToCrmButton: () => <button type="submit">Send to CRM</button> }));

const { MoreActions } = await import("./more-actions");

/** Button and link labels outside any <details>, i.e. visible without a click. */
function visibleActions(html: string): string[] {
  const outside = html.replace(/<details[\s\S]*?<\/details>/g, "");
  return [...outside.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]!.replace(/<[^>]+>/g, "").trim());
}

describe("MoreActions", () => {
  it("is closed by default and holds what it is given", () => {
    const html = renderToStaticMarkup(
      <MoreActions>
        <button type="button">Watch</button>
      </MoreActions>,
    );
    expect(html).toMatch(/^<details/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("More");
    expect(visibleActions(html)).toEqual([]);
  });
});

describe("the Setup tab's top opportunity", () => {
  it("shows one action and folds Edit Recommendation, Watch and Dismiss", async () => {
    const { TopOpportunityGate } = await import("../opportunities/top-opportunity-gate");
    const html = renderToStaticMarkup(
      <TopOpportunityGate
        businessId="b1"
        productId="p1"
        opportunity={{ id: "o1", prospect_id: "x1", confidence: "high", recommended_action_override: null, next_best_action: null, why_now: null, score: 80 } as never}
        prospect={{ id: "x1", company_name: "Acme" } as never}
        contactName={null}
        hasParty={false}
        relationship={null as never}
        watchAction={async () => {}}
        dismissAction={async () => {}}
        sendToCrmAction={async () => {}}
      />,
    );
    expect(visibleActions(html).filter((label) => /CRM|Watch|Dismiss|Edit Recommendation/.test(label))).toEqual(["Send to CRM"]);
    expect(html).toContain("Edit Recommendation");
  });
});

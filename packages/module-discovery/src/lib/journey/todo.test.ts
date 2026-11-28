/** DISC-NAV-P0-02.1: the person's groups and everyone else's, from the offering's own rows. */
import { describe, expect, it } from "vitest";
import { needsYouCount, prospectGroups, toApproveCount } from "./todo";

const p = (id: string, stage: string, nextAction: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, stage, nextAction, isStuck: false, ...extra }) as Parameters<typeof prospectGroups>[0][number];

describe("prospectGroups", () => {
  const groups = prospectGroups([
    p("a", "researched", "Score", { kind: "channel" }),
    p("b", "scored", "Generate strategy", { kind: "channel" }),
    p("c", "messaged", "Review message"),
    p("d", "replied", "Generate reply"),
    p("e", "sent", null),
    p("f", "closed", null),
    p("g", "new", "Research"),
  ]);

  it("puts the person's work first, closest to a customer, then what WonderArk is preparing", () => {
    expect(groups.map((g) => [g.id, g.title, g.prospects.length])).toEqual([
      ["answer", "Answer 1 reply", 1],
      ["send", "Send 1 ready email", 1],
      ["preparing", "To prepare (3)", 3],
      ["waiting", "Waiting for a reply (1)", 1],
      ["closed", "Closed (1)", 1],
    ]);
  });

  it("follows up only on prospects gone quiet outside a running campaign", () => {
    expect(prospectGroups([p("a", "sent", null, { isStuck: true })])[0]!.title).toBe("Follow up with 1 prospect");
    expect(prospectGroups([p("a", "sent", null, { isStuck: true, inActiveCampaign: true })])[0]!.id).toBe("waiting");
  });
});

// DISC-REACH-P0-01.1
describe("a written message is grouped by how it can go out", () => {
  it("separates emails with an address, direct messages, and emails with nowhere to go", () => {
    const groups = prospectGroups([
      p("a", "messaged", "Review message", { reach: "email" }),
      p("b", "messaged", "Review message", { reach: "instagram" }),
      p("c", "messaged", "Review message", { reach: "instagram" }),
      p("d", "messaged", "Review message", { reach: "needs_email" }),
    ]);
    expect(groups.map((g) => [g.id, g.title])).toEqual([
      ["send", "Send 1 ready email"],
      ["dm", "Message 2 on Instagram"],
      ["needs-email", "Add an email address for 1"],
    ]);
  });

  it("names no platform when they differ", () => {
    const groups = prospectGroups([p("b", "messaged", "Review message", { reach: "instagram" }), p("c", "messaged", "Review message", { reach: "linkedin" })]);
    expect(groups[0]!.title).toBe("Send 2 direct messages");
  });
});

describe("the tab counts (DISC-NAV-P0-02.5)", () => {
  it("Prospects counts only what needs the person: replies, follow-ups and ready messages", () => {
    const picked = [p("a", "replied", "Generate reply"), p("b", "new", "Research"), p("c", "messaged", "Retry send")];
    expect(needsYouCount(picked)).toBe(2);
    expect(needsYouCount([p("b", "new", "Research")])).toBe(0);
  });

  it("Search counts what waits for approval: found and imported", () => {
    expect(toApproveCount({ suggestionCount: 3, waitingToPick: 1 })).toBe(4);
    expect(toApproveCount({ suggestionCount: 0, waitingToPick: 0 })).toBe(0);
  });
});

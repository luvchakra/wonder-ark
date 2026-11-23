/** DISC-NAV-P0-02.1: the person's groups and everyone else's, from the offering's own rows. */
import { describe, expect, it } from "vitest";
import { prospectGroups, todoCount } from "./todo";

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
      ["send", "Send 1 ready message", 1],
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

describe("todoCount", () => {
  it("counts only what needs the person: replies, follow-ups, ready messages and approvals", () => {
    const picked = [p("a", "replied", "Generate reply"), p("b", "new", "Research"), p("c", "messaged", "Retry send")];
    expect(todoCount({ picked, suggestionCount: 3, waitingToPick: 1 })).toBe(6);
    expect(todoCount({ picked: [p("b", "new", "Research")], suggestionCount: 0, waitingToPick: 0 })).toBe(0);
  });
});

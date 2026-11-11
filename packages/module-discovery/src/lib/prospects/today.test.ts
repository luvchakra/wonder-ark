/**
 * DISC-NAV-P0-01.2: the Today list's counts must match the lists its links open. Each
 * row is checked against the real query the destination page runs (`listProspects` with
 * the filters in the row's link, `listProspectSuggestions` for "To review"), over one
 * set of rows, so a count can never say 3 and open a list of 2.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient }));

const { countProspectSuggestions, listProspects, listProspectSuggestions } = await import("./queries");
const { buildTodayList, TODAY_FILTERS } = await import("./today");

const WORKSPACE = "w1";
const PATH = "/acme/discovery/offerings/p1/prospects";
const NOW = new Date("2026-11-11T09:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function prospect(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: WORKSPACE,
    company_name: id,
    updated_at: daysAgo(30),
    fit_score: null,
    prospect_research: null,
    prospect_scores: [],
    outreach_strategies: [],
    messages: [],
    conversations: [],
    ...overrides,
  };
}
const sent = (days: number) => ({
  messages: [{ status: "sent", created_at: daysAgo(days), sent_at: daysAgo(days) }],
  conversations: [{ status: "awaiting_reply", last_message_at: daysAgo(days) }],
});
const replied = (days: number) => ({
  messages: [{ status: "sent", created_at: daysAgo(days + 1), sent_at: daysAgo(days + 1) }],
  conversations: [{ status: "replied", last_message_at: daysAgo(days) }],
});

const PROSPECTS = [
  prospect("new-and-quiet"), // stuck, but nothing was sent: not a follow-up
  prospect("replied-today", replied(0)),
  prospect("replied-long-ago", replied(20)),
  prospect("sent-yesterday", sent(1)), // waiting, not yet due
  prospect("sent-8-days-ago", sent(8)),
  prospect("sent-40-days-ago", sent(40)),
  prospect("sent-then-closed", {
    messages: [{ status: "sent", created_at: daysAgo(30), sent_at: daysAgo(30) }],
    conversations: [{ status: "closed", last_message_at: daysAgo(20) }],
  }),
];
const SUGGESTIONS = [{ id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }];

function mock(prospects: unknown[] = PROSPECTS, suggestions: unknown[] = SUGGESTIONS) {
  createClient.mockResolvedValue(
    createFakeSupabase({
      query: (call) =>
        call.table === "prospect_suggestions"
          ? ({ data: suggestions, count: suggestions.length, error: null } as never)
          : { data: prospects, error: null },
    }),
  );
}

async function today() {
  return buildTodayList({
    prospects: await listProspects(WORKSPACE),
    suggestionCount: await countProspectSuggestions(WORKSPACE),
    prospectsPath: PATH,
  });
}

/** What the Prospects page shows for a row's link: its query string, read the way the
 * page reads it (`stage`, and `due=1` for follow-ups due). */
async function listBehind(href: string) {
  const params = new URL(href, "https://app.example").searchParams;
  return listProspects(WORKSPACE, {
    stage: (params.get("stage") ?? undefined) as never,
    followUpDue: params.get("due") === "1",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("Today list", () => {
  it("counts replies waiting, and its link opens exactly those prospects", async () => {
    mock();
    const row = (await today()).find((r) => r.id === "replies")!;
    const list = await listBehind(row.href);
    expect(row.count).toBe(2);
    expect(list.map((p) => p.id).sort()).toEqual(["replied-long-ago", "replied-today"]);
    expect(row.count).toBe(list.length);
    expect(row.href).toBe(`${PATH}?stage=${TODAY_FILTERS.replies.stage}`);
  });

  it("counts follow-ups due, and its link opens exactly those prospects", async () => {
    mock();
    const row = (await today()).find((r) => r.id === "follow_ups")!;
    const list = await listBehind(row.href);
    // Sent yesterday is still waiting on the prospect; a closed conversation is done.
    expect(list.map((p) => p.id).sort()).toEqual(["sent-40-days-ago", "sent-8-days-ago"]);
    expect(row.count).toBe(list.length);
    expect(row.href).toBe(`${PATH}?stage=sent&due=1`);
  });

  it("counts suggestions to review, and its link opens the review list on Find", async () => {
    mock();
    const row = (await today()).find((r) => r.id === "to_review")!;
    expect(row.count).toBe((await listProspectSuggestions(WORKSPACE)).length);
    expect(row.count).toBe(4);
    expect(row.href).toBe(`${PATH}/discover#to-review-heading`);
  });

  it("gives every row one action, and words a single item in the singular", async () => {
    mock([prospect("only-reply", replied(0))], [{ id: "s1" }]);
    const rows = await today();
    expect(rows.map((r) => [r.text, r.action])).toEqual([
      ["1 reply is waiting for your answer", "Answer"],
      ["1 suggestion is waiting for review", "Review"],
    ]);
  });

  it("is empty when nothing is waiting, so the page can say so in one line", async () => {
    mock([prospect("new-today", { updated_at: daysAgo(0) }), prospect("sent-yesterday", sent(1))], []);
    expect(await today()).toEqual([]);
  });
});

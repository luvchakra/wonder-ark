import { isFollowUpDue, type ProspectStage } from "../prospects/pipeline";

/**
 * DISC-NAV-P0-02.1: what an offering's picked prospects need, grouped. The redesign the
 * owner approved on 2026-11-22: the person approves who to contact and sends what goes out;
 * WonderArk prepares the rest by itself (lib/prospects/prep.ts). So there are two kinds of
 * group: the person's (answer a reply, follow up, send a ready message), shown on To do,
 * and the rest, shown on Prospects to say how far each has got.
 *
 * Pure, so the pages and the tests share it.
 */
type Prospect = {
  id: string;
  kind?: "company" | "channel";
  stage: ProspectStage;
  nextAction: string | null;
  isStuck: boolean;
  inActiveCampaign?: boolean;
};

export type GroupId = "answer" | "follow-up" | "send" | "preparing" | "waiting" | "closed";
export type ProspectGroup<T> = { id: GroupId; title: string; prospects: T[] };

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const noun = (count: number, channels: boolean) => (channels ? n(count, "channel", "channels") : n(count, "prospect", "prospects"));

const PREP_ACTIONS = new Set(["Research", "Score", "Generate strategy", "Approve strategy", "Generate message"]);

/** In order: closest to a customer first. The first three are the person's. */
const GROUPS: { id: GroupId; match: (p: Prospect) => boolean; title: (c: number, channels: boolean) => string }[] = [
  { id: "answer", match: (p) => p.nextAction === "Generate reply", title: (c) => `Answer ${n(c, "reply", "replies")}` },
  { id: "follow-up", match: (p) => isFollowUpDue(p), title: (c, channels) => `Follow up with ${noun(c, channels)}` },
  { id: "send", match: (p) => p.nextAction === "Review message" || p.nextAction === "Retry send", title: (c) => `Send ${n(c, "ready message", "ready messages")}` },
  { id: "preparing", match: (p) => p.nextAction !== null && PREP_ACTIONS.has(p.nextAction), title: (c) => `Being prepared (${c})` },
  { id: "closed", match: (p) => p.stage === "closed", title: (c) => `Closed (${c})` },
];

export const PERSON_GROUPS: readonly GroupId[] = ["answer", "follow-up", "send"];

/** Each prospect sits in the first group it matches; the rest are waiting for a reply. */
export function prospectGroups<T extends Prospect>(prospects: T[]): ProspectGroup<T>[] {
  const left = new Set(prospects);
  const found = new Map<GroupId, T[]>();
  for (const group of GROUPS) {
    const hit = [...left].filter(group.match);
    for (const p of hit) left.delete(p);
    if (hit.length) found.set(group.id, hit);
  }
  const waiting = [...left];
  const order: GroupId[] = ["answer", "follow-up", "send", "preparing", "waiting", "closed"];
  return order.flatMap((id): ProspectGroup<T>[] => {
    if (id === "waiting") return waiting.length ? [{ id, title: `Waiting for a reply (${waiting.length})`, prospects: waiting }] : [];
    const hit = found.get(id);
    if (!hit) return [];
    const group = GROUPS.find((g) => g.id === id)!;
    return [{ id, title: group.title(hit.length, hit.every((p) => p.kind === "channel")), prospects: hit }];
  });
}

/** How many things need the person: replies, follow-ups and ready messages, plus found and
 * imported prospects waiting for their approval. The To do tab's count. */
export function todoCount(input: { picked: Prospect[]; suggestionCount: number; waitingToPick: number }): number {
  const mine = prospectGroups(input.picked)
    .filter((g) => PERSON_GROUPS.includes(g.id))
    .reduce((sum, g) => sum + g.prospects.length, 0);
  return mine + input.suggestionCount + input.waitingToPick;
}

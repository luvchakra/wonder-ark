import { isFollowUpDue, type ProspectStage } from "../prospects/pipeline";
import { DM_LABEL, type Reach } from "../channels/reach";

/**
 * DISC-NAV-P0-02.1: what an offering's picked prospects need, grouped. The person approves
 * who to contact and sends what goes out; WonderArk prepares the ones they choose
 * (lib/prospects/prep.ts). So there are two kinds of group: the person's (answer a reply,
 * follow up, send a ready message) and the rest, which say how far each has got.
 * DISC-NAV-P0-02.5 (owner, 2026-11-29): both are on the Prospects tab; Search only finds
 * and approves new ones.
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
  /** DISC-REACH-P0-01.1: how its unsent message can go out. */
  reach?: Reach | null;
};

export type GroupId = "answer" | "follow-up" | "send" | "dm" | "needs-email" | "preparing" | "waiting" | "closed";
export type ProspectGroup<T> = { id: GroupId; title: string; prospects: T[] };

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const noun = (count: number, channels: boolean) => (channels ? n(count, "channel", "channels") : n(count, "prospect", "prospects"));

const hasDraft = (p: Prospect) => p.nextAction === "Review message" || p.nextAction === "Retry send";
const isDirect = (reach: Reach | null | undefined) => reach !== undefined && reach !== null && reach !== "email" && reach !== "needs_email";

const PREP_ACTIONS = new Set(["Research", "Score", "Generate strategy", "Approve strategy", "Generate message"]);

/** In order: closest to a customer first. The first three are the person's. */
const GROUPS: { id: GroupId; match: (p: Prospect) => boolean; title: (c: number, channels: boolean) => string }[] = [
  { id: "answer", match: (p) => p.nextAction === "Generate reply", title: (c) => `Answer ${n(c, "reply", "replies")}` },
  { id: "follow-up", match: (p) => isFollowUpDue(p), title: (c, channels) => `Follow up with ${noun(c, channels)}` },
  // DISC-REACH-P0-01.1: a written message is grouped by how it can go out. An email is
  // ready only with an address; a direct message is sent by the person on its platform.
  { id: "dm", match: (p) => hasDraft(p) && isDirect(p.reach), title: (c) => `Send ${n(c, "direct message", "direct messages")}` },
  { id: "needs-email", match: (p) => hasDraft(p) && p.reach === "needs_email", title: (c) => `Add an email address for ${c}` },
  { id: "send", match: (p) => hasDraft(p), title: (c) => `Send ${n(c, "ready email", "ready emails")}` },
  { id: "preparing", match: (p) => p.nextAction !== null && PREP_ACTIONS.has(p.nextAction), title: (c) => `To prepare (${c})` },
  { id: "closed", match: (p) => p.stage === "closed", title: (c) => `Closed (${c})` },
];

export const PERSON_GROUPS: readonly GroupId[] = ["answer", "follow-up", "send", "dm", "needs-email"];

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
  const order: GroupId[] = ["answer", "follow-up", "send", "dm", "needs-email", "preparing", "waiting", "closed"];
  return order.flatMap((id): ProspectGroup<T>[] => {
    if (id === "waiting") return waiting.length ? [{ id, title: `Waiting for a reply (${waiting.length})`, prospects: waiting }] : [];
    const hit = found.get(id);
    if (!hit) return [];
    const group = GROUPS.find((g) => g.id === id)!;
    // "Message 4 on Instagram" when they are all on one platform.
    const platform = id === "dm" && hit.every((p) => p.reach === hit[0]!.reach) ? DM_LABEL[hit[0]!.reach as keyof typeof DM_LABEL] : undefined;
    const title = platform ? `Message ${hit.length} on ${platform}` : group.title(hit.length, hit.every((p) => p.kind === "channel"));
    return [{ id, title, prospects: hit }];
  });
}

/** DISC-NAV-P0-02.5: how many approved prospects need the person (a reply to answer, a
 * follow-up, a message ready to go out). The Prospects tab's count, and each list chip's. */
export function needsYouCount(picked: Prospect[]): number {
  return prospectGroups(picked)
    .filter((g) => PERSON_GROUPS.includes(g.id))
    .reduce((sum, g) => sum + g.prospects.length, 0);
}

/** DISC-NAV-P0-02.5: how many found or imported prospects wait for approval. The Search
 * tab's count. */
export function toApproveCount(input: { suggestionCount: number; waitingToPick: number }): number {
  return input.suggestionCount + input.waitingToPick;
}

import { NEXT_ACTION_ANCHOR, isFollowUpDue, type ProspectStage } from "../prospects/pipeline";

/**
 * DISC-NAV-P0-01.11: the one next step for an offering, toward its goal of new customers.
 * Shown under the step tabs on every step, so whatever was just done, the line says what
 * comes after it. Worked out only from the offering's own rows; pure, so the layout and the
 * test share it.
 *
 * Order: finish Define; then work the people closest to becoming customers first (answer
 * replies, follow up, send what is ready, plan outreach, score, research); then bring in more
 * (review what Find found, pick imports, search); then look at what it all led to.
 */
export type NextStep = {
  /** Which of the four steps it belongs to. */
  step: "define" | "find" | "reach" | "results";
  /** "Research 4 prospects" */
  label: string;
  href: string;
};

type Prospect = {
  id: string;
  kind?: "company" | "channel";
  stage: ProspectStage;
  nextAction: string | null;
  isStuck: boolean;
  inActiveCampaign?: boolean;
  outcome?: "open" | "won" | "lost";
};

export type NextStepInput = {
  /** `/<business>/discovery/offerings/<id>` */
  basePath: string;
  hasProfile: boolean;
  icpStatus: "approved" | "draft" | null;
  /** Picked prospects, with their derived stage and next action. */
  picked: Prospect[];
  /** Search results waiting on Find. */
  suggestionCount: number;
  /** Imported prospects waiting on Find to be picked. */
  waitingToPick: number;
  /** Whether any campaign exists. */
  hasCampaign: boolean;
};

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const noun = (count: number, channels: boolean) => (channels ? n(count, "channel", "channels") : n(count, "prospect", "prospects"));

/** DISC-NAV-P0-01.13: the Reach tasks, closest to a customer first. The Next line names the
 * first one with prospects in it, and the Reach list shows its prospects under the same words,
 * in the same order, so the line and the list never disagree. */
export type ReachTaskId = "answer" | "follow-up" | "send" | "write" | "score" | "research";
export const REACH_TASKS: { id: ReachTaskId; match: (p: Prospect) => boolean; label: (c: number, channels: boolean) => string }[] = [
  { id: "answer", match: (p) => p.nextAction === "Generate reply", label: (c) => `Answer ${n(c, "reply", "replies")}` },
  { id: "follow-up", match: (p) => isFollowUpDue(p), label: (c, channels) => `Follow up with ${noun(c, channels)}` },
  { id: "send", match: (p) => p.nextAction === "Review message" || p.nextAction === "Retry send", label: (c) => `Send ${n(c, "ready message", "ready messages")}` },
  {
    id: "write",
    match: (p) => p.nextAction === "Generate strategy" || p.nextAction === "Approve strategy" || p.nextAction === "Generate message",
    label: (c, channels) => `Write to ${noun(c, channels)}`,
  },
  { id: "score", match: (p) => p.nextAction === "Score", label: (c, channels) => `Score ${noun(c, channels)}` },
  { id: "research", match: (p) => p.nextAction === "Research", label: (c, channels) => `Research ${noun(c, channels)}` },
];

export type ReachGroup<T> = { id: ReachTaskId | "waiting" | "closed"; title: string; prospects: T[] };

/** The Reach list, grouped by what to do next. Each prospect sits in the first task it
 * matches; the rest are waiting for a reply, or closed. */
export function reachGroups<T extends Prospect>(prospects: T[]): ReachGroup<T>[] {
  const left = new Set(prospects);
  const take = (match: (p: T) => boolean) => {
    const hit = [...left].filter(match);
    for (const p of hit) left.delete(p);
    return hit;
  };
  const groups: ReachGroup<T>[] = [];
  for (const task of REACH_TASKS) {
    const hit = take(task.match);
    if (hit.length) groups.push({ id: task.id, title: task.label(hit.length, hit.every((p) => p.kind === "channel")), prospects: hit });
  }
  const closed = take((p) => p.stage === "closed");
  const waiting = [...left];
  if (waiting.length) groups.push({ id: "waiting", title: `Waiting for a reply (${waiting.length})`, prospects: waiting });
  if (closed.length) groups.push({ id: "closed", title: `Closed (${closed.length})`, prospects: closed });
  return groups;
}

export function nextStep(input: NextStepInput): NextStep {
  const { basePath } = input;
  if (!input.hasProfile) return { step: "define", label: "Describe what you sell", href: `${basePath}?open=offering` };
  if (input.icpStatus === null) return { step: "define", label: "Define your ideal customer", href: `${basePath}/icp` };
  if (input.icpStatus === "draft") return { step: "define", label: "Approve your ideal customer", href: `${basePath}/icp` };

  for (const task of REACH_TASKS) {
    const matched = input.picked.filter(task.match);
    if (matched.length === 0) continue;
    const channels = matched.every((p) => p.kind === "channel");
    if (matched.length === 1) {
      const only = matched[0]!;
      const anchor = only.nextAction ? NEXT_ACTION_ANCHOR[only.nextAction] : undefined;
      return { step: "reach", label: task.label(1, channels), href: `${basePath}/prospects/${only.id}${anchor ? `#${anchor}` : ""}` };
    }
    // The Reach list's group with the same title; channels are their own list.
    return { step: "reach", label: task.label(matched.length, channels), href: `${basePath}/prospects${channels ? "?list=channels" : ""}#reach-${task.id}` };
  }

  if (input.suggestionCount > 0) {
    return { step: "find", label: `Review ${n(input.suggestionCount, "found prospect", "found prospects")}`, href: `${basePath}/prospects/discover#to-review-heading` };
  }
  if (input.waitingToPick > 0) {
    return { step: "find", label: `Pick from ${n(input.waitingToPick, "imported prospect", "imported prospects")}`, href: `${basePath}/prospects/discover#to-pick` };
  }
  if (input.picked.length === 0) return { step: "find", label: "Find prospects", href: `${basePath}/prospects/discover` };
  // Campaigns email companies only, so a channel-only list is never told to start one.
  if (!input.hasCampaign && input.picked.some((p) => (p.kind ?? "company") === "company")) {
    return { step: "reach", label: "Start a campaign to reach them all", href: `${basePath}/prospects#campaigns` };
  }
  return { step: "find", label: "Find more prospects", href: `${basePath}/prospects/discover` };
}

/** DISC-NAV-P0-01.12: which of the four steps are done, for the green ticks on the step tabs.
 * Define: offering described and ideal customer approved. Find: at least one prospect picked.
 * Reach: at least one picked prospect written to. Results: at least one deal won. */
export type StepsDone = Record<NextStep["step"], boolean>;

export function stepsDone(input: Pick<NextStepInput, "hasProfile" | "icpStatus" | "picked">): StepsDone {
  return {
    define: input.hasProfile && input.icpStatus === "approved",
    find: input.picked.length > 0,
    reach: input.picked.some((p) => p.stage === "sent" || p.stage === "replied" || p.stage === "closed"),
    results: input.picked.some((p) => p.outcome === "won"),
  };
}

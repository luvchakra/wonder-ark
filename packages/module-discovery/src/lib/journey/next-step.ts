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

/** Each group: which prospects, what to call doing it, and the Reach list filter that shows them. */
const REACH_STEPS: { match: (p: Prospect) => boolean; label: (c: number, channels: boolean) => string; filter: Record<string, string> }[] = [
  { match: (p) => p.nextAction === "Generate reply", label: (c) => `Answer ${n(c, "reply", "replies")}`, filter: { stage: "replied" } },
  { match: (p) => isFollowUpDue(p), label: (c) => `Follow up with ${n(c, "prospect", "prospects")}`, filter: { stage: "sent", due: "1" } },
  {
    match: (p) => p.nextAction === "Review message" || p.nextAction === "Retry send",
    label: (c) => `Send ${n(c, "ready message", "ready messages")}`,
    filter: { stage: "messaged" },
  },
  {
    match: (p) => p.nextAction === "Generate strategy" || p.nextAction === "Approve strategy" || p.nextAction === "Generate message",
    label: (c, channels) => (channels ? `Write to ${n(c, "channel", "channels")}` : `Write to ${n(c, "prospect", "prospects")}`),
    // These sit at two stages (scored, strategized); the list ordered by next action shows them first.
    filter: { sort: "priority" },
  },
  { match: (p) => p.nextAction === "Score", label: (c) => `Score ${n(c, "prospect", "prospects")}`, filter: { stage: "researched" } },
  { match: (p) => p.nextAction === "Research", label: (c) => `Research ${n(c, "prospect", "prospects")}`, filter: { stage: "new" } },
];

export function nextStep(input: NextStepInput): NextStep {
  const { basePath } = input;
  if (!input.hasProfile) return { step: "define", label: "Describe what you sell", href: `${basePath}?open=offering` };
  if (input.icpStatus === null) return { step: "define", label: "Define your ideal customer", href: `${basePath}/icp` };
  if (input.icpStatus === "draft") return { step: "define", label: "Approve your ideal customer", href: `${basePath}/icp` };

  for (const group of REACH_STEPS) {
    const matched = input.picked.filter(group.match);
    if (matched.length === 0) continue;
    const channels = matched.every((p) => p.kind === "channel");
    if (matched.length === 1) {
      const only = matched[0]!;
      const anchor = only.nextAction ? NEXT_ACTION_ANCHOR[only.nextAction] : undefined;
      return { step: "reach", label: group.label(1, channels), href: `${basePath}/prospects/${only.id}${anchor ? `#${anchor}` : ""}` };
    }
    return { step: "reach", label: group.label(matched.length, channels), href: `${basePath}/prospects?${new URLSearchParams(group.filter)}` };
  }

  if (input.suggestionCount > 0) {
    return { step: "find", label: `Review ${n(input.suggestionCount, "found prospect", "found prospects")}`, href: `${basePath}/prospects/discover#to-review-heading` };
  }
  if (input.waitingToPick > 0) {
    return { step: "find", label: `Pick from ${n(input.waitingToPick, "imported prospect", "imported prospects")}`, href: `${basePath}/prospects/discover#to-pick` };
  }
  if (input.picked.length === 0) return { step: "find", label: "Find prospects", href: `${basePath}/prospects/discover` };
  if (!input.hasCampaign) return { step: "reach", label: "Start a campaign to reach them all", href: `${basePath}/prospects#campaigns` };
  return { step: "find", label: "Find more prospects", href: `${basePath}/prospects/discover` };
}

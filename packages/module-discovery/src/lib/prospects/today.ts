import { STAGE_STUCK_THRESHOLD_DAYS, isFollowUpDue, type ProspectPipelineState } from "./pipeline";

/**
 * DISC-NAV-P0-01.2: the Today list at the top of Prospects -- what is waiting for the
 * person, built only from data the offering already has:
 *
 *   replies      prospects whose latest conversation is waiting for an answer (the
 *                Replied stage);
 *   follow-ups   prospects a message was sent to, with no reply and no activity for
 *                `STAGE_STUCK_THRESHOLD_DAYS` days (`isFollowUpDue`);
 *   to review    suggestions waiting on the Find page.
 *
 * Each row carries a count and one link. The link opens the list the count was taken
 * from, filtered the same way, so the number on the row is the number of rows the
 * person lands on (today.test.ts holds the two together). A row with nothing in it is
 * left out; an empty list is said in one line by the component.
 *
 * Pure: no server code, so the component and the test can both import it.
 */
export type TodayRowId = "replies" | "follow_ups" | "to_review" | "new_signups";

export type TodayRow = {
  id: TodayRowId;
  count: number;
  /** "2 replies are waiting for your answer" */
  text: string;
  /** The one action's label. */
  action: string;
  href: string;
};

/** The Prospects list filters each Today row opens, as that page's query string. */
export const TODAY_FILTERS = {
  replies: { stage: "replied" },
  follow_ups: { stage: "sent", due: "1" },
} as const;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function buildTodayList(input: {
  /** Every prospect of the offering, unfiltered, with its derived stage. */
  prospects: (Pick<ProspectPipelineState, "stage" | "isStuck"> & { inActiveCampaign?: boolean })[];
  /** How many suggestions are waiting for review. */
  suggestionCount: number;
  /** The offering's Prospects page, `/<business>/discovery/offerings/<id>/prospects`. */
  prospectsPath: string;
  /** DISC-CONS-P0-05.2: people who signed up and haven't been contacted yet. Left out
   * for an offering sold only to companies. */
  newSignups?: number;
}): TodayRow[] {
  const replies = input.prospects.filter((p) => p.stage === TODAY_FILTERS.replies.stage).length;
  const followUps = input.prospects.filter(isFollowUpDue).length;
  const rows: TodayRow[] = [
    {
      id: "replies",
      count: replies,
      text: `${plural(replies, "reply is", "replies are")} waiting for your answer`,
      action: "Answer",
      href: `${input.prospectsPath}?${new URLSearchParams(TODAY_FILTERS.replies)}`,
    },
    {
      id: "follow_ups",
      count: followUps,
      text: `${plural(followUps, "follow-up is", "follow-ups are")} due: no reply and no activity for ${STAGE_STUCK_THRESHOLD_DAYS} days`,
      action: "Follow up",
      href: `${input.prospectsPath}?${new URLSearchParams(TODAY_FILTERS.follow_ups)}`,
    },
    {
      id: "to_review",
      count: input.suggestionCount,
      text: `${plural(input.suggestionCount, "suggestion is", "suggestions are")} waiting for review`,
      action: "Review",
      href: `${input.prospectsPath}/discover#to-review-heading`,
    },
    {
      id: "new_signups",
      count: input.newSignups ?? 0,
      text: `${plural(input.newSignups ?? 0, "new sign-up hasn't", "new sign-ups haven't")} been contacted yet`,
      action: "See people",
      href: `${input.prospectsPath}?list=people`,
    },
  ];
  return rows.filter((row) => row.count > 0);
}

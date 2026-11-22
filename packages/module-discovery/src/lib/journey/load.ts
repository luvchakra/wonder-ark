import { createClient } from "../../db/server";
import { countProspectSuggestions, listProspects } from "../prospects/queries";
import { nextStep, stepsDone, type NextStep, type StepsDone } from "./next-step";
import { prepQueue } from "../prospects/prep";

/**
 * DISC-NAV-P0-01.11: reads what `nextStep` needs for one offering, under the person's own
 * session (RLS scopes every read to their business). Four reads, in parallel.
 */
export async function loadNextStep(input: {
  workspaceId: string;
  basePath: string;
  hasProfile: boolean;
  icpStatus: "approved" | "draft" | null;
}): Promise<{ next: NextStep; done: StepsDone; prepRemaining: number }> {
  const supabase = await createClient();
  const [picked, suggestionCount, waiting, campaigns] = await Promise.all([
    listProspects(input.workspaceId, { shortlisted: true }),
    countProspectSuggestions(input.workspaceId),
    supabase.from("prospects").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId).is("shortlisted_at", null),
    supabase.from("outreach_campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId),
  ]);
  if (waiting.error) throw waiting.error;
  if (campaigns.error) throw campaigns.error;
  const journey = {
    basePath: input.basePath,
    hasProfile: input.hasProfile,
    icpStatus: input.icpStatus,
    picked,
    suggestionCount,
    waitingToPick: waiting.count ?? 0,
    hasCampaign: (campaigns.count ?? 0) > 0,
  };
  // DISC-NAV-P0-01.12: the same reads also say which steps are done.
  const done = stepsDone(journey);
  // DISC-AUTO-P0-01.1: picked prospects still to prepare; only once Define is done (scoring
  // and the message need the approved ideal customer).
  return { next: nextStep(journey), done, prepRemaining: done.define ? prepQueue(picked).length : 0 };
}

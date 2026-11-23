import { createClient } from "../../db/server";
import { countProspectSuggestions, listProspects } from "../prospects/queries";
import { prepQueue, stepsLeft } from "../prospects/prep";
import { todoCount } from "./todo";

/** A picked prospect still to prepare, as the preparation panel lists it. */
export type PrepCandidate = { id: string; name: string; steps: number };

/**
 * DISC-NAV-P0-02.1: what the offering's tabs need to show, under the person's own session
 * (RLS scopes every read to their business): the To do count, and how many picked
 * prospects are still to prepare. Three reads, in parallel.
 */
export async function loadOfferingJourney(input: { workspaceId: string; setupDone: boolean; autoSend?: boolean }): Promise<{ todo: number; prepCandidates: PrepCandidate[] }> {
  const supabase = await createClient();
  const [picked, suggestionCount, waiting] = await Promise.all([
    listProspects(input.workspaceId, { shortlisted: true }),
    countProspectSuggestions(input.workspaceId),
    supabase.from("prospects").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId).is("shortlisted_at", null),
  ]);
  if (waiting.error) throw waiting.error;
  return {
    todo: todoCount({ picked, suggestionCount, waitingToPick: waiting.count ?? 0 }),
    // DISC-AUTO-P0-01.1: only once setup is done (scoring and the message need the
    // approved ideal customer).
    // DISC-AUTO-P0-01.3: the person picks which of these to prepare; nothing starts by itself.
    prepCandidates: input.setupDone
      ? prepQueue(picked, [], { autoSend: input.autoSend }).map((p) => ({ id: p.id, name: p.company_name, steps: stepsLeft(p, { autoSend: input.autoSend }) }))
      : [],
  };
}

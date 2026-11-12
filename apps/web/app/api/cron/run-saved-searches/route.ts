import { NextResponse } from "next/server";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";
import { enqueueDueSavedSearches } from "@cofounderai/module-discovery/lib/data-sources/saved-searches";

/**
 * DISC-DATA-P0-05.1 -- the daily check for weekly saved searches that are due. It only
 * queues: one `discovery.saved_search.run_requested` event per due search goes into
 * core.domain_events, and /api/cron/drain-events (scheduled ten minutes later) runs
 * them, parking any whose business has no Discovery licence. Nothing is searched here.
 * Same shared-secret auth as every other cron route, since the caller is a scheduler,
 * not a signed-in user.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await enqueueDueSavedSearches());
}

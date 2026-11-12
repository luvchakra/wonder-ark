import { NextResponse } from "next/server";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";
import { runCampaignTick } from "@cofounderai/module-discovery/lib/campaigns/tick";

/**
 * DISC-CAMP-P0-07.1 -- the campaign tick: sends the campaign emails that are due, inside
 * each mailbox's daily limit, and nothing else (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md).
 * Scheduled once a day in apps/web/vercel.json; an hourly GitHub Actions workflow calls
 * the same route once its two repository secrets exist.
 *
 * Same shared-secret auth as every other cron route, since the caller is a scheduler,
 * not a signed-in user. Calling it more often is safe: a step is claimed once, so a
 * second call sends nothing that the first one sent.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runCampaignTick());
}

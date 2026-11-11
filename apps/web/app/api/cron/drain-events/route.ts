import { NextResponse } from "next/server";
import { drainDomainEvents } from "@cofounderai/core/events/drain";
// Side-effect import: populates core/events/registry.ts's in-process handler map before
// the drain loop below runs. Every module's own events/handlers.ts is imported here for
// exactly this reason (00-MASTER-PLAN.md's module contract layout) -- an event whose
// type has no handler registered fails permanently on its very next drain attempt.
import "@cofounderai/core/licensing/event-handlers";
import "@cofounderai/core/billing/event-handlers";
import "@cofounderai/core/rbac/event-handlers";
import "@cofounderai/module-inventory/events/handlers";
import "@cofounderai/module-fsm/events/handlers";
import "@cofounderai/module-gst/events/handlers";
import "@cofounderai/module-crm/events/handlers";
import "@cofounderai/module-discovery/events/handlers";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";

/**
 * Drains due core.domain_events (D-9) -- point a Vercel Cron job (or any scheduler) at
 * this route. Authenticated the same way as the other webhook routes here (a shared
 * secret header), since the caller is a scheduler, not a logged-in user -- Vercel Cron's
 * own convention is `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await drainDomainEvents();
  return NextResponse.json(result);
}

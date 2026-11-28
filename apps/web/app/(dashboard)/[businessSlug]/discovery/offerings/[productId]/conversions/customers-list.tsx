import Link from "next/link";
import type { ProspectWithPipeline } from "@cofounderai/module-discovery/lib/prospects/queries";
import { getHandoffStatusForProspect } from "@cofounderai/module-fsm/contract/index";
import { CreateOpportunityButton } from "./create-opportunity-button";
import { createOpportunityAction } from "./actions";

/**
 * The offering's won prospects, each with its hand-off to Field Service. Shared by the
 * Conversions page and the Customers section of Results (DISC-NAV-P0-02.4).
 *
 * Per-customer handoff state (contract call, ADR-10) -- small lists in practice (a
 * business's own won deals), so N calls here reads fine against one extra query each,
 * same reasoning the prospect detail page's own single-customer version already uses.
 * MODULE_NOT_LICENSED is a normal answer: the button says so.
 */
export async function CustomersList({
  businessId,
  productId,
  workspaceId,
  customers,
  basePath,
}: {
  businessId: string;
  productId: string;
  workspaceId: string;
  customers: ProspectWithPipeline[];
  /** The offering's Prospects path. */
  basePath: string;
}) {
  if (customers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No won deals yet -- mark a conversation &quot;Won&quot; when it closes to add one here.
      </p>
    );
  }
  const handoffStates = await Promise.all(
    customers.map(async (c) => {
      const status = await getHandoffStatusForProspect(businessId, c.id);
      if (!status.ok && status.error === "MODULE_NOT_LICENSED") {
        return { kind: "not_licensed" as const };
      }
      if (status.ok) {
        return { kind: "exists" as const, opportunityId: status.data.opportunityId, opportunityStatus: status.data.opportunityStatus };
      }
      return { kind: "missing" as const };
    }),
  );
  return (
    <ul className="flex flex-col gap-2">
      {customers.map((c, i) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <Link href={`${basePath}/${c.id}`} className="flex-1 hover:underline">
            <span className="font-medium">{c.company_name}</span>
            <span className="ml-2 text-xs text-muted-foreground">Closed {new Date(c.lastActivityAt).toLocaleDateString()}</span>
          </Link>
          {c.party_id ? (
            <CreateOpportunityButton
              state={handoffStates[i]!}
              businessId={businessId}
              createAction={createOpportunityAction.bind(null, businessId, productId, {
                prospectId: c.id,
                partyId: c.party_id,
                companyName: c.company_name,
                workspaceId,
              })}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

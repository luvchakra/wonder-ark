import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { listInvestors, listPipeline, listRounds, pickActiveRound } from "@cofounderai/module-discovery/lib/funding/queries";
import { formatAmount, researchState } from "@cofounderai/module-discovery/lib/funding/metrics";
import { INVESTOR_TYPES, INVESTOR_TYPE_LABEL, type InvestorType } from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { InvestorFields } from "@cofounderai/module-discovery/components/funding/investor-fields";
import { StageBadge } from "@cofounderai/module-discovery/components/funding/status";
import { createInvestorAction } from "../actions";
import { fundingContext } from "../context";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import OutreachPage from "../outreach/page";

const RESEARCH_LABEL = { not_researched: "Not researched", researching: "Researching", researched: "Researched", stale: "Stale" } as const;

/** FND-07 — the investor database (§24): who, what they invest in, research freshness,
 * and where each stands in the live round. Cards on a phone, a list on desktop. */
export default async function InvestorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const status = sp.status === "archived" ? "archived" : "active";
  const type = (INVESTOR_TYPES as readonly string[]).includes(String(sp.type)) ? (sp.type as InvestorType) : null;
  const [investors, rounds] = await Promise.all([listInvestors(businessId, status), listRounds(businessId)]);
  const round = pickActiveRound(rounds);
  const pipeline = round ? await listPipeline(businessId, { roundId: round.id }) : [];
  const stageByInvestor = new Map(pipeline.map((p) => [p.investorId, p.stage]));
  const now = new Date();
  const shown = type ? investors.filter((i) => i.investorType === type) : investors;

  return (
    <>
      <PageHeader
        title="Investors"
        description={round ? `Stages shown for ${round.name}.` : "Your investor database."}
        actions={<ExportMenu exportId="funding.investors" businessSlug={businessSlug} params={sp} />}
      />
      <div className="grid max-w-md grid-cols-2 gap-3">
        <UrlSelect name="status" label="Show" value={status} options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} />
        <UrlSelect name="type" label="Type" value={type ?? ""} options={[{ value: "", label: "All types" }, ...INVESTOR_TYPES.map((t) => ({ value: t, label: INVESTOR_TYPE_LABEL[t] }))]} />
      </div>
      <Card>
        <CardContent className="pt-6">
          {shown.length === 0 ? (
            <EmptyState icon={Users} message="No investors here yet." />
          ) : (
            <ul className="divide-y">
              {shown.map((inv) => {
                const research = researchState(inv, now);
                const stage = stageByInvestor.get(inv.id);
                return (
                  <li key={inv.id}>
                    <Link href={`${root}/investors/${inv.id}`} className="flex flex-col gap-1 py-3 hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between sm:px-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{inv.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {INVESTOR_TYPE_LABEL[inv.investorType]}
                          {inv.stages.length ? ` · ${inv.stages.join(", ")}` : ""}
                          {inv.checkMin !== null || inv.checkMax !== null
                            ? ` · ${formatAmount(inv.checkMin, inv.currency)}–${formatAmount(inv.checkMax, inv.currency)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          status={research}
                          label={RESEARCH_LABEL[research]}
                          tone={research === "researched" ? "success" : research === "stale" ? "warning" : "secondary"}
                        />
                        {stage ? <StageBadge stage={stage} /> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add an investor</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createInvestorAction.bind(null, businessId)} submitLabel="Add investor" pendingText="Adding...">
              <InvestorFields />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
      {/* DISC-NAV-P0-01.6: Investor outreach is a section of the Investors tab. */}
      <SectionFold id="outreach" title="Investor outreach" hint="Drafts and messages to investors; a person sends each one">
        <OutreachPage params={params} searchParams={searchParams} />
      </SectionFold>
    </>
  );
}

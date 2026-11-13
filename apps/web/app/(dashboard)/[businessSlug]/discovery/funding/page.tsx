import Link from "next/link";
import { Landmark, Plus } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { getFundingFinanceSnapshot } from "@cofounderai/module-gst/contract/index";
import {
  getFundingProfile,
  listDataRoomItems,
  listDiligence,
  listInteractions,
  listInvestors,
  listOutreach,
  listPipeline,
  listReadinessItems,
  listRounds,
  listStageHistory,
  pickActiveRound,
} from "@cofounderai/module-discovery/lib/funding/queries";
import { formatAmount, investorFunnel, roundProgress, type Figure } from "@cofounderai/module-discovery/lib/funding/metrics";
import { fundingAttention } from "@cofounderai/module-discovery/lib/funding/attention";
import { DILIGENCE_STATUSES, DILIGENCE_STATUS_LABEL, ROUND_TYPE_LABEL } from "@cofounderai/module-discovery/lib/funding/types";
import { FigureTile } from "@cofounderai/module-discovery/components/funding/figure-tile";
import { RoundProgressBar } from "@cofounderai/module-discovery/components/funding/round-progress";
import { InvestorFunnel } from "@cofounderai/module-discovery/components/funding/investor-funnel";
import { FundingAttentionList } from "@cofounderai/module-discovery/components/funding/attention-list";
import { RoundBadge } from "@cofounderai/module-discovery/components/funding/status";
import { fundingContext } from "./context";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import RoundsPage from "./rounds/page";
import FundingAnalyticsPage from "./analytics/page";

const ACTIVE_STAGES = new Set(["contacted", "meeting", "partner_review", "due_diligence", "term_discussion"]);

/**
 * FND-03 — Funding dashboard (§20). One round in focus (the live primary round), its
 * progress with commitments kept apart from money received, the investor funnel, the
 * diligence queue, rule-based attention, and — only when Finance is licensed — cash and
 * runway read from the ledger with the time they were read.
 */
export default async function FundingDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const open = (await searchParams).open;
  const { businessSlug } = await params;
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;

  const rounds = await listRounds(businessId);
  const round = pickActiveRound(rounds);
  const [profile, investors, pipeline, history, outreach, readiness, dataRoom, diligence, interactions, finance] = await Promise.all([
    getFundingProfile(businessId),
    listInvestors(businessId),
    round ? listPipeline(businessId, { roundId: round.id }) : Promise.resolve([]),
    round ? listStageHistory(businessId, round.id) : Promise.resolve([]),
    listOutreach(businessId),
    listReadinessItems(businessId),
    listDataRoomItems(businessId),
    listDiligence(businessId),
    round ? listInteractions(businessId, { roundId: round.id, type: "meeting" }) : Promise.resolve([]),
    getFundingFinanceSnapshot(businessId),
  ]);

  const progress = round ? roundProgress(round, pipeline) : null;
  const funnel = investorFunnel(pipeline, history);
  const financeData = finance.ok && finance.data.hasAccounts ? finance.data : null;
  const attention = fundingAttention({
    profile,
    round,
    investors,
    pipeline,
    outreach,
    readiness,
    dataRoom,
    diligence,
    financeAvailable: financeData !== null,
  });

  const count = (value: number, definition: string): Figure => ({ value, kind: "actual", definition });
  const daysInRound =
    round?.openedAt !== null && round?.openedAt !== undefined
      ? Math.max(0, Math.floor((new Date().getTime() - new Date(round.openedAt).getTime()) / 86_400_000))
      : null;

  if (rounds.length === 0 && investors.length === 0 && !profile) {
    return (
      <>
        <PageHeader title="Funding" description="Plan the round, work the investor pipeline, and run diligence in one place." />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <EmptyState icon={Landmark} message="Nothing here yet. Most founders start with the funding profile, then set up the round." />
            {canManage ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`${root}/profile`}>Write the funding profile</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`${root}?open=rounds#rounds`}>Set up a round</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <SectionFold id="rounds" title="Rounds" hint="Set up the round you are raising" open={open === "rounds"}>
          <RoundsPage params={params} />
        </SectionFold>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Funding
            {round ? (
              <>
                <span className="text-muted-foreground">· {round.name}</span> <RoundBadge status={round.status} />
              </>
            ) : null}
          </span>
        }
        description={
          round
            ? `${ROUND_TYPE_LABEL[round.roundType]} · target ${formatAmount(round.targetAmount, round.currency)}${round.targetCloseDate ? ` · close by ${round.targetCloseDate}` : ""}`
            : "No live round."
        }
        actions={
          <>
            <ExportMenu exportId="funding.dashboard" businessSlug={businessSlug} kind="dashboard" />
            {canManage ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${root}/investors`}>
                    <Plus className="size-4" aria-hidden="true" /> Add investor
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={round ? `${root}/rounds/${round.id}` : `${root}/rounds`}>{round ? "Open round" : "Set up a round"}</Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {/* DISC-NAV-P0-01.6: four headline figures; everything else is a section folded behind
          a chevron. Rounds and Analytics, once tabs of their own, are sections here. */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {progress && round ? (
          <>
            <FigureTile label="Target" figure={progress.target} money currency={round.currency} />
            <FigureTile label="Committed" figure={progress.committed} money currency={round.currency} />
            <FigureTile label="Raised" figure={progress.raised} money currency={round.currency} />
            <FigureTile label="Remaining" figure={progress.aboveTarget ? { ...progress.remaining, value: null, definition: "Raised is above the target." } : progress.remaining} money currency={round.currency} />
          </>
        ) : (
          <>
            <FigureTile label="Investors identified" figure={count(investors.length, "Active investors in your database.")} />
            <FigureTile
              label="Active conversations"
              figure={count(pipeline.filter((p) => ACTIVE_STAGES.has(p.stage)).length, "Investors between Contacted and Term discussion.")}
            />
            <FigureTile
              label="Diligence open"
              figure={count(diligence.filter((d) => d.status !== "accepted" && d.status !== "closed").length, "Requests not yet accepted or closed.")}
            />
            <FigureTile
              label="Data room missing"
              figure={count(dataRoom.filter((d) => d.status === "missing").length, "Checklist documents with no file uploaded.")}
            />
          </>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <SectionFold
          id="attention"
          title="Needs attention"
          hint={attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}` : "Nothing right now"}
          open={attention.length > 0 && !open}
        >
          <FundingAttentionList items={attention} root={root} />
        </SectionFold>
        <SectionFold
          id="pipeline"
          title="Round progress and pipeline"
          hint={round ? `${pipeline.filter((p) => p.stage !== "passed").length} investors in ${round.name}'s pipeline` : "No live round"}
        >
          {progress ? (
            <>
              <p className="text-sm text-muted-foreground">A commitment is not money received — the two are counted separately.</p>
              <RoundProgressBar progress={progress} />
            </>
          ) : null}
          <p className="text-sm font-medium">Investor pipeline</p>
          <p className="text-xs text-muted-foreground">Reached each stage (from stage history) · currently there · step conversion.</p>
          {pipeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No investors in this round yet.</p>
          ) : (
            <InvestorFunnel steps={funnel.steps} passed={funnel.passed} />
          )}
        </SectionFold>
        <SectionFold id="figures" title="All figures" hint="Investors, conversations, meetings, diligence, data room, runway, Finance">
          <section aria-label="All figures" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FigureTile label="Investors identified" figure={count(investors.length, "Active investors in your database.")} />
            <FigureTile
              label="In this round's pipeline"
              figure={count(pipeline.filter((p) => p.stage !== "passed").length, "Investors added to the round's pipeline, excluding those who passed.")}
            />
            <FigureTile
              label="Active conversations"
              figure={count(pipeline.filter((p) => ACTIVE_STAGES.has(p.stage)).length, "Investors between Contacted and Term discussion.")}
            />
            <FigureTile label="Meetings logged" figure={count(interactions.length, "Meeting interactions logged against this round.")} />
            <FigureTile
              label="Diligence open"
              figure={count(diligence.filter((d) => d.status !== "accepted" && d.status !== "closed").length, "Requests not yet accepted or closed.")}
            />
            <FigureTile
              label="Data room missing"
              figure={count(dataRoom.filter((d) => d.status === "missing").length, "Checklist documents with no file uploaded.")}
            />
            <FigureTile
              label="Days in round"
              figure={{ value: daysInRound, kind: "actual", definition: "Days since the round was opened. Blank until it is opened." }}
            />
            <FigureTile
              label="Runway (months)"
              figure={{
                value: financeData?.runwayMonths ?? null,
                kind: "actual",
                definition: financeData
                  ? `Cash ÷ average monthly loss over the last three complete months, read from Finance at ${new Date(financeData.asOf).toLocaleString("en-IN")}. Blank when the business is not losing money.`
                  : "Finance metrics unavailable: Finance is not licensed or not set up for this business.",
              }}
            />
          </section>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {DILIGENCE_STATUSES.map((s) => (
              <li key={s} className="flex justify-between gap-2">
                <span className="text-muted-foreground">Diligence: {DILIGENCE_STATUS_LABEL[s]}</span>
                <span className="font-medium tabular-nums">{diligence.filter((d) => d.status === s).length}</span>
              </li>
            ))}
          </ul>
          {financeData ? (
            <>
              <p className="text-sm font-medium">From Finance · read-only, as of {new Date(financeData.asOf).toLocaleString("en-IN")}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Stat label="Cash" value={formatAmount(financeData.cash, financeData.currency)} />
                <Stat label="Revenue, last 3 months" value={formatAmount(financeData.revenueLast3Months, financeData.currency)} />
                <Stat label="Monthly burn" value={financeData.netBurn === null ? "Not burning" : formatAmount(financeData.netBurn, financeData.currency)} />
                <Stat label="Receivables" value={formatAmount(financeData.receivable, financeData.currency)} />
              </dl>
            </>
          ) : null}
        </SectionFold>
        <SectionFold id="rounds" title="Rounds" hint={`${rounds.length} round${rounds.length === 1 ? "" : "s"}`} open={open === "rounds"}>
          <RoundsPage params={params} />
        </SectionFold>
        <SectionFold id="analytics" title="Analytics" hint="Round, pipeline conversion, activity, time in stage" open={open === "analytics"}>
          <FundingAnalyticsPage params={params} searchParams={searchParams} />
        </SectionFold>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

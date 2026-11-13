import type { ReactNode } from "react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listOfferingOptions } from "@cofounderai/module-discovery/lib/marketing/queries";
import { getFundingProfile } from "@cofounderai/module-discovery/lib/funding/queries";
import { formatAmount } from "@cofounderai/module-discovery/lib/funding/metrics";
import { PROVENANCES, PROVENANCE_LABEL } from "@cofounderai/module-discovery/lib/funding/types";
import { getFundingFinanceSnapshot } from "@cofounderai/module-gst/contract/index";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { saveProfileAction } from "../actions";
import { fundingContext } from "../context";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import ReadinessPage from "../readiness/page";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * FND-04 — Funding profile (§21). The narrative the founder writes, beside the facts the
 * platform already holds (business, offerings, Finance), which are shown from their
 * owners and never copied into the profile (§21.2). Every traction figure carries its
 * source and whether it was sourced, typed in, or inferred.
 */
export default async function FundingProfilePage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { businessId, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const [profile, business, offerings, finance] = await Promise.all([
    getFundingProfile(businessId),
    getBusiness(businessId),
    listOfferingOptions(businessId),
    getFundingFinanceSnapshot(businessId),
  ]);
  const p = profile;
  const traction = [...(p?.traction ?? []), null, null];
  const financeData = finance.ok && finance.data.hasAccounts ? finance.data : null;

  return (
    <>
      <PageHeader
        title="Funding profile"
        description="The fundraising story, built from what the business already knows."
        actions={<ExportMenu exportId="funding.profile" businessSlug={businessSlug} kind="report" />}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="pt-6">
            <ActionForm action={saveProfileAction.bind(null, businessId)} submitLabel="Save profile" pendingText="Saving...">
              <fieldset disabled={!canManage} className="flex flex-col gap-4">
                <Section title="Company">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Geography" htmlFor="companyGeography">
                      <Input id="companyGeography" name="companyGeography" defaultValue={p?.company.geography ?? ""} />
                    </Field>
                    <Field label="Founded" htmlFor="companyFounded">
                      <Input id="companyFounded" name="companyFounded" defaultValue={p?.company.founded ?? ""} placeholder="2023" />
                    </Field>
                  </div>
                  <Field label="Summary" htmlFor="companySummary">
                    <Textarea id="companySummary" name="companySummary" rows={3} defaultValue={p?.company.summary ?? ""} />
                  </Field>
                  <Field label="Team" htmlFor="companyTeam">
                    <Textarea id="companyTeam" name="companyTeam" rows={3} defaultValue={p?.company.team ?? ""} />
                  </Field>
                </Section>
                <Section title="Product">
                  <Field label="Customer problem" htmlFor="productProblem">
                    <Textarea id="productProblem" name="productProblem" rows={2} defaultValue={p?.product.problem ?? ""} />
                  </Field>
                  <Field label="Differentiation" htmlFor="productDifferentiation">
                    <Textarea id="productDifferentiation" name="productDifferentiation" rows={2} defaultValue={p?.product.differentiation ?? ""} />
                  </Field>
                  <Field label="Evidence" htmlFor="productEvidence" hint="What shows it works: pilots, usage, testimonials.">
                    <Textarea id="productEvidence" name="productEvidence" rows={2} defaultValue={p?.product.evidence ?? ""} />
                  </Field>
                </Section>
                <Section title="Market">
                  <Field label="Target market" htmlFor="marketTarget">
                    <Textarea id="marketTarget" name="marketTarget" rows={2} defaultValue={p?.market.targetMarket ?? ""} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Geography" htmlFor="marketGeography">
                      <Input id="marketGeography" name="marketGeography" defaultValue={p?.market.geography ?? ""} />
                    </Field>
                    <Field label="Segmentation" htmlFor="marketSegmentation">
                      <Input id="marketSegmentation" name="marketSegmentation" defaultValue={p?.market.segmentation ?? ""} />
                    </Field>
                  </div>
                  <Field label="Evidence and sources" htmlFor="marketEvidence">
                    <Textarea id="marketEvidence" name="marketEvidence" rows={2} defaultValue={p?.market.evidence ?? ""} />
                  </Field>
                </Section>
                <Section title="Traction">
                  <p className="text-xs text-muted-foreground">Every figure needs its source. Leave a row blank to skip it.</p>
                  {traction.map((t, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-5">
                      <Input name="traction_metric" placeholder="Metric" aria-label="Metric" defaultValue={t?.metric ?? ""} />
                      <Input name="traction_value" placeholder="Value" aria-label="Value" defaultValue={t?.value ?? ""} />
                      <Input name="traction_period" placeholder="Period" aria-label="Period" defaultValue={t?.period ?? ""} />
                      <Input name="traction_source" placeholder="Source" aria-label="Source" defaultValue={t?.source ?? ""} />
                      <NativeSelect name="traction_provenance" aria-label="Provenance" defaultValue={t?.provenance ?? "user_entered"}>
                        {PROVENANCES.map((pv) => (
                          <option key={pv} value={pv}>
                            {PROVENANCE_LABEL[pv]}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  ))}
                </Section>
                <Section title="Business model">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Pricing" htmlFor="modelPricing">
                      <Input id="modelPricing" name="modelPricing" defaultValue={p?.businessModel.pricing ?? ""} />
                    </Field>
                    <Field label="Revenue model" htmlFor="modelRevenue">
                      <Input id="modelRevenue" name="modelRevenue" defaultValue={p?.businessModel.revenueModel ?? ""} />
                    </Field>
                    <Field label="Contract model" htmlFor="modelContract">
                      <Input id="modelContract" name="modelContract" defaultValue={p?.businessModel.contractModel ?? ""} />
                    </Field>
                    <Field label="Recurring vs one-time" htmlFor="modelRecurring">
                      <Input id="modelRecurring" name="modelRecurring" defaultValue={p?.businessModel.recurring ?? ""} />
                    </Field>
                  </div>
                </Section>
                <Section title="Fundraising objective">
                  <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                    <Field label="Target amount" htmlFor="objectiveAmount">
                      <Input id="objectiveAmount" name="objectiveAmount" inputMode="decimal" defaultValue={p?.objective.targetAmount ?? ""} />
                    </Field>
                    <Field label="Currency" htmlFor="objectiveCurrency">
                      <Input id="objectiveCurrency" name="objectiveCurrency" maxLength={3} className="uppercase" defaultValue={p?.objective.currency ?? "INR"} />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Preferred instrument" htmlFor="objectiveInstrument" hint="As you describe it — this is not legal advice.">
                      <Input id="objectiveInstrument" name="objectiveInstrument" defaultValue={p?.objective.instrument ?? ""} />
                    </Field>
                    <Field label="Target close" htmlFor="objectiveTargetClose">
                      <Input id="objectiveTargetClose" name="objectiveTargetClose" type="date" defaultValue={p?.objective.targetClose ?? ""} />
                    </Field>
                  </div>
                  <Field label="Use of funds" htmlFor="objectiveUseOfFunds">
                    <Textarea id="objectiveUseOfFunds" name="objectiveUseOfFunds" rows={3} defaultValue={p?.objective.useOfFunds ?? ""} />
                  </Field>
                </Section>
              </fieldset>
            </ActionForm>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>From your records</CardTitle>
              <CardDescription>Shown from where they live, not copied here.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p>{business?.name ?? "—"}</p>
                {business?.website ? <p className="break-all text-muted-foreground">{business.website}</p> : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Business offerings</p>
                {offerings.length === 0 ? <p>—</p> : <p>{offerings.map((o) => o.name).join(", ")}</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>From Finance</CardTitle>
              <CardDescription>
                {financeData ? `Read-only, as of ${new Date(financeData.asOf).toLocaleString("en-IN")}.` : "Finance metrics unavailable."}
              </CardDescription>
            </CardHeader>
            {financeData ? (
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Revenue, last 3 months</dt>
                    <dd className="font-medium tabular-nums">{formatAmount(financeData.revenueLast3Months, financeData.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Cash</dt>
                    <dd className="font-medium tabular-nums">{formatAmount(financeData.cash, financeData.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Monthly burn</dt>
                    <dd className="font-medium tabular-nums">{financeData.netBurn === null ? "Not burning" : formatAmount(financeData.netBurn, financeData.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Runway</dt>
                    <dd className="font-medium tabular-nums">{financeData.runwayMonths === null ? "—" : `${financeData.runwayMonths} months`}</dd>
                  </div>
                </dl>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>
      {/* DISC-NAV-P0-01.6: Investor readiness is a section of the Profile tab. */}
      <SectionFold id="readiness" title="Investor readiness" hint="The checklist investors look for, by category">
        <ReadinessPage params={params} />
      </SectionFold>
    </>
  );
}

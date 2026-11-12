import Link from "next/link";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  getLatestWebsiteOnboardingRun,
  listWebsiteOnboardingOfferingCandidates,
  listWebsiteOnboardingPages,
} from "@cofounderai/module-discovery/lib/website-onboarding/queries";
import { WEBSITE_PAGE_CATEGORY_LABEL } from "@cofounderai/module-discovery/lib/website-onboarding/crawl-plan";
import { listSeoItems } from "@cofounderai/module-discovery/lib/marketing/queries";
import {
  SEO_CATEGORIES,
  SEO_CATEGORY_LABEL,
  SEO_SEVERITIES,
  SEO_STATUSES,
  type SeoItem,
  type SeoStatus,
} from "@cofounderai/module-discovery/lib/marketing/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { createSeoItemAction, setSeoItemStatusAction } from "../actions";
import { marketingContext } from "../context";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";

const STATUS_LABEL: Record<SeoStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  dismissed: "Dismissed",
};
const NEXT_STATUS: Record<SeoStatus, SeoStatus[]> = {
  open: ["in_progress", "resolved", "dismissed"],
  in_progress: ["resolved", "open", "dismissed"],
  resolved: ["open"],
  dismissed: ["open"],
};

/**
 * MKT-12/MKT-13 — Website & SEO (§16). Reads the existing website crawl through its own
 * queries (the crawl stays the system of record, §16) and shows only what it actually
 * collected: which pages were fetched and when, and what offerings they evidenced. It
 * does not collect titles, meta descriptions or word counts, so those are not shown —
 * the page says so instead of inventing them. Opportunities and AI-search observations
 * are logged with their evidence; none of this claims a ranking.
 */
export default async function WebsiteSeoPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, canManage } = await marketingContext(businessSlug);
  const statusFilter = (SEO_STATUSES as readonly string[]).includes(String(sp.status)) ? (sp.status as SeoStatus) : "active";

  const [business, run, items] = await Promise.all([
    getBusiness(businessId),
    getLatestWebsiteOnboardingRun(businessId),
    listSeoItems(businessId, statusFilter),
  ]);
  const [pages, candidates] = run
    ? await Promise.all([listWebsiteOnboardingPages(run.id), listWebsiteOnboardingOfferingCandidates(run.id)])
    : [[], []];
  const fetched = pages.filter((p) => p.status === "succeeded");
  const failed = pages.filter((p) => p.status === "failed");
  const byCategory = new Map<string, number>();
  for (const p of fetched) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);

  const opportunities = items.filter((i) => i.category !== "ai_search_visibility");
  const observations = items.filter((i) => i.category === "ai_search_visibility");
  const openCount = opportunities.filter((i) => i.status === "open" || i.status === "in_progress").length;
  const highCount = opportunities.filter((i) => i.severity === "high").length;

  return (
    <>
      <PageHeader
        title="Website & SEO"
        description="What the website crawl found, and the improvements you are tracking."
        actions={<ExportMenu exportId="marketing.website-seo" businessSlug={businessSlug} params={sp} kind="report" />}
      />

      {/* DISC-NAV-P0-01.5: each part of the page is a section folded behind a chevron; the
          website opens first. The count of open opportunities is in their section's summary. */}
      <SectionFold title="Website" hint={business?.website ? `${business.website}${run ? ` · last crawl ${(run.completed_at ?? run.created_at).slice(0, 10)}` : " · not crawled yet"}` : "No website set"} open>
        <p className="text-sm text-muted-foreground">{business?.website ? (
                <a href={business.website} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                  {business.website}
                </a>
              ) : (
                <>
                  No website set. <Link href={`/${businessSlug}/business`} className="text-primary hover:underline">Add one on the Business page</Link>.
                </>
              )}</p>
        <div className="flex flex-col gap-4 text-sm">
            {!run ? (
              <p className="text-muted-foreground">The website has not been crawled yet. The crawl runs from the Business page.</p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Last crawl" value={(run.completed_at ?? run.created_at).slice(0, 10)} />
                  <Stat label="Pages fetched" value={String(fetched.length)} />
                  <Stat label="Pages that failed" value={String(failed.length)} />
                  <Stat label="Offerings evidenced" value={String(candidates.length)} />
                </dl>
                {byCategory.size > 0 ? (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Pages by type</p>
                    <ul className="flex flex-wrap gap-2">
                      {[...byCategory.entries()].map(([cat, n]) => (
                        <li key={cat} className="rounded-md border px-2 py-0.5 text-xs">
                          {WEBSITE_PAGE_CATEGORY_LABEL[cat as keyof typeof WEBSITE_PAGE_CATEGORY_LABEL] ?? cat} · {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {candidates.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Offerings the site talks about</p>
                    <p>{candidates.map((c) => c.name).join(", ")}</p>
                  </div>
                ) : null}
                <details>
                  <summary className="cursor-pointer text-xs font-medium">Page inventory ({pages.length})</summary>
                  <ul className="mt-2 flex flex-col gap-1 text-xs">
                    {pages.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.url}</span>
                        <span className={p.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                          {p.status === "failed" ? "failed" : WEBSITE_PAGE_CATEGORY_LABEL[p.category] ?? p.category} · {p.fetched_at.slice(0, 10)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    The crawl records which pages it fetched and what they say about your offerings. It does not collect page
                    titles, meta descriptions, canonicals or word counts, so those are not shown here.
                  </p>
                </details>
              </>
            )}
          </div>
      </SectionFold>

      <div className="max-w-xs">
        <UrlSelect
          name="status"
          label="Show"
          value={statusFilter}
          options={[{ value: "active", label: "Open and in progress" }, ...SEO_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionFold title="SEO opportunities" hint={`${openCount} open · ${highCount} high severity`}>
            <ItemList items={opportunities} businessId={businessId} canManage={canManage} />
            {canManage ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Log an opportunity</summary>
                <div className="mt-4">
                  <ActionForm action={createSeoItemAction.bind(null, businessId)} submitLabel="Add" resetOnSuccess>
                    <Field label="What is the issue?" htmlFor="seo-title">
                      <Input id="seo-title" name="title" required maxLength={300} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Category" htmlFor="seo-category">
                        <NativeSelect id="seo-category" name="category" defaultValue="metadata">
                          {SEO_CATEGORIES.filter((c) => c !== "ai_search_visibility").map((c) => (
                            <option key={c} value={c}>
                              {SEO_CATEGORY_LABEL[c]}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label="Severity" htmlFor="seo-severity">
                        <NativeSelect id="seo-severity" name="severity" defaultValue="medium">
                          {SEO_SEVERITIES.map((s) => (
                            <option key={s} value={s} className="capitalize">
                              {s}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    </div>
                    <Field label="Page" htmlFor="seo-page">
                      <Input id="seo-page" name="pageUrl" type="url" placeholder="https://" />
                    </Field>
                    <Field label="What you observed" htmlFor="seo-evidence">
                      <Textarea id="seo-evidence" name="evidenceNote" rows={2} />
                    </Field>
                    <Field label="Recommended action" htmlFor="seo-action">
                      <Input id="seo-action" name="recommendedAction" maxLength={2000} />
                    </Field>
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </SectionFold>
        <SectionFold title="AI search visibility" hint={`${observations.length} observation${observations.length === 1 ? "" : "s"}`}>
          <p className="text-sm text-muted-foreground">What an AI assistant answered when asked a buyer&apos;s question, and whether you appeared. An observation on one
              day, not a ranking.</p>
            <ItemList items={observations} businessId={businessId} canManage={canManage} />
            {canManage ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Log an observation</summary>
                <div className="mt-4">
                  <ActionForm action={createSeoItemAction.bind(null, businessId)} submitLabel="Add" resetOnSuccess>
                    <input type="hidden" name="category" value="ai_search_visibility" />
                    <Field label="Question asked" htmlFor="ai-query">
                      <Input id="ai-query" name="query" required maxLength={1000} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Assistant / engine" htmlFor="ai-engine">
                        <Input id="ai-engine" name="engine" maxLength={100} placeholder="ChatGPT, Perplexity..." />
                      </Field>
                      <Field label="Did you appear?" htmlFor="ai-appears">
                        <NativeSelect id="ai-appears" name="companyAppears" defaultValue="">
                          <option value="">Not sure</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </NativeSelect>
                      </Field>
                    </div>
                    <Field label="Summary" htmlFor="ai-title" hint="A one-line takeaway.">
                      <Input id="ai-title" name="title" required maxLength={300} />
                    </Field>
                    <Field label="What it answered" htmlFor="ai-answer">
                      <Textarea id="ai-answer" name="observedAnswer" rows={3} />
                    </Field>
                    <Field label="Sources it cited" htmlFor="ai-cited" hint="One link per line.">
                      <Textarea id="ai-cited" name="citedUrls" rows={2} />
                    </Field>
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </SectionFold>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ItemList({ items, businessId, canManage }: { items: SeoItem[]; businessId: string; canManage: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing here.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const e = item.evidence as {
          note?: string;
          query?: string;
          engine?: string;
          observedAnswer?: string;
          companyAppears?: boolean;
          citedUrls?: string[];
        };
        return (
          <li key={item.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium">{item.title}</p>
              <div className="flex gap-1">
                <StatusBadge status={item.severity} tone={item.severity === "high" ? "destructive" : item.severity === "medium" ? "warning" : "secondary"} />
                <StatusBadge status={item.status} label={STATUS_LABEL[item.status]} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {SEO_CATEGORY_LABEL[item.category]} · {item.source === "manual" ? "logged by a person" : item.source}
              {item.observedAt ? ` · ${item.observedAt.slice(0, 10)}` : ""}
              {item.pageUrl ? ` · ${item.pageUrl}` : ""}
            </p>
            {e.query ? (
              <p className="mt-1 text-xs">
                “{e.query}”{e.engine ? ` on ${e.engine}` : ""} —{" "}
                {e.companyAppears === true ? "you appeared" : e.companyAppears === false ? "you did not appear" : "appearance not recorded"}
              </p>
            ) : null}
            {e.note || e.observedAnswer || item.recommendedAction || (e.citedUrls?.length ?? 0) > 0 ? (
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Evidence</summary>
                {e.note ? <p className="mt-1 whitespace-pre-wrap">{e.note}</p> : null}
                {e.observedAnswer ? <p className="mt-1 whitespace-pre-wrap">{e.observedAnswer}</p> : null}
                {e.citedUrls?.length ? <p className="mt-1 break-all">Cited: {e.citedUrls.join(", ")}</p> : null}
                {item.recommendedAction ? <p className="mt-1">Suggested: {item.recommendedAction}</p> : null}
              </details>
            ) : null}
            {canManage ? (
              <div className="mt-2">
                <TransitionButtons
                  action={setSeoItemStatusAction.bind(null, businessId, item.id)}
                  targets={NEXT_STATUS[item.status]}
                  labels={{ in_progress: "Start", resolved: "Resolve", dismissed: "Dismiss", open: "Reopen" }}
                  fieldName="status"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { listCampaigns, listContent, listScheduledContent } from "@cofounderai/module-discovery/lib/marketing/queries";
import { monthWindow } from "@cofounderai/module-discovery/lib/marketing/period";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABEL,
  CONTENT_TYPES,
  CONTENT_TYPE_LABEL,
  type ContentStatus,
  type ContentType,
} from "@cofounderai/module-discovery/lib/marketing/types";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { ContentStatusBadge } from "@cofounderai/module-discovery/components/marketing/status";
import { ContentCalendar } from "@cofounderai/module-discovery/components/marketing/content-calendar";
import { marketingContext } from "../context";
import { Fold } from "@cofounderai/core/ui/fold";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import AssetsPage from "../assets/page";

/** MKT-08/MKT-10 — Content: a list, or a month calendar (§15), chosen with `?view=`. */
export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canManage } = await marketingContext(businessSlug);
  const view = sp.view === "calendar" ? "calendar" : "list";
  const status = (CONTENT_STATUSES as readonly string[]).includes(String(sp.status)) ? (sp.status as ContentStatus) : "all";
  const contentType = (CONTENT_TYPES as readonly string[]).includes(String(sp.type)) ? (sp.type as ContentType) : "all";
  const campaignId = typeof sp.campaign === "string" && sp.campaign ? sp.campaign : undefined;
  const activeFilters = [status !== "all", contentType !== "all", Boolean(campaignId)].filter(Boolean).length;

  const campaigns = await listCampaigns(businessId, { status: "all" });
  const viewHref = (v: string) => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string" && k !== "view") next.set(k, val);
    next.set("view", v);
    return `${root}/content?${next.toString()}`;
  };

  const header = (
    <PageHeader
      title="Content"
      description="Plan, draft, review and schedule. Publishing is always a deliberate action by a person."
      actions={
        <>
          <ExportMenu exportId="marketing.content" businessSlug={businessSlug} params={sp} />
          {canManage ? (
            <Button asChild size="sm">
              <Link href={`${root}/content/new`}>
                <Plus className="size-4" aria-hidden="true" /> Create content
              </Link>
            </Button>
          ) : null}
        </>
      }
    />
  );

  const toggle = (
    <div className="inline-flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="View">
      {(["list", "calendar"] as const).map((v) => (
        <Link
          key={v}
          href={viewHref(v)}
          role="tab"
          aria-selected={view === v}
          className={`rounded-md px-3 py-1 capitalize ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {v}
        </Link>
      ))}
    </div>
  );

  if (view === "calendar") {
    const win = monthWindow(sp.month);
    let items = await listScheduledContent(businessId, { from: `${win.from}T00:00:00Z`, to: `${win.to}T23:59:59Z` });
    if (status !== "all") items = items.filter((c) => c.status === status);
    if (contentType !== "all") items = items.filter((c) => c.contentType === contentType);
    if (campaignId) items = items.filter((c) => c.campaignId === campaignId);
    const monthHref = (month: string) => {
      const next = new URLSearchParams();
      for (const [k, val] of Object.entries(sp)) if (typeof val === "string") next.set(k, val);
      next.set("month", month);
      return `${root}/content?${next.toString()}`;
    };
    const label = new Date(`${win.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    return (
      <>
        {header}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {toggle}
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" aria-label="Previous month">
              <Link href={monthHref(win.previous)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">{label}</span>
            <Button asChild variant="outline" size="sm" aria-label="Next month">
              <Link href={monthHref(win.next)}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
        <Fold label="Filters" count={activeFilters} defaultOpen={activeFilters > 0}>
          <Fold label="Filters" count={activeFilters} defaultOpen={activeFilters > 0}>
        <Filters status={status} contentType={contentType} campaignId={campaignId} campaigns={campaigns} />
      </Fold>
        </Fold>
        <Card>
          <CardContent className="pt-6">
            <ContentCalendar month={win.month} items={items} root={root} />
          </CardContent>
        </Card>
        {/* DISC-NAV-P0-01.5: Assets is a section of Content, folded below it. */}
        <SectionFold id="assets" title="Assets" hint="Images, documents and brand files for your content">
          <AssetsPage params={params} />
        </SectionFold>
      </>
    );
  }

  const content = await listContent(businessId, { status, contentType, campaignId });
  return (
    <>
      {header}
      {toggle}
      <Fold label="Filters" count={activeFilters} defaultOpen={activeFilters > 0}>
        <Filters status={status} contentType={contentType} campaignId={campaignId} campaigns={campaigns} />
      </Fold>
      <Card>
        <CardContent className="pt-6">
          {content.length === 0 ? (
            <EmptyState icon={FileText} message={status === "all" && contentType === "all" && !campaignId ? "No content yet." : "No content matches these filters."} />
          ) : (
            <ul className="divide-y">
              {content.map((c) => (
                <li key={c.id}>
                  <Link href={`${root}/content/${c.id}`} className="flex flex-col gap-1 py-3 hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {CONTENT_TYPE_LABEL[c.contentType]}
                        {c.campaignName ? ` · ${c.campaignName}` : ""}
                        {c.scheduledAt ? ` · scheduled ${new Date(c.scheduledAt).toLocaleString("en-IN")}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Updated {c.updatedAt.slice(0, 10)}</span>
                      <ContentStatusBadge status={c.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {/* DISC-NAV-P0-01.5: Assets is a section of Content, folded below it. */}
      <SectionFold id="assets" title="Assets" hint="Images, documents and brand files for your content">
        <AssetsPage params={params} />
      </SectionFold>
    </>
  );
}

function Filters({
  status,
  contentType,
  campaignId,
  campaigns,
}: {
  status: string;
  contentType: string;
  campaignId?: string;
  campaigns: { id: string; name: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <UrlSelect
        name="status"
        label="Status"
        value={status}
        options={[{ value: "all", label: "All but archived" }, ...CONTENT_STATUSES.map((s) => ({ value: s, label: CONTENT_STATUS_LABEL[s] }))]}
      />
      <UrlSelect
        name="type"
        label="Type"
        value={contentType}
        options={[{ value: "all", label: "All types" }, ...CONTENT_TYPES.map((t) => ({ value: t, label: CONTENT_TYPE_LABEL[t] }))]}
      />
      <UrlSelect
        name="campaign"
        label="Campaign"
        value={campaignId ?? ""}
        options={[{ value: "", label: "All campaigns" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
      />
    </div>
  );
}

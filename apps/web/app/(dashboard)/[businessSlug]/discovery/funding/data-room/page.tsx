import { FolderLock } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { dataRoomSignedUrls, listDataRoomItems, listInvestors, listRounds, listShares } from "@cofounderai/module-discovery/lib/funding/queries";
import { dataRoomSummary } from "@cofounderai/module-discovery/lib/funding/metrics";
import { MAX_DATA_ROOM_BYTES } from "@cofounderai/module-discovery/lib/funding/files";
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS } from "@cofounderai/module-discovery/lib/funding/schemas";
import {
  DATA_ROOM_CATEGORIES,
  DATA_ROOM_CATEGORY_LABEL,
  SENSITIVITIES,
  SENSITIVITY_LABEL,
  type DataRoomItem,
  type DataRoomShare,
} from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { DataRoomBadge } from "@cofounderai/module-discovery/components/funding/status";
import {
  addStandardDataRoomAction,
  createPlaceholderAction,
  deleteDataRoomAction,
  revokeShareAction,
  setDataRoomStatusAction,
  shareDataRoomAction,
  uploadDataRoomAction,
} from "../actions";
import { fundingContext } from "../context";
import { SectionFold } from "@cofounderai/module-discovery/components/ui/section-fold";
import DiligencePage from "../due-diligence/page";

function size(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * FND-12 — Data room (§29). Files live in the platform's private attachment storage;
 * replacing one creates a new version and leaves the old one (and anything already
 * shared) intact. Sharing is explicit, per investor or address, expiring and revocable,
 * needs funding.approve, and every open of a link is recorded.
 */
export default async function DataRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessSlug } = await params;
  const { businessId, canView, canManage, canApprove } = await fundingContext(businessSlug);
  if (!canView) return null;
  const [all, shares, investors, rounds] = await Promise.all([
    listDataRoomItems(businessId, { includeSuperseded: true }),
    listShares(businessId),
    listInvestors(businessId),
    listRounds(businessId),
  ]);
  const current = all.filter((i) => i.isCurrent);
  const urls = await dataRoomSignedUrls(all);
  const renderedAtDate = new Date();
  const renderedAt = renderedAtDate.getTime();
  const summary = dataRoomSummary(all, shares, renderedAtDate);
  const groups = DATA_ROOM_CATEGORIES.map((c) => ({ category: c, items: current.filter((i) => i.category === c) })).filter((g) => g.items.length > 0);
  const olderVersions = (item: DataRoomItem) => {
    const chain: DataRoomItem[] = [];
    let prev = item.supersedesId;
    while (prev) {
      const found = all.find((i) => i.id === prev);
      if (!found) break;
      chain.push(found);
      prev = found.supersedesId;
    }
    return chain;
  };

  return (
    <>
      <PageHeader
        title="Data room"
        description="Documents investors ask for, kept private until you share them."
        actions={
          <>
            <ExportMenu exportId="funding.data-room" businessSlug={businessSlug} kind="report" />
            {canManage ? <ActionForm action={addStandardDataRoomAction.bind(null, businessId)} inline submitLabel="Add standard checklist" variant="outline" /> : null}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Ready" value={summary.ready} />
        <Tile label="Draft" value={summary.draft} />
        <Tile label="Missing" value={summary.missing} />
        <Tile label="Live share links" value={summary.activeShares} />
        <Tile label="Times opened" value={summary.accessEvents} />
      </section>

      {current.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={FolderLock} message="The data room is empty. Add the standard checklist, or upload a document." />
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.category}>
            <CardHeader>
              <CardTitle>{DATA_ROOM_CATEGORY_LABEL[group.category]}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {group.items.map((item) => (
                  <DocumentRow
                    key={item.id}
                    item={item}
                    url={urls.get(item.id) ?? null}
                    older={olderVersions(item)}
                    olderUrls={urls}
                    shares={shares.filter((s) => olderVersions(item).some((o) => o.id === s.dataRoomItemId) || s.dataRoomItemId === item.id)}
                    investors={investors}
                    businessId={businessId}
                    canManage={canManage}
                    canApprove={canApprove}
                    now={renderedAt}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      {canManage ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upload a document</CardTitle>
              <CardDescription>PDF, Word, Excel, PowerPoint, CSV or images up to {MAX_DATA_ROOM_BYTES / (1024 * 1024)} MB.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={uploadDataRoomAction.bind(null, businessId)} submitLabel="Upload" pendingText="Uploading..." resetOnSuccess encType="multipart/form-data">
                <Field label="File" htmlFor="dr-file">
                  <Input id="dr-file" name="file" type="file" required />
                </Field>
                <DocumentMetaFields rounds={rounds} prefix="up" />
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Add a placeholder</CardTitle>
              <CardDescription>A document you still need to prepare.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={createPlaceholderAction.bind(null, businessId)} submitLabel="Add" resetOnSuccess>
                <DocumentMetaFields rounds={rounds} prefix="ph" nameRequired />
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {/* DISC-NAV-P0-01.6: Due diligence is a section of the Data room tab. */}
      <SectionFold id="due-diligence" title="Due diligence" hint="Investors' requests and their status">
        <DiligencePage params={params} searchParams={searchParams} />
      </SectionFold>
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DocumentMetaFields({ rounds, prefix, nameRequired }: { rounds: { id: string; name: string }[]; prefix: string; nameRequired?: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${prefix}-name`} hint={nameRequired ? undefined : "Defaults to the file name."}>
          <Input id={`${prefix}-name`} name="name" required={nameRequired} maxLength={300} />
        </Field>
        <Field label="Category" htmlFor={`${prefix}-cat`}>
          <NativeSelect id={`${prefix}-cat`} name="category" defaultValue="fundraising">
            {DATA_ROOM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DATA_ROOM_CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Sensitivity" htmlFor={`${prefix}-sens`}>
          <NativeSelect id={`${prefix}-sens`} name="sensitivity" defaultValue="confidential">
            {SENSITIVITIES.map((s) => (
              <option key={s} value={s}>
                {SENSITIVITY_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Round" htmlFor={`${prefix}-round`}>
          <NativeSelect id={`${prefix}-round`} name="roundId" defaultValue="">
            <option value="">Any round</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Description" htmlFor={`${prefix}-desc`}>
        <Input id={`${prefix}-desc`} name="description" maxLength={2000} />
      </Field>
    </>
  );
}

function DocumentRow({
  item,
  url,
  older,
  olderUrls,
  shares,
  investors,
  businessId,
  canManage,
  canApprove,
  now,
}: {
  item: DataRoomItem;
  url: string | null;
  older: DataRoomItem[];
  olderUrls: Map<string, string>;
  shares: DataRoomShare[];
  investors: { id: string; name: string }[];
  businessId: string;
  canManage: boolean;
  canApprove: boolean;
  /** Render time, taken once by the page, so every row judges expiry against the same instant. */
  now: number;
}) {
  const statusMoves = item.attachmentId
    ? (["draft", "ready", "expired"] as const).filter((s) => s !== item.status && !(s === "draft" && item.status === "shared"))
    : [];
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {item.name} {item.version > 1 ? <span className="text-xs text-muted-foreground">v{item.version}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {SENSITIVITY_LABEL[item.sensitivity]}
            {item.fileName ? ` · ${item.fileName} ${size(item.sizeBytes)}` : ""}
            {url ? (
              <>
                {" · "}
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Open
                </a>
              </>
            ) : null}
          </p>
        </div>
        <DataRoomBadge status={item.status} />
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-start gap-2">
          <TransitionButtons
            action={setDataRoomStatusAction.bind(null, businessId, item.id)}
            targets={statusMoves}
            labels={{ draft: "Back to draft", ready: "Mark ready", expired: "Mark expired" }}
            destructive={["expired"]}
          />
          <details className="w-full">
            <summary className="cursor-pointer text-xs text-muted-foreground">{item.attachmentId ? "Upload a new version" : "Upload the file"}</summary>
            <div className="mt-2">
              <ActionForm action={uploadDataRoomAction.bind(null, businessId)} submitLabel="Upload" size="sm" resetOnSuccess encType="multipart/form-data">
                <input type="hidden" name="itemId" value={item.id} />
                <Input name="file" type="file" required aria-label="File" />
              </ActionForm>
            </div>
          </details>
          {shares.length === 0 ? (
            <ActionForm
              action={deleteDataRoomAction.bind(null, businessId, item.id)}
              inline
              submitLabel="Remove"
              variant="ghost"
              confirm={`Remove ${item.name}${item.attachmentId ? " and its file" : ""}?`}
            />
          ) : null}
        </div>
      ) : null}

      {canApprove && (item.status === "ready" || item.status === "shared") ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Share</summary>
          <div className="mt-2">
            <ActionForm action={shareDataRoomAction.bind(null, businessId, item.id)} submitLabel="Create link" size="sm">
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Investor
                  <NativeSelect name="investorId" defaultValue="">
                    <option value="">—</option>
                    {investors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Or email
                  <Input name="recipientEmail" type="email" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Access
                  <NativeSelect name="permission" defaultValue="view">
                    <option value="view">View</option>
                    <option value="download">Download</option>
                  </NativeSelect>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Days valid
                  <Input name="days" type="number" min={1} max={MAX_SHARE_DAYS} defaultValue={DEFAULT_SHARE_DAYS} />
                </label>
              </div>
            </ActionForm>
          </div>
        </details>
      ) : null}

      {shares.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-xs">
          {shares.map((s) => {
            const live = !s.revokedAt && new Date(s.expiresAt).getTime() > now;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {s.investorName ?? s.recipientEmail} · {s.permission} · {live ? `until ${s.expiresAt.slice(0, 10)}` : s.revokedAt ? "revoked" : "expired"} · opened{" "}
                  {s.accessCount}×{s.lastAccessedAt ? ` (last ${new Date(s.lastAccessedAt).toLocaleDateString("en-IN")})` : ""}
                  {s.dataRoomItemId !== item.id ? " · earlier version" : ""}
                </span>
                {live && canApprove ? (
                  <ActionForm action={revokeShareAction.bind(null, businessId, s.id)} inline submitLabel="Revoke" variant="ghost" confirm="Revoke this link? It stops working immediately." />
                ) : (
                  <StatusBadge status={live ? "live" : "inactive"} tone={live ? "success" : "secondary"} />
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {older.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Earlier versions ({older.length})</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {older.map((o) => (
              <li key={o.id}>
                v{o.version} · {o.fileName ?? "no file"} · {o.updatedAt.slice(0, 10)}
                {olderUrls.get(o.id) ? (
                  <>
                    {" · "}
                    <a href={olderUrls.get(o.id)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Open
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

import type { ReactNode } from "react";
import {
  ALERT_THRESHOLDS,
  getHealthSnapshot,
  deriveComponents,
  type ComponentStatus,
  type HealthSnapshot,
  type QueueRow,
  type WindowCount,
} from "@cofounderai/core/admin/platform-health";
import { listOpsAlerts, type OpsAlertRow } from "@cofounderai/core/admin/platform-ops-alerts";
import { readReleaseInfo, type ReleaseInfo } from "@cofounderai/core/admin/platform-release";
import { Badge } from "@cofounderai/core/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmptyState, Panel, formatWhen } from "../billing/billing-ui";

/**
 * PLATFORM-P1-07.1 (System Health), PLATFORM-P1-07.2 (Error Rate), PLATFORM-P1-07.3 (Queue
 * Health) and PLATFORM-P1-07.4 (Operational Alerts), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §29, plus
 * PLATFORM-P1-08.1 (Platform Version, §30) in the Release panel. Read-only: every
 * figure comes from packages/core/src/admin/platform-health.ts, read live on each visit,
 * and anything the platform doesn't record says so instead of showing a number. Alerts come
 * from platform.ops_alerts, written by the daily /api/cron/ops-alerts run.
 */

const STATUS: Record<ComponentStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
  ok: { label: "OK", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  down: { label: "Down", variant: "destructive" },
  needs_setup: { label: "Needs setup", variant: "secondary" },
  not_in_use: { label: "Not in use", variant: "secondary" },
  unavailable: { label: "Unavailable", variant: "destructive" },
};

const ROW = "border-zinc-800 hover:bg-zinc-900/60";
const HEAD_ROW = "border-zinc-800 hover:bg-transparent";
const HEAD = "text-zinc-400";

function StatusBadge({ status }: { status: ComponentStatus }) {
  return (
    <Badge variant={STATUS[status].variant} className="whitespace-nowrap">
      {STATUS[status].label}
    </Badge>
  );
}

function ratio(w: WindowCount): string {
  return w.total === null ? String(w.failed) : `${w.failed} of ${w.total}`;
}

type ErrorRow = { label: string; day: ReactNode; week: ReactNode; source: string };

function errorRows(s: HealthSnapshot): ErrorRow[] {
  return [
    { label: "AI runs failed", day: ratio(s.ai.last24h), week: ratio(s.ai.last7d), source: "core.ai_runs, discovery.ai_runs" },
    { label: "Billing webhooks failed", day: ratio(s.webhooks.last24h), week: ratio(s.webhooks.last7d), source: "platform.billing_events" },
    { label: "Outreach emails bounced or failed", day: s.email.failed24h, week: s.email.failed7d, source: "discovery.messages (Resend status webhook)" },
    { label: "WhatsApp connection errors", day: s.whatsapp.errors24h, week: s.whatsapp.errors7d, source: "Health checks in core.audit_log" },
    { label: "InvoiceNow transmissions failed", day: ratio(s.invoiceNow.last24h), week: ratio(s.invoiceNow.last7d), source: "gst.invoicenow_transmissions" },
    { label: "API requests rate-limited (429)", day: s.api.rateLimited24h, week: s.api.rateLimited7d, source: "core.api_rate_limit_counters" },
    { label: "Other API errors", day: "Not recorded", week: "Not recorded", source: "No request log exists" },
  ];
}

function count(value: number | null) {
  return value === null ? <span title="Not tracked for this queue">—</span> : value;
}

function AlertList({ alerts }: { alerts: OpsAlertRow[] }) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-800 text-sm">
      {alerts.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-2">
            <Badge variant={a.severity === "critical" ? "destructive" : "warning"} className="mt-0.5 whitespace-nowrap">
              {a.severity === "critical" ? "Critical" : "Warning"}
            </Badge>
            <span className="text-zinc-100">{a.message}</span>
          </div>
          <span className="shrink-0 text-xs text-zinc-500 sm:text-right">
            {a.resolvedAt ? `Resolved ${formatWhen(a.resolvedAt)}` : `Open since ${formatWhen(a.openedAt)}`}
            <br />
            {a.notifiedAt ? "Emailed to platform admins" : a.notifyError ? `Not emailed: ${a.notifyError}` : "Not emailed yet"}
          </span>
        </li>
      ))}
    </ul>
  );
}

const ENVIRONMENT: Record<ReleaseInfo["environment"], string> = {
  production: "Production",
  preview: "Preview",
  development: "Development",
  local: "Local (not on Vercel)",
};

function ReleasePanel({ release }: { release: ReleaseInfo }) {
  const missing = <span className="text-zinc-500">Not recorded</span>;
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "Version",
      value: release.version ? (
        <span>
          {release.commitUrl ? (
            <a href={release.commitUrl} target="_blank" rel="noreferrer" className="font-mono text-zinc-100 underline-offset-2 hover:underline">
              {release.version}
            </a>
          ) : (
            <span className="font-mono text-zinc-100">{release.version}</span>
          )}
          {release.branch ? <span className="text-zinc-500"> on {release.branch}</span> : null}
          {release.commitMessage ? <span className="block text-xs text-zinc-400">{release.commitMessage}</span> : null}
        </span>
      ) : (
        missing
      ),
    },
    {
      label: "Build",
      value: release.deploymentId || release.builtAt ? (
        <span>
          {release.deploymentId ? <span className="font-mono text-zinc-100">{release.deploymentId}</span> : null}
          {release.builtAt ? <span className="block text-xs text-zinc-400">Built {formatWhen(release.builtAt)}</span> : null}
        </span>
      ) : (
        missing
      ),
    },
    { label: "Deployment", value: release.deploymentUrl ? <span className="break-all text-zinc-100">{release.deploymentUrl}</span> : missing },
    { label: "Environment", value: <span className="text-zinc-100">{ENVIRONMENT[release.environment]}</span> },
  ];
  return (
    <Panel title="Release">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-zinc-500">{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export default async function SystemHealthPage() {
  const [snapshot, alerts] = await Promise.all([getHealthSnapshot(), listOpsAlerts()]);
  const components = deriveComponents(snapshot);
  const open = alerts.filter((a) => !a.resolvedAt);
  const resolved = alerts.filter((a) => a.resolvedAt);
  const errors = errorRows(snapshot);
  // WONDERARK_BUILT_AT is inlined by next.config.ts only where it is read literally.
  const release = readReleaseInfo({ ...process.env, WONDERARK_BUILT_AT: process.env.WONDERARK_BUILT_AT });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">System Health</h1>
        <p className="text-sm text-zinc-400">
          Checked {formatWhen(snapshot.checkedAt)}. Alerts are checked daily at 06:30 UTC and emailed to platform admins when they open.
        </p>
      </div>

      <Panel title="Alerts" description={open.length > 0 ? `${open.length} open` : undefined}>
        {open.length > 0 ? <AlertList alerts={open} /> : <EmptyState>No open alerts.</EmptyState>}
        {resolved.length > 0 ? (
          <Collapsible>
            <CollapsibleTrigger className="text-xs text-zinc-400 hover:text-zinc-200">Recently resolved ({resolved.length})</CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <AlertList alerts={resolved} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </Panel>

      <Panel title="Components">
        <ul className="flex flex-col divide-y divide-zinc-800 md:hidden">
          {components.map((c) => (
            <li key={c.key} className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-100">{c.label}</span>
                <StatusBadge status={c.status} />
              </div>
              <span className="text-xs text-zinc-400">{c.detail}</span>
            </li>
          ))}
        </ul>
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className={HEAD_ROW}>
              <TableHead className={HEAD}>Component</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={HEAD}>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((c) => (
              <TableRow key={c.key} className={ROW}>
                <TableCell className="font-medium text-zinc-100">{c.label}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-zinc-400">{c.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      {snapshot.database.ok ? (
        <>
          <Panel title="Errors">
            <ul className="flex flex-col divide-y divide-zinc-800 md:hidden">
              {errors.map((e) => (
                <li key={e.label} className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="font-medium text-zinc-100">{e.label}</span>
                  <span className="text-xs text-zinc-300">
                    24h: {e.day} · 7 days: {e.week}
                  </span>
                  <span className="text-xs text-zinc-500">{e.source}</span>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className={HEAD_ROW}>
                  <TableHead className={HEAD}>Signal</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Last 24h</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Last 7 days</TableHead>
                  <TableHead className={HEAD}>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e) => (
                  <TableRow key={e.label} className={ROW}>
                    <TableCell className="text-zinc-100">{e.label}</TableCell>
                    <TableCell className="text-right text-zinc-300">{e.day}</TableCell>
                    <TableCell className="text-right text-zinc-300">{e.week}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{e.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <Panel title="Queues" description="Failed = still retrying. Dead-letter = failed for good, needs a person.">
            <ul className="flex flex-col divide-y divide-zinc-800 md:hidden">
              {snapshot.queues.map((q: QueueRow) => (
                <li key={q.key} className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="font-medium text-zinc-100">{q.label}</span>
                  <span className="text-xs text-zinc-300">
                    Queued {q.queued} · Processing {count(q.processing)} · Failed {count(q.retrying)} · Dead-letter {q.deadLetter}
                  </span>
                  <span className="text-xs text-zinc-500">
                    Oldest waiting: {formatWhen(q.oldestWaitingAt)}
                    {q.note ? ` · ${q.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className={HEAD_ROW}>
                  <TableHead className={HEAD}>Queue</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Queued</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Processing</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Failed</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Dead-letter</TableHead>
                  <TableHead className={HEAD}>Oldest waiting</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.queues.map((q) => (
                  <TableRow key={q.key} className={ROW}>
                    <TableCell className="text-zinc-100">
                      {q.label}
                      {q.note ? <p className="text-xs text-zinc-500">{q.note}</p> : null}
                    </TableCell>
                    <TableCell className="text-right text-zinc-300">{q.queued}</TableCell>
                    <TableCell className="text-right text-zinc-300">{count(q.processing)}</TableCell>
                    <TableCell className="text-right text-zinc-300">{count(q.retrying)}</TableCell>
                    <TableCell className={`text-right ${q.deadLetter > 0 ? "text-red-400" : "text-zinc-300"}`}>{q.deadLetter}</TableCell>
                    <TableCell className="text-zinc-400">{formatWhen(q.oldestWaitingAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      ) : null}

      <ReleasePanel release={release} />

      <Collapsible>
        <CollapsibleTrigger className="text-xs text-zinc-400 hover:text-zinc-200">Alert rules</CollapsibleTrigger>
        <CollapsibleContent className="pt-2 text-xs text-zinc-400">
          <ul className="list-disc space-y-1 pl-5">
            <li>Database unreachable (critical).</li>
            <li>A domain event waiting more than {ALERT_THRESHOLDS.domainEventOverdueHours}h: the daily drain isn&apos;t running (critical).</li>
            <li>Any billing webhook dead-lettered, or a provider webhook rejected in 24h (critical).</li>
            <li>A storage bucket missing (critical).</li>
            <li>Any domain event dead-lettered (warning).</li>
            <li>An export waiting more than {ALERT_THRESHOLDS.exportStuckHours}h (warning).</li>
            <li>
              {ALERT_THRESHOLDS.aiFailureRatePercent}% or more of AI runs failing in 24h, with at least {ALERT_THRESHOLDS.aiFailureMinRuns} runs (warning).
            </li>
            <li>A WhatsApp connection or an integration needing attention (warning).</li>
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

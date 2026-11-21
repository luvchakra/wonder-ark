import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { getPlatformKeysOverview, type PlatformKeyStatus } from "@cofounderai/core/admin/platform-keys";
import { PLATFORM_AI_KEY_ENV, PLATFORM_KEY_GROUP_LABEL, type PlatformKeyGroup } from "@cofounderai/core/admin/platform-key-registry";
import { ImportDialog } from "./import-dialog";
import { KeyDialog } from "./key-dialog";

/**
 * PLATFORM-P1-14.1/14.2 ("Platform Keys" / "Import from deployment").
 *
 * The platform's own keys and settings, set here instead of on the hosting dashboard: a
 * value saved here is encrypted, used within a minute without a redeploy, and every change
 * is recorded with a reason. The deployment's variable of the same name stays the fallback
 * until it is removed there.
 *
 * Layout (docs/design/claude-ui-design-rules.md, CLAUDE.md "Minimal UI"): one primary
 * action for the page (Import, shown only while the deployment holds something the
 * platform doesn't), one action a row (Set or Replace; Remove is inside its dialog), and
 * the variables that must stay in the deployment folded at the foot. Rows are stacked
 * cards at every width, so there is no table to adapt for a phone (principle 12).
 */
const GROUPS: PlatformKeyGroup[] = ["email", "prospect_data", "messaging"];

export default async function PlatformKeysPage() {
  const overview = await getPlatformKeysOverview();
  const removable = overview.keys.filter((key) => key.deploymentRedundant).map((key) => key.name);
  if (overview.ai.onPlatform && overview.ai.inDeployment) removable.push(PLATFORM_AI_KEY_ENV);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Keys</h1>
          <p className="text-sm text-zinc-400">
            The platform&apos;s own keys and settings. A value saved here is used instead of the deployment&apos;s variable, within
            a minute and without a redeploy.
          </p>
        </div>
        {overview.importable > 0 ? <ImportDialog count={overview.importable} /> : null}
      </div>

      {removable.length > 0 ? (
        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-sm text-emerald-200">
          <p className="font-medium">Saved here and still set in the deployment with the same value:</p>
          <p className="mt-1 break-words font-mono text-xs">{removable.join(", ")}</p>
          <p className="mt-1 text-emerald-300/80">These can be deleted from the hosting dashboard now. Nothing changes when they are.</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-300">AI</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 p-4">
          <div className="min-w-0">
            <p className="font-medium text-zinc-100">Platform AI key</p>
            <p className="text-xs text-zinc-500">
              What every business runs AI on until it connects its own key. Set, tested and rotated on AI Providers.
            </p>
            <div className="mt-2">
              {overview.ai.onPlatform ? (
                <Badge>On the platform</Badge>
              ) : overview.ai.inDeployment ? (
                <Badge variant="secondary">In the deployment only</Badge>
              ) : (
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                  Not set
                </Badge>
              )}
            </div>
          </div>
          <Link href="/platform/ai-providers" className="shrink-0 text-sm text-zinc-300 underline hover:text-zinc-50">
            AI Providers
          </Link>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-300">{PLATFORM_KEY_GROUP_LABEL[group]}</h2>
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
            {overview.keys
              .filter((key) => key.group === group)
              .map((key) => (
                <KeyRow key={key.name} status={key} />
              ))}
          </ul>
        </section>
      ))}

      <details className="group rounded-2xl border border-zinc-800 px-4">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-medium text-zinc-100">Stays in the deployment</span>
            <span className="block text-xs text-zinc-500">{overview.deploymentOnly.length} variables that cannot be moved here, and why</span>
          </span>
          <span className="text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <ul className="flex flex-col gap-3 border-t border-zinc-800 py-4 text-sm">
          {overview.deploymentOnly.map((variable) => (
            <li key={variable.name}>
              <p className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">{variable.name}</code>
                <span className={variable.set ? "text-xs text-zinc-400" : "text-xs text-amber-300"}>{variable.set ? "Set" : "Not set"}</span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{variable.reason}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function KeyRow({ status }: { status: PlatformKeyStatus }) {
  return (
    <li className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium text-zinc-100">{status.label}</p>
        <p className="text-xs text-zinc-500">{status.usedBy}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <StateBadge status={status} />
          {status.shown ? <span className="break-all font-mono text-zinc-400">{status.shown}</span> : null}
          {status.updatedAt ? <span className="text-zinc-500">· {new Date(status.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span> : null}
        </div>
      </div>
      <KeyDialog status={status} />
    </li>
  );
}

function StateBadge({ status }: { status: PlatformKeyStatus }) {
  if (status.state === "platform") return <Badge>{status.origin === "deployment" ? "On the platform · imported" : "On the platform"}</Badge>;
  if (status.state === "deployment") return <Badge variant="secondary">In the deployment only</Badge>;
  return (
    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
      Not set
    </Badge>
  );
}

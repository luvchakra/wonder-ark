import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getBusinessUsage } from "@cofounderai/module-discovery/lib/usage/queries";
import { creditsUsedPercent, OPERATION_LABEL } from "@cofounderai/module-discovery/lib/usage/format";
import { listLicensesForBusiness } from "@cofounderai/core/licensing/queries";
import { moduleRegistry, type ModuleKey } from "@cofounderai/module-registry";
import { ModuleAppIcon } from "@cofounderai/core/shell/module-icon";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";

/** Modules that record AI usage today -- `ai_runs` is still discovery's own
 * workspace-scoped ledger (core.ai_runs per ADR-3/6/7 hasn't been built yet, since no
 * other module calls an LLM at all), so every other licensed module shows an honest
 * "doesn't use AI yet" placeholder rather than a fabricated zero-with-a-breakdown. */
const AI_ENABLED_MODULES = new Set<ModuleKey>(["discovery"]);

export default async function BusinessUsagePage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [licenses, discoveryUsage] = await Promise.all([
    listLicensesForBusiness(businessId),
    getBusinessUsage(businessId),
  ]);
  const licensedModuleKeys = new Set(
    licenses.filter((l) => l.status === "active" || l.status === "grace").map((l) => l.module_key),
  );
  const licensedModules = moduleRegistry.filter((m) => licensedModuleKeys.has(m.key));

  const percent = creditsUsedPercent(discoveryUsage.totalCost);
  const periodLabel = new Date(discoveryUsage.periodStart).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <Breadcrumbs
        items={[{ label: business.name, href: `/${businessSlug}/business` }, { label: "AI usage" }]}
      />

      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">AI usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This month&apos;s AI usage for {business.name}, broken down by module.
        </p>
      </div>

      {licensedModules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No modules are licensed for this business yet.</p>
      ) : (
        licensedModules.map((module) => {
          const usesAi = AI_ENABLED_MODULES.has(module.key);
          return (
            <section key={module.key} className="flex flex-col gap-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ModuleAppIcon moduleKey={module.key} name={module.icon} />
                  <h2 className="font-medium">{module.name}</h2>
                </div>
                {usesAi ? <span className="text-sm text-muted-foreground">{periodLabel}</span> : null}
              </div>

              {!usesAi ? (
                <p className="text-sm text-muted-foreground">This module doesn&apos;t use AI features yet.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{percent}% of AI credits used</span>
                      <span className="text-muted-foreground">{discoveryUsage.totalRuns} runs</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                  </div>

                  {discoveryUsage.byOperation.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No AI usage yet this month.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {discoveryUsage.byOperation.map((op) => (
                        <li
                          key={op.operation}
                          className="flex items-center justify-between rounded-md border p-3 text-sm"
                        >
                          <span>{OPERATION_LABEL[op.operation] ?? op.operation}</span>
                          <span className="text-muted-foreground">
                            {op.runs} run{op.runs === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}

import { redirect } from "next/navigation";
import { getCurrentAccount, listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listLicensesForBusiness } from "@cofounderai/core/licensing/queries";
import type { License, LicenseStatus } from "@cofounderai/core/licensing/types";
import { moduleRegistry } from "@cofounderai/module-registry";
import { ModuleAppIcon } from "@cofounderai/core/shell/module-icon";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Button } from "@cofounderai/core/ui/button";
import { activateModuleAction, cancelModuleAction } from "./actions";

function graceDaysLeft(graceEndsAt: string | null): number {
  if (!graceEndsAt) return 0;
  const ms = new Date(graceEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** `cancelAt` set + status still 'active' is the new "cancellation pending" state --
 * full access continues right up to that date (see lifecycle.ts's cancelLicense() doc
 * comment), so it gets its own badge distinct from plain "Active" or the read-only
 * "Grace period" one. */
function StatusBadge({
  status,
  graceEndsAt,
  cancelAt,
}: {
  status: LicenseStatus | null;
  graceEndsAt: string | null;
  cancelAt: string | null;
}) {
  if (status === "active" && cancelAt) {
    return <Badge variant="outline">Cancels {formatDate(cancelAt)}</Badge>;
  }
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "grace") {
    return <Badge variant="destructive">Grace · {graceDaysLeft(graceEndsAt)}d left</Badge>;
  }
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
  return <Badge variant="outline">Not licensed</Badge>;
}

export default async function LicensesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const businesses = await listBusinesses(account.id);
  const licensesByBusiness = await Promise.all(
    businesses.map((business) => listLicensesForBusiness(business.id)),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Licenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage which modules are active for each of your businesses. Cancelling keeps
          full access until your next billing cycle, then starts a 30-day read-only
          grace period before data access is denied -- your data itself is never
          deleted, and reactivating at any point (before or after that date) restores
          everything.
        </p>
      </div>

      {notice ? (
        <p role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          {notice.slice(0, 300)}
        </p>
      ) : null}

      {businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a business first to manage its module licenses.
        </p>
      ) : (
        businesses.map((business, i) => {
          const licenses = licensesByBusiness[i] ?? [];
          const licenseByModule = new Map<string, License>(licenses.map((l) => [l.module_key, l]));

          return (
            <section key={business.id} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{business.name}</h2>
              <div className="flex flex-col divide-y rounded-md border">
                {moduleRegistry.map((module) => {
                  const license = licenseByModule.get(module.key) ?? null;
                  const pendingCancellation = license?.status === "active" && Boolean(license.cancel_at);
                  const isActiveOrGrace = license?.status === "active" || license?.status === "grace";

                  return (
                    <div key={module.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <ModuleAppIcon moduleKey={module.key} name={module.icon} />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{module.name}</span>
                            <StatusBadge
                              status={license?.status ?? null}
                              graceEndsAt={license?.grace_ends_at ?? null}
                              cancelAt={license?.cancel_at ?? null}
                            />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {module.features.join(" · ")}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {pendingCancellation ? (
                          <form action={activateModuleAction.bind(null, business.id, module.key)}>
                            <SubmitButton variant="outline" size="sm" pendingText="Undoing...">
                              Undo cancellation
                            </SubmitButton>
                          </form>
                        ) : isActiveOrGrace ? (
                          license?.status === "grace" ? (
                            <form action={activateModuleAction.bind(null, business.id, module.key)}>
                              <SubmitButton size="sm" pendingText="Reactivating...">
                                Reactivate
                              </SubmitButton>
                            </form>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm">
                                  Cancel
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel {module.name} for {business.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    You&apos;ll keep full access through the end of your current billing
                                    cycle. After that, a 30-day read-only grace period starts, then full
                                    access is denied. Your data is retained the whole time -- you can undo
                                    this or reactivate at any point, before or after.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep it active</AlertDialogCancel>
                                  <form action={cancelModuleAction.bind(null, business.id, module.key)}>
                                    <AlertDialogAction asChild>
                                      <SubmitButton variant="destructive" size="sm" pendingText="Cancelling...">
                                        Cancel license
                                      </SubmitButton>
                                    </AlertDialogAction>
                                  </form>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )
                        ) : (
                          <form action={activateModuleAction.bind(null, business.id, module.key)}>
                            <SubmitButton size="sm" pendingText="Activating...">
                              {license ? "Reactivate" : "Activate"}
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}

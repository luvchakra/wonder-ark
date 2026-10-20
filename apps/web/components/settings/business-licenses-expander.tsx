"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { moduleRegistry } from "@cofounderai/module-registry";
import { ModuleAppIcon } from "@cofounderai/core/shell/module-icon";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
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
import type { License, LicenseStatus, ModuleKey } from "@cofounderai/core/licensing/types";

function graceDaysLeft(graceEndsAt: string | null): number {
  if (!graceEndsAt) return 0;
  const ms = new Date(graceEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Mirrors the standalone Licenses page's own StatusBadge (settings/licenses/page.tsx) --
 * same statuses, same wording, so a business's license state reads identically whether
 * you're looking at it here (inline, one business) or there (the full list). */
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

/**
 * The "Licenses" chip on the Business Configurations hub (settings/page.tsx) expands this
 * inline instead of navigating away -- every module for this one business, with the same
 * activate/cancel controls as the standalone /dashboard/settings/licenses page, so a
 * founder can turn a module on for a business without leaving the list they're already
 * scanning. activateAction/cancelAction are the same two Server Actions that page uses
 * (settings/licenses/actions.ts) -- bound here per-module instead of per-page.
 */
export function BusinessLicensesExpander({
  businessId,
  businessName,
  licenses,
  graceDays,
  activateAction,
  cancelAction,
}: {
  businessId: string;
  businessName: string;
  licenses: License[];
  /** The read-only period a cancelled licence gets (PLATFORM-P1-04.3), at least 30 days. */
  graceDays: number;
  activateAction: (businessId: string, moduleKey: ModuleKey) => Promise<void>;
  cancelAction: (businessId: string, moduleKey: ModuleKey) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const licenseByModule = new Map<string, License>(licenses.map((l) => [l.module_key, l]));

  return (
    <div className={`flex flex-col gap-2 ${open ? "w-full" : ""}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="h-auto gap-1 rounded-md border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
      >
        <ShieldCheck className="size-3" aria-hidden="true" />
        Licenses
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </Button>

      {open ? (
        <div className="flex flex-col divide-y rounded-md border">
          {moduleRegistry.map((module) => {
            const license = licenseByModule.get(module.key) ?? null;
            const moduleKey = module.key as ModuleKey;
            const pendingCancellation = license?.status === "active" && Boolean(license.cancel_at);
            const isActiveOrGrace = license?.status === "active" || license?.status === "grace";

            return (
              // Name gets a fixed width instead of hugging its own text -- "CRM" and
              // "Compliance" are very different lengths, and letting the badge sit
              // right after each name (the previous layout) meant it landed in a
              // different horizontal spot on every row. A fixed name column puts every
              // badge at the same start position instead.
              <div key={module.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <ModuleAppIcon moduleKey={module.key} name={module.icon} />
                <span className="w-24 shrink-0 text-sm font-medium">{module.name}</span>
                <div className="min-w-[6.5rem] shrink-0">
                  <StatusBadge
                    status={license?.status ?? null}
                    graceEndsAt={license?.grace_ends_at ?? null}
                    cancelAt={license?.cancel_at ?? null}
                  />
                </div>

                <div className="ml-auto shrink-0">
                  {pendingCancellation ? (
                    <form action={activateAction.bind(null, businessId, moduleKey)}>
                      <SubmitButton variant="outline" size="sm" pendingText="Undoing...">
                        Undo cancellation
                      </SubmitButton>
                    </form>
                  ) : isActiveOrGrace ? (
                    license?.status === "grace" ? (
                      <form action={activateAction.bind(null, businessId, moduleKey)}>
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
                            <AlertDialogTitle>Cancel {module.name} for {businessName}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              You&apos;ll keep full access through the end of your current billing
                              cycle. After that, a {graceDays}-day read-only grace period starts, then full
                              access is denied. Your data is retained the whole time -- you can undo
                              this or reactivate at any point, before or after.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it active</AlertDialogCancel>
                            <form action={cancelAction.bind(null, businessId, moduleKey)}>
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
                    <form action={activateAction.bind(null, businessId, moduleKey)}>
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
      ) : null}
    </div>
  );
}

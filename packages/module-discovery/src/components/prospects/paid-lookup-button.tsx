"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@cofounderai/core/ui/alert-dialog";
import type { LookupQuotaState, LookupState } from "../../lib/data-sources/types";

/** "46 of 50 paid lookups left this month." -- only what the gateway reported. */
export function quotaLine(quota: LookupQuotaState): string {
  return quota.state === "ok"
    ? `${quota.paid.remaining} of ${quota.paid.limit} paid lookups left this ${quota.period}.`
    : quota.message;
}

/**
 * DISC-DATA-P0-04.1/04.2: one button for a lookup that spends the business's paid
 * lookups ("Fill missing details", "Find contacts"). Pressing it asks nothing of a
 * source. It opens a confirmation that says what the lookup does and how many paid
 * lookups are left, read from the gateway at that moment; only "confirm" runs it. The
 * confirm button is off while that is being read, when it cannot be read, and when none
 * are left, and stays off while the lookup runs, so one confirmation is one request (the
 * server holds the same line with the click's own key).
 *
 * What happened is shown under the button, in the server's words: completed, or failed
 * with the reason. A failure is never worded as success.
 */
export function PaidLookupButton({
  label,
  title,
  description,
  confirmLabel,
  pendingText,
  quotaAction,
  runAction,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingText: string;
  quotaAction: () => Promise<LookupQuotaState>;
  runAction: () => Promise<LookupState>;
}) {
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState<LookupQuotaState | null>(null);
  const [result, setResult] = useState<LookupState>(null);
  const [loadingQuota, startQuota] = useTransition();
  const [running, startRun] = useTransition();

  function openDialog() {
    setQuota(null);
    setOpen(true);
    startQuota(async () => {
      try {
        setQuota(await quotaAction());
      } catch {
        setQuota({ state: "unavailable", message: "Unavailable: couldn't read how many paid lookups are left." });
      }
    });
  }

  function run() {
    startRun(async () => {
      try {
        setResult(await runAction());
      } catch {
        setResult({ status: "failed", message: "Something went wrong. Nothing was changed." });
      }
      setOpen(false);
    });
  }

  const canRun = quota?.state === "ok" && quota.paid.remaining > 0 && !running;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" size="sm" variant="outline" onClick={openDialog} disabled={running}>
        {label}
      </Button>
      {result ? (
        <p
          role={result.status === "failed" ? "alert" : "status"}
          className={result.status === "failed" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {result.message}
        </p>
      ) : null}

      <AlertDialog open={open} onOpenChange={(next) => (running ? undefined : setOpen(next))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm" aria-live="polite">
            {quota && !loadingQuota ? quotaLine(quota) : "Checking how many paid lookups are left…"}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
            <Button type="button" onClick={run} disabled={!canRun} aria-busy={running}>
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {pendingText}
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

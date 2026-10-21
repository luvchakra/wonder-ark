"use client";

import { startTransition, useActionState } from "react";
import { Loader2 } from "lucide-react";
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
import { formatCareerDate, type ApplicationStatus } from "@cofounderai/core/careers/format";
import { withdrawApplicationAction, type WithdrawState } from "../actions";

/**
 * PLATFORM-P1-13.1 -- the applicant's status, and Withdraw (with a confirmation) when
 * WonderJobs says it's still possible. Withdrawing posts the token to this app's own server
 * action; the status shown afterwards is what WonderJobs returned, not a guess.
 */
export function WithdrawForm({ token, application: initial }: { token: string; application: ApplicationStatus }) {
  const [state, dispatch, pending] = useActionState<WithdrawState, FormData>(withdrawApplicationAction, { status: "idle" });
  const application = state.status === "withdrawn" ? state.application : initial;

  function withdraw() {
    const form = new FormData();
    form.set("token", token);
    startTransition(() => dispatch(form));
  }

  const rows: [string, string | null][] = [
    ["Company", application.company],
    ["Status", application.statusLabel],
    ["Applied", formatCareerDate(application.appliedAt)],
    ["Last update", formatCareerDate(application.updatedAt)],
  ];

  return (
    <section aria-labelledby="application-job" className="flex flex-col gap-5 rounded-2xl border border-landing-surface-border bg-landing-surface p-5 sm:p-8">
      <h2 id="application-job" className="text-xl font-semibold break-words text-landing-fg">
        {application.jobTitle}
      </h2>
      <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows
          .filter((row): row is [string, string] => Boolean(row[1]))
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-landing-muted">{label}</dt>
              <dd className={`break-words ${label === "Status" ? "font-semibold text-landing-fg" : "text-landing-fg"}`}>{value}</dd>
            </div>
          ))}
      </dl>

      {state.status === "withdrawn" ? (
        <p role="status" className="text-sm text-landing-fg">
          Your application has been withdrawn.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {application.canWithdraw && state.status !== "withdrawn" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-landing-surface-border px-5 text-sm font-medium text-landing-fg hover:border-destructive hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-accent disabled:opacity-70"
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {pending ? "Withdrawing…" : "Withdraw application"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw this application?</AlertDialogTitle>
              <AlertDialogDescription>
                Your application for {application.jobTitle} will be marked as withdrawn and the hiring team will stop considering it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={withdraw}>Withdraw</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  );
}

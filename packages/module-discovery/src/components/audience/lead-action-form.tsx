"use client";

import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { LeadActionState } from "../../lib/audience/types";

/**
 * DISC-CONS-P0-04.1/05.2: a form for one action on a person (log a conversation, send
 * questions, send an email) that says what happened: completed, or failed with the
 * reason (refused because they unsubscribed, provider not set up...). Never reads
 * "sent" unless it was.
 */
export function LeadActionForm({
  action,
  label,
  pendingText,
  children,
  variant = "default",
}: {
  action: (prev: LeadActionState, formData: FormData) => Promise<LeadActionState>;
  label: string;
  pendingText: string;
  children?: ReactNode;
  variant?: "default" | "outline";
}) {
  const [state, formAction] = useActionState<LeadActionState, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm" variant={variant} pendingText={pendingText}>
          {label}
        </SubmitButton>
        {state ? (
          <p role={state.status === "failed" ? "alert" : "status"} className={state.status === "failed" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";

type TestSendState = { status: "sent" | "failed"; message: string } | null;

/**
 * DISC-CAMP-P0-05.3: "Send me a test" for one previewed email. One button and no field:
 * the test goes to the mailbox's own address, which the server takes from the mailbox.
 * What it says afterwards is what happened: sent, or not confirmed as sent and why.
 */
export function TestSendButton({ action }: { action: () => Promise<TestSendState> }) {
  const [state, formAction] = useActionState<TestSendState, FormData>(async () => action(), null);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      <SubmitButton variant="outline" size="sm" pendingText="Sending the test...">
        Send me a test
      </SubmitButton>
      {state ? (
        <p role={state.status === "sent" ? "status" : "alert"} className={state.status === "sent" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

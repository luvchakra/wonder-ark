"use client";

import { useActionState, useState } from "react";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { TASK_OUTCOME_LABEL, type TaskOutcome } from "../../lib/campaigns/types";

/**
 * DISC-CAMP-P0-06.1: "Mark done", the one action on a campaign task's Today row. The
 * person has made the call or sent the message themselves; this only records how it
 * went. Pressing it asks which: "Done" or "Couldn't reach". Either is recorded and moves
 * the prospect to its next step. Nothing is sent by pressing it, and the dialog says so.
 */
export function TaskDoneButton({ company, action }: { company: string; action: (outcome: TaskOutcome) => Promise<AiActionState> }) {
  const [state, formAction] = useActionState<AiActionState, FormData>(
    async (_previous, formData) => action(formData.get("outcome") === "not_reached" ? "not_reached" : "done"),
    null,
  );
  const [open, setOpen] = useState(false);
  const submit = (formData: FormData) => {
    setOpen(false);
    formAction(formData);
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline">
            Mark done
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>How did it go with {company}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your answer is recorded and the prospect moves to its next step either way. WonderArk sends nothing for this step.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <form action={submit}>
              <input type="hidden" name="outcome" value="not_reached" />
              <SubmitButton variant="outline" pendingText="Recording...">
                {TASK_OUTCOME_LABEL.not_reached}
              </SubmitButton>
            </form>
            <form action={submit}>
              <input type="hidden" name="outcome" value="done" />
              <SubmitButton pendingText="Recording...">{TASK_OUTCOME_LABEL.done}</SubmitButton>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state?.error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

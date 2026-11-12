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

/**
 * DISC-CAMP-P0-05.1 / 05.3: Activate. Shown only once the preview has been confirmed.
 * One button; pressing it opens a dialog that says exactly what activating does, in the
 * numbers of this campaign, and only the dialog's own button activates. The lines are
 * built by the server from the campaign's rows, so the dialog cannot promise something
 * the code does not do.
 */
export function ActivateButton({ action, lines }: { action: () => Promise<AiActionState>; lines: string[] }) {
  const [state, formAction] = useActionState<AiActionState, FormData>(async () => action(), null);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button size="sm">Activate</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate this campaign?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-left text-sm text-muted-foreground">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <form
              action={(formData) => {
                setOpen(false);
                formAction(formData);
              }}
            >
              <SubmitButton pendingText="Activating...">Activate</SubmitButton>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state?.error ? (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useActionState, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
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
} from "@cofounderai/core/ui/alert-dialog";
import type { ContactEmailStatus } from "../../lib/contacts/types";
import {
  EMAIL_STATUS_LABEL,
  INVALID_ADDRESS_MESSAGE,
  emailSendCheck,
  unconfirmedAddressMessage,
} from "../../lib/messages/email-status";

export type SendRecipient = { id: string; label: string; emailStatus: ContactEmailStatus | null };

/**
 * DISC-DATA-P0-04.2: the send form of an email draft -- who it goes to, and the one
 * button that sends it. It is the form the page always had (a recipient picker and a
 * send button whose failure is shown as the real message), with the sending rule for an
 * address a lookup checked:
 *
 *   invalid             the button is off and the reason is shown;
 *   risky, unverified   pressing send asks once, then sends with the confirmation;
 *   anything else       sends as before.
 *
 * This is the prompt, not the authority: `sendMessage` applies the same rule on the
 * server and refuses a send that skipped it.
 */
export function EmailSendForm({
  action,
  buttonLabel,
  pendingText,
  recipients,
  defaultRecipientId,
}: {
  action: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
  buttonLabel: ReactNode;
  pendingText: string;
  recipients: SendRecipient[];
  defaultRecipientId: string;
}) {
  const [state, formAction] = useActionState<AiActionState, FormData>(action, null);
  const [recipientId, setRecipientId] = useState(defaultRecipientId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef<HTMLInputElement>(null);

  const recipient = recipients.find((entry) => entry.id === recipientId) ?? recipients[0];
  const check = emailSendCheck(recipient?.emailStatus);

  return (
    <div className="flex flex-col items-start gap-2">
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          if (check === "blocked") {
            event.preventDefault();
          } else if (check === "confirm" && confirmedRef.current?.value !== "1") {
            event.preventDefault();
            setConfirmOpen(true);
          }
        }}
      >
        <NativeSelect
          name="contactId"
          aria-label="Send to"
          value={recipient?.id ?? ""}
          onChange={(event) => {
            // A confirmation is for one address; choosing another starts over.
            if (confirmedRef.current) confirmedRef.current.value = "";
            setRecipientId(event.target.value);
          }}
          className="w-auto max-w-64"
        >
          {recipients.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.emailStatus ? `${entry.label} (${EMAIL_STATUS_LABEL[entry.emailStatus]})` : entry.label}
            </option>
          ))}
        </NativeSelect>
        <input ref={confirmedRef} type="hidden" name="confirmedUnverified" defaultValue="" />
        <SubmitButton size="lg" pendingText={pendingText} disabled={check === "blocked"}>
          {buttonLabel}
        </SubmitButton>
      </form>
      {check === "blocked" ? <p className="max-w-md text-sm text-destructive">{INVALID_ADDRESS_MESSAGE}</p> : null}
      {state?.error ? (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipient?.emailStatus ? unconfirmedAddressMessage(recipient.emailStatus) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Don&apos;t send</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmedRef.current) confirmedRef.current.value = "1";
                formRef.current?.requestSubmit();
              }}
            >
              Send anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

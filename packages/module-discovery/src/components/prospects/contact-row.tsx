"use client";

import { useActionState, useState } from "react";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { Badge } from "@cofounderai/core/ui/badge";
import { Pencil, X } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
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
import type { Contact } from "../../lib/contacts/types";
import { EMAIL_STATUS_LABEL } from "../../lib/messages/email-status";

const RETRIEVED_FORMAT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const EMAIL_STATUS_BADGE = {
  verified: "success",
  risky: "warning",
  invalid: "destructive",
  unverified: "secondary",
} as const;

/** "Found by Hunter on 11 Nov 2026" -- the source's own name, shown as text. */
function foundLine(contact: Contact): string | null {
  if (!contact.source) return null;
  const date = contact.source_retrieved_at ? new Date(contact.source_retrieved_at) : null;
  return date && !Number.isNaN(date.getTime())
    ? `Found by ${contact.source} on ${RETRIEVED_FORMAT.format(date)}`
    : `Found by ${contact.source}`;
}

/**
 * DISC-DATA-P0-04.3: the delete dialog's one distinct choice. Unticked, the contact is
 * simply deleted. Ticked, its address is first passed to WorksLake's removal list, and
 * the contact is deleted only once that has been accepted. The second line says exactly
 * what ticking it adds, and nothing more: it does not claim the person is removed
 * anywhere else. Offered only for a contact that has an address to pass on.
 */
export function RemovalChoice() {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="askedNotToBeContacted" className="mt-0.5 size-4" />
      <span>
        They asked not to be contacted
        <span className="block text-xs text-muted-foreground">
          Also asks WorksLake to leave this address out of later contact lookups.
        </span>
      </span>
    </label>
  );
}

/** Contact list item with an inline edit toggle -- same collapsed-heading/pencil-reveal
 * pattern as EditableName, extended to a multi-field form since a contact has more than
 * one editable value.
 *
 * DISC-DATA-P0-04.2/04.3: a contact a lookup found says so -- the source that found it,
 * when, and what the check of its address said -- and the delete dialog offers one
 * distinct choice, "They asked not to be contacted", which also passes the address to
 * WorksLake's removal list. A delete that could not do what was chosen says why in the
 * row; the contact is still there. */
export function ContactRow({
  contact,
  updateAction,
  deleteAction,
}: {
  contact: Contact;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteState, deleteFormAction] = useActionState<AiActionState, FormData>(deleteAction, null);
  const found = foundLine(contact);

  if (editing) {
    return (
      <li className="rounded-md border p-3 text-sm">
        <form
          action={async (formData: FormData) => {
            await updateAction(formData);
            setEditing(false);
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`firstName-${contact.id}`}>First name</Label>
            <Input
              id={`firstName-${contact.id}`}
              name="firstName"
              defaultValue={contact.first_name ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`lastName-${contact.id}`}>Last name</Label>
            <Input
              id={`lastName-${contact.id}`}
              name="lastName"
              defaultValue={contact.last_name ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`jobTitle-${contact.id}`}>Job title</Label>
            <Input
              id={`jobTitle-${contact.id}`}
              name="jobTitle"
              defaultValue={contact.job_title ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`email-${contact.id}`}>Email</Label>
            <Input
              id={`email-${contact.id}`}
              name="email"
              type="email"
              defaultValue={contact.email ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`linkedinUrl-${contact.id}`}>LinkedIn URL</Label>
            <Input
              id={`linkedinUrl-${contact.id}`}
              name="linkedinUrl"
              defaultValue={contact.linkedin_url ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`phone-${contact.id}`}>Phone</Label>
            <Input id={`phone-${contact.id}`} name="phone" defaultValue={contact.phone ?? ""} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <SubmitButton size="sm" pendingText="Saving...">
              Save
            </SubmitButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              <X className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
      <div>
        <p className="font-medium">
          {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "(no name)"}
          {contact.job_title ? (
            <span className="ml-2 font-normal text-muted-foreground">{contact.job_title}</span>
          ) : null}
        </p>
        <p className="mt-1 break-words text-muted-foreground">
          {[contact.email, contact.phone, contact.linkedin_url].filter(Boolean).join(" · ") ||
            "No contact details"}
        </p>
        {contact.email_status || found ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {contact.email_status ? (
              <Badge variant={EMAIL_STATUS_BADGE[contact.email_status]}>
                Email: {EMAIL_STATUS_LABEL[contact.email_status]}
              </Badge>
            ) : null}
            {found ? <span>{found}</span> : null}
          </div>
        ) : null}
        {deleteState?.error ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {deleteState.error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Edit ${contact.first_name ?? "contact"}`}
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the contact and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={deleteFormAction} className="flex flex-col gap-4">
              {contact.email ? <RemovalChoice /> : null}
              <AlertDialogFooter>
                <AlertDialogCancel>Keep contact</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <SubmitButton
                    variant="destructive"
                    pendingText="Deleting..."
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </SubmitButton>
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { PlatformKeyStatus } from "@cofounderai/core/admin/platform-keys";
import { removePlatformKeyAction, setPlatformKeyAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P1-14.1: the one place a key's value is typed. The field always opens empty: a
 * saved secret is never sent back to the browser, and a value that is not secret is shown
 * on the page, not prefilled here. Removing a saved key is in the same dialog, so a row
 * carries one action.
 */
export function KeyDialog({ status }: { status: PlatformKeyStatus }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const saved = status.state === "platform";

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setError(null);
    setReason("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("value") ?? "");
    startTransition(async () => {
      const result = await setPlatformKeyAction({ name: status.name, value, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${status.label} saved. In use within a minute.`);
      resetOnOpen(false);
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removePlatformKeyAction({ name: status.name, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${status.label} removed from the platform.`);
      resetOnOpen(false);
    });
  }

  const reasonMissing = reason.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          {saved ? "Replace" : "Set"}
          <span className="sr-only"> {status.label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>
            {saved ? "Replace" : "Set"} {status.label}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {status.usedBy} Stored encrypted{status.plain ? "" : "; it can't be read back here once saved"}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="platform-key-value" className={LABEL_CLASS}>
              {status.plain ? "Value" : "Key"}
            </Label>
            <Input
              id="platform-key-value"
              name="value"
              type={status.plain ? "text" : "password"}
              autoComplete="off"
              placeholder={saved && status.shown ? `Currently ${status.shown}` : undefined}
              className={FIELD_CLASS}
              aria-invalid={Boolean(error)}
            />
            <p className="text-xs text-zinc-500">From: {status.source}</p>
            {error ? (
              <p role="alert" className="text-xs text-red-400">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="platform-key-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="platform-key-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Rotating the key after a team change"
              className={FIELD_CLASS}
              rows={2}
            />
            <p className="text-xs text-zinc-500">Every change is recorded with this reason.</p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {saved ? (
              <Button
                type="button"
                variant="ghost"
                className="text-red-400 hover:bg-red-950/40 hover:text-red-300"
                disabled={pending || reasonMissing}
                onClick={handleRemove}
              >
                Remove from platform
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => resetOnOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || reasonMissing}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

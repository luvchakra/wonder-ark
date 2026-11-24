"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { EmailProviderConfig } from "@cofounderai/core/admin/platform-email-provider";
import { updateEmailProviderConfigAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-11.1 (Email Provider, config-only). One dialog edits the whole singleton row
 * at once -- there is exactly one row to change, matching `FeaturePolicyDialog`'s own
 * precedent for this shape of data. No "from name" field here -- see this feature's own
 * docstrings for why.
 */
export function EmailProviderDialog({ config }: { config: EmailProviderConfig }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateEmailProviderConfigAction({
        provider: String(formData.get("provider") ?? ""),
        fromEmail: String(formData.get("fromEmail") ?? ""),
        replyTo: String(formData.get("replyTo") ?? ""),
        reason,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success("Email provider configuration updated.");
      resetOnOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Settings2 className="size-4" aria-hidden="true" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Configure email provider</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Records this configuration only -- real outbound email keeps using its own environment variables until a
            future story wires this in. Every change is recorded with your reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider" className={LABEL_CLASS}>
              Provider
            </Label>
            <Input
              id="provider"
              name="provider"
              defaultValue={config.provider ?? ""}
              placeholder="e.g. GoDaddy (SMTP)"
              className={FIELD_CLASS}
              aria-invalid={Boolean(fieldErrors.provider)}
            />
            {fieldErrors.provider && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.provider}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fromEmail" className={LABEL_CLASS}>
              From email
            </Label>
            <Input
              id="fromEmail"
              name="fromEmail"
              type="email"
              defaultValue={config.fromEmail ?? ""}
              placeholder="notifications@wonderark.com"
              className={FIELD_CLASS}
              aria-invalid={Boolean(fieldErrors.fromEmail)}
            />
            {fieldErrors.fromEmail && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.fromEmail}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="replyTo" className={LABEL_CLASS}>
              Reply-to
            </Label>
            <Input
              id="replyTo"
              name="replyTo"
              type="email"
              defaultValue={config.replyTo ?? ""}
              placeholder="support@wonderark.com"
              className={FIELD_CLASS}
              aria-invalid={Boolean(fieldErrors.replyTo)}
            />
            {fieldErrors.replyTo && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.replyTo}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Recording our real ESP after launch review"
              className={FIELD_CLASS}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => resetOnOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

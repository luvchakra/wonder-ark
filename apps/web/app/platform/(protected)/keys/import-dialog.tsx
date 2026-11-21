"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { importFromDeploymentAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/**
 * PLATFORM-P1-14.2: copies the values the deployment sets onto the platform, on the
 * server. The browser sends a reason and gets back names only.
 */
export function ImportDialog({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setError(null);
    setReason("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await importFromDeploymentAction({ reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { imported, failed } = result.outcome;
      if (failed.length > 0) {
        setError(`Copied ${imported.length}. Not copied: ${failed.map((item) => `${item.name} (${item.error})`).join("; ")}`);
        return;
      }
      toast.success(imported.length > 0 ? `Copied ${imported.length} ${imported.length === 1 ? "value" : "values"} onto the platform.` : "Nothing left to copy.");
      resetOnOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Download className="size-4" aria-hidden="true" />
          Import {count} from deployment
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>Import from the deployment</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Copies each value the deployment sets, and the platform doesn&apos;t have yet, onto the platform. It happens on
            the server: no value is shown or sent to this browser. The AI key is tested against its provider first.
            Nothing is removed from the deployment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-reason" className="text-zinc-300">
              Reason (required)
            </Label>
            <Textarea
              id="import-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Moving keys off the hosting dashboard"
              className={FIELD_CLASS}
              rows={2}
            />
            {error ? (
              <p role="alert" className="text-xs text-red-400">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => resetOnOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

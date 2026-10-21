"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Label } from "@cofounderai/core/ui/label";
import { PasswordInput } from "@cofounderai/core/ui/password-input";
import type { ConnectionTest } from "@cofounderai/core/careers/wonderjobs";
import { clearCareersKeyAction, saveCareersKeyAction, testCareersConnectionAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const GHOST_CLASS = "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50";

function describeTest(result: ConnectionTest): { tone: "ok" | "bad"; text: string } {
  switch (result.state) {
    case "connected":
      return { tone: "ok", text: `Connected · ${result.jobs} open ${result.jobs === 1 ? "job" : "jobs"}` };
    case "wrong_key":
      return { tone: "bad", text: "Wrong key -- WonderJobs answered 401." };
    case "not_configured":
      return {
        tone: "bad",
        text: result.reason === "no_key" ? "No key is set." : "WONDERJOBS_BASE_URL isn't an https *.wonderapps.biz address.",
      };
    default:
      return { tone: "bad", text: "Unavailable -- WonderJobs couldn't be reached. Try again shortly." };
  }
}

/**
 * PLATFORM-P1-13.2 -- Save (or Replace), Test connection and Clear for the career-site key.
 * The key is typed into a password field and sent to the server action once; it is never
 * sent back, so there is nothing to reveal.
 */
export function CareersKeyControls({ saved, configured }: { saved: boolean; configured: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [clearing, startClear] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError(null);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const key = String(new FormData(form).get("key") ?? "");
    startSave(async () => {
      const result = await saveCareersKeyAction({ key });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setTest(null);
      setOpen(false);
      toast.success(`Key saved (${result.masked}).`);
    });
  }

  function runTest() {
    startTest(async () => {
      try {
        setTest(describeTest(await testCareersConnectionAction()));
      } catch {
        setTest({ tone: "bad", text: "The test couldn't run. Reload the page and try again." });
      }
    });
  }

  function clear() {
    startClear(async () => {
      const result = await clearCareersKeyAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTest(null);
      toast.success("Key cleared.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm">{saved ? "Replace key" : "Save key"}</Button>
          </DialogTrigger>
          <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
            <DialogHeader>
              <DialogTitle>{saved ? "Replace the career-site key" : "Save the career-site key"}</DialogTitle>
              <DialogDescription className="text-zinc-400">Stored encrypted. Only its last four characters are shown or audited.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="careers-key" className="text-zinc-300">
                  Career-site key
                </Label>
                <PasswordInput
                  id="careers-key"
                  name="key"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="wjcs_…"
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "careers-key-error" : undefined}
                />
                {error ? (
                  <p id="careers-key-error" role="alert" className="text-xs text-red-400">
                    {error}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" className={GHOST_CLASS} onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save key"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Button size="sm" variant="ghost" className={GHOST_CLASS} disabled={!configured || testing} onClick={runTest}>
          {testing ? "Testing…" : "Test connection"}
        </Button>

        {saved ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-950/40 hover:text-red-300" disabled={clearing}>
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className={DIALOG_CLASS}>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear the career-site key?</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  The careers page then uses WONDERJOBS_CAREERS_KEY if it is set, and otherwise says careers isn&apos;t set up yet.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className={GHOST_CLASS}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clear}>Clear key</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {test ? (
        <p role="status" className={`text-sm ${test.tone === "ok" ? "text-emerald-400" : "text-amber-300"}`}>
          {test.text}
        </p>
      ) : null}
    </div>
  );
}

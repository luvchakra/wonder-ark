import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { ChevronDown } from "lucide-react";
import { CopyTextButton } from "../ui/copy-text-button";
import type { SignupPage } from "../../lib/audience/types";

/**
 * DISC-CONS-P0-03.2: the offering's sign-up page, folded: its link with Copy, and its
 * settings (on or off, one line of value, up to two questions, the consent line).
 */
export function SignupPageSettings({
  page,
  pageUrl,
  saveAction,
  defaultConsent,
}: {
  page: SignupPage | null;
  pageUrl: string | null;
  saveAction: (formData: FormData) => void | Promise<void>;
  defaultConsent: string;
}) {
  return (
    <Collapsible defaultOpen={!page} className="rounded-lg border bg-card p-3">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-sm font-medium">
        Sign-up page{page ? (page.enabled ? "" : " (off)") : ""}
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 pt-3">
          {pageUrl && page?.enabled ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 truncate rounded bg-muted px-2 py-1 text-xs">{pageUrl}</code>
              <CopyTextButton text={pageUrl} label="Copy link" />
            </div>
          ) : null}
          <form action={saveAction} className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={page?.enabled ?? true} className="size-4" />
              Page is open for sign-ups
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-value-line">One line about the offering</Label>
              <Input id="signup-value-line" name="valueLine" maxLength={200} defaultValue={page?.value_line ?? ""} />
            </div>
            {[0, 1].map((index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <Label htmlFor={`signup-question-${index}`}>Question {index + 1} (optional)</Label>
                <Input id={`signup-question-${index}`} name={`question_${index}`} maxLength={200} defaultValue={page?.questions[index] ?? ""} />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-consent">Consent line people agree to</Label>
              <Input id="signup-consent" name="consentText" maxLength={500} required defaultValue={page?.consent_text ?? defaultConsent} />
            </div>
            <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Saving...">
              {page ? "Save" : "Create sign-up page"}
            </SubmitButton>
          </form>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

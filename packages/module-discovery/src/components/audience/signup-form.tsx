"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { SignupState } from "../../lib/audience/types";

/**
 * DISC-CONS-P0-03.2: the public sign-up form. Email, an optional name, up to two of the
 * owner's questions, the consent line and Join. `website` is a honeypot: hidden from
 * people, filled by bots. After joining, the same message shows whether or not the
 * address was already on the list.
 */
export function SignupForm({
  action,
  questions,
  consentText,
}: {
  action: (prevState: SignupState, formData: FormData) => Promise<SignupState>;
  questions: string[];
  consentText: string;
}) {
  const [state, formAction] = useActionState<SignupState, FormData>(action, null);

  if (state?.status === "joined") {
    return (
      <p role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
        Thanks, you&apos;re on the list. Check your email for a confirmation with your own link to share.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input id="signup-email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name">Name (optional)</Label>
        <Input id="signup-name" name="name" maxLength={200} autoComplete="name" />
      </div>
      {questions.map((question, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Label htmlFor={`signup-answer-${index}`}>{question}</Label>
          <Input id={`signup-answer-${index}`} name={`answer_${index}`} maxLength={1000} />
        </div>
      ))}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="signup-website">Website</label>
        <input id="signup-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-xs text-muted-foreground">By joining: {consentText}</p>
      {state ? (
        <p role="alert" className="text-sm text-destructive">
          {state.status === "invalid"
            ? state.message
            : state.status === "rate_limited"
              ? "Too many sign-ups just now. Try again in a few minutes."
              : "This sign-up page isn't available right now."}
        </p>
      ) : null}
      <SubmitButton pendingText="Joining..." className="self-start">
        Join
      </SubmitButton>
    </form>
  );
}

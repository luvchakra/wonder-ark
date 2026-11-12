"use client";

import { useActionState } from "react";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { SurveyOutcome } from "../../lib/audience/public";

/** DISC-CONS-P0-04.1: the questions a business sent, and Send. Answered once. */
export function SurveyForm({
  action,
  questions,
}: {
  action: (prev: SurveyOutcome | null, formData: FormData) => Promise<SurveyOutcome>;
  questions: string[];
}) {
  const [state, formAction] = useActionState<SurveyOutcome | null, FormData>(action, null);
  if (state?.status === "saved") {
    return (
      <p role="status" className="rounded-md border bg-muted/40 p-4 text-sm">
        Thanks, your answers were sent.
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {questions.map((question, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Label htmlFor={`answer-${index}`}>{question}</Label>
          <Textarea id={`answer-${index}`} name={`answer_${index}`} rows={3} maxLength={1000} />
        </div>
      ))}
      {state ? (
        <p role="alert" className="text-sm text-destructive">
          {state.status === "empty"
            ? "Write an answer to at least one question."
            : state.status === "rate_limited"
              ? "Too many tries just now. Try again later."
              : "These questions can't be answered any more."}
        </p>
      ) : null}
      <SubmitButton pendingText="Sending..." className="self-start">
        Send
      </SubmitButton>
    </form>
  );
}

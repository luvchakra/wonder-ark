import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { PROSPECT_FEEDBACK_TAG_LABEL, PROSPECT_FEEDBACK_TAGS } from "../../lib/prospect-feedback/types";
import type { ProspectFeedback } from "../../lib/prospect-feedback/types";

/** DISC-OFFER-P1 §7-02.1 "Prospect Feedback" -- the doc's own eleven-tag closed
 * vocabulary plus an optional free-text explanation. Append-only history shown below the
 * form, newest first -- same "log, don't overwrite" precedent as Research/Score above it
 * on this same page. */
export function ProspectFeedbackSection({
  feedback,
  addAction,
}: {
  feedback: ProspectFeedback[];
  addAction: (formData: FormData) => Promise<void>;
}) {
  return (
    // DISC-NAV-P0-01.12: shown inside the page's Feedback section, which carries the title.
    <div className="flex flex-col gap-3">

      <form action={addAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-56">
          <NativeSelect name="feedbackTag" defaultValue={PROSPECT_FEEDBACK_TAGS[0]} className="w-full">
            {PROSPECT_FEEDBACK_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {PROSPECT_FEEDBACK_TAG_LABEL[tag]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Textarea name="note" rows={1} placeholder="Optional note" className="flex-1" />
        <SubmitButton size="sm" variant="outline" pendingText="Saving...">
          Add feedback
        </SubmitButton>
      </form>

      {feedback.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {feedback.map((f) => (
            <li key={f.id} className="flex flex-col gap-1 rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {PROSPECT_FEEDBACK_TAG_LABEL[f.feedback_tag]}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</span>
              </div>
              {f.note ? <p className="text-muted-foreground">{f.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

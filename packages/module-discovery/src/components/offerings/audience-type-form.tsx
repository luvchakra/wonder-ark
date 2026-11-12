import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AUDIENCE_TYPES, AUDIENCE_TYPE_LABEL, type AudienceType } from "../../lib/icp/audience";

/**
 * DISC-CONS-P0-01.1: "Who buys this?" -- one question, three answers, one button. The
 * answer the offering profile suggests is preselected until a person confirms one; the
 * line under the question says where the preselection came from.
 */
export function AudienceTypeForm({
  action,
  current,
  confirmed,
  suggested,
}: {
  action: (formData: FormData) => void | Promise<void>;
  current: AudienceType;
  /** Whether a person has saved an answer. */
  confirmed: boolean;
  /** What the offering profile suggests, or null when it says nothing either way. */
  suggested: AudienceType | null;
}) {
  const preselected = confirmed ? current : (suggested ?? current);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Who buys this?</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {AUDIENCE_TYPES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="audienceType" value={value} defaultChecked={value === preselected} className="size-4" />
              {AUDIENCE_TYPE_LABEL[value]}
            </label>
          ))}
        </div>
        {!confirmed && suggested ? (
          <p className="text-xs text-muted-foreground">Suggested from your offering profile. Confirm or change it.</p>
        ) : null}
      </fieldset>
      <SubmitButton size="sm" variant={confirmed ? "outline" : "default"} className="self-start" pendingText="Saving...">
        {confirmed ? "Save" : "Confirm"}
      </SubmitButton>
    </form>
  );
}

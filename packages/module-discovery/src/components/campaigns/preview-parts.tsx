import Link from "next/link";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { AiActionForm } from "../ai/ai-action-form";
import type { CampaignPreview } from "../../lib/campaigns/preview";
import { GENERAL_SEGMENT, STEP_CHANNEL_LABEL, STEP_PURPOSE_LABEL, TASK_DRAFT_LABEL, TEMPLATE_ORIGIN_LABEL, isTaskChannel, stepLabel } from "../../lib/campaigns/types";
import { leftOutText } from "./campaign-parts";
import { TestSendButton } from "./test-send-button";

type TestSendState = { status: "sent" | "failed"; message: string } | null;

/**
 * DISC-CAMP-P0-05.3: the preview a person confirms before a campaign can send.
 *
 * Planned before markup (docs/design/claude-ui-design-rules.md). The task is to check
 * what activating would do, so the page is, top to bottom: who would be written to and
 * who would not (with the reasons), when, then the emails themselves, one per line of
 * work, each exactly as it would be sent to a real prospect: From, To, Subject, the text
 * and the unsubscribe footer. A prospect whose email would be skipped is shown as
 * skipped with the reason. The one primary action is at the bottom, after everything it
 * confirms: "This looks right".
 *
 * Controls: the link back, one link per step when there are several, Previous and Next
 * prospect, one "Send me a test" per line of work, and "This looks right". Each email is
 * a card; the cards stack at every width, so there is no table to reflow on a phone.
 * Everything shown is stored text, rendered as text.
 *
 * DISC-CAMP-P0-06.1: a call, WhatsApp or LinkedIn step is shown as a task for a person,
 * never as something WonderArk sends: who would get the task, the number or page it is
 * done with as text, and the draft. It has no "Send me a test": there is nothing to send.
 */
export function CampaignPreviewView({
  preview,
  campaignPath,
  confirmAction,
  testAction,
}: {
  preview: CampaignPreview;
  campaignPath: string;
  confirmAction: () => Promise<AiActionState>;
  testAction: (segment: string, step: number, index: number) => () => Promise<TestSendState>;
}) {
  const here = (step: number, index: number) => `${campaignPath}?preview=1&step=${step}&n=${index}`;
  const leftOut = leftOutText(preview.leftOut);
  const shown = preview.steps.find((step) => step.position === preview.step);
  const isTask = shown ? isTaskChannel(shown.channel) : false;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Who it writes to</h2>
        <p className="text-sm">
          {preview.audience} {preview.audience === 1 ? "prospect" : "prospects"}{" "}
          {preview.alreadyEnrolled ? (preview.audience === 1 ? "is enrolled and still in progress" : "are enrolled and still in progress") : "would be enrolled when you activate"}.
        </p>
        {leftOut ? <p className="text-sm text-muted-foreground">Left out: {leftOut}.</p> : null}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">When</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {preview.schedule.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            {isTask ? "A task for you, not sent by WonderArk" : "The emails"}: step {preview.step}
            {shown ? `, ${(isTask ? stepLabel(shown) : STEP_PURPOSE_LABEL[shown.purpose]).toLowerCase()}` : ""}, prospect {preview.index + 1} in each line of work
          </h2>
          <nav aria-label="Preview" className="flex flex-wrap items-center gap-3 text-sm">
            {preview.steps.length > 1
              ? preview.steps.map((step) =>
                  step.position === preview.step ? (
                    <span key={step.position} aria-current="true" className="font-medium">
                      Step {step.position}
                    </span>
                  ) : (
                    <Link key={step.position} href={here(step.position, preview.index)} className="underline underline-offset-2">
                      Step {step.position}
                    </Link>
                  ),
                )
              : null}
            {preview.index > 0 ? (
              <Link href={here(preview.step, preview.index - 1)} className="underline underline-offset-2">
                Previous prospect
              </Link>
            ) : null}
            {preview.index < preview.lastIndex ? (
              <Link href={here(preview.step, preview.index + 1)} className="underline underline-offset-2">
                Next prospect
              </Link>
            ) : null}
          </nav>
        </div>

        {preview.lines.length === 0 ? <p className="text-sm text-muted-foreground">Nobody would be written to, so there is nothing to show.</p> : null}
        {preview.lines.map((line) => (
          <article key={line.segment} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
            <p className="text-sm font-medium">
              {line.segment === GENERAL_SEGMENT ? "Everyone else" : `Line of work: ${line.segment}`}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {line.prospects} {line.prospects === 1 ? "prospect" : "prospects"}
              </span>
            </p>
            {line.email === null ? (
              <p className="text-sm text-muted-foreground">No prospect {preview.index + 1} in this line of work.</p>
            ) : line.email.ok && line.email.kind === "task" ? (
              <>
                <p className="text-sm">
                  {STEP_CHANNEL_LABEL[line.email.channel]} <span className="font-medium">{line.email.company}</span>: <span className="break-words">{line.email.detail.text}</span>.
                  This would appear on your Today list when it is due. Nothing is sent or dialled.
                </p>
                <p className="border-t pt-2 text-xs text-muted-foreground">
                  {TASK_DRAFT_LABEL[line.email.channel]} · {TEMPLATE_ORIGIN_LABEL[line.email.origin]}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{line.email.text}</p>
              </>
            ) : line.email.ok ? (
              <>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
                  <dt className="text-muted-foreground">From</dt>
                  <dd className="break-words">{line.email.from}</dd>
                  <dt className="text-muted-foreground">To</dt>
                  <dd className="break-words">
                    {line.email.to} ({line.email.company})
                  </dd>
                  <dt className="text-muted-foreground">Subject</dt>
                  <dd className="break-words font-medium">{line.email.subject}</dd>
                </dl>
                {line.email.opening ? (
                  <p className="text-xs text-muted-foreground">
                    {line.email.opening.written
                      ? "The first sentence is AI-generated for this company."
                      : `${line.email.opening.reason}. This email goes with your text alone.`}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap break-words border-t pt-2 text-sm">{line.email.text}</p>
                <TestSendButton action={testAction(line.segment, preview.step, preview.index)} />
              </>
            ) : (
              <p className="text-sm">
                <span className="font-medium">{line.email.company}</span> would be {isTask ? "passed over for this step" : "skipped"}. {line.email.reason}.
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-2 border-t pt-4">
        {preview.confirmed ? (
          <p className="text-sm">
            You confirmed this preview.{" "}
            <Link href={campaignPath} className="underline underline-offset-2">
              Back to the campaign
            </Link>
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Confirming records that you checked this preview. If the audience, the schedule, a step or a message changes afterwards, you will be asked to preview again.
            </p>
            <AiActionForm action={confirmAction} buttonLabel="This looks right" pendingText="Confirming..." />
          </>
        )}
      </section>
    </div>
  );
}

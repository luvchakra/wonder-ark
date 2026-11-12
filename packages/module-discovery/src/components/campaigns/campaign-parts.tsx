import Link from "next/link";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { Badge } from "@cofounderai/core/ui/badge";
import { Fold } from "@cofounderai/core/ui/fold";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { AiActionForm } from "../ai/ai-action-form";
import type { CampaignResults } from "../../lib/campaigns/campaigns";
import { scheduleLines } from "../../lib/campaigns/compose";
import type { SenderMailboxView } from "../../lib/campaigns/mailbox";
import { MERGE_FIELDS } from "../../lib/campaigns/render";
import {
  CAMPAIGN_STATUS_LABEL,
  GENERAL_SEGMENT,
  LEFT_OUT_LABEL,
  MAX_FOLLOW_UP_DAYS,
  MAX_STEPS,
  MIN_FOLLOW_UP_DAYS,
  STEP_PURPOSE_LABEL,
  TEMPLATE_ORIGIN_LABEL,
  WEEKDAY_LABEL,
  type Campaign,
  type CampaignStep,
  type CampaignTemplate,
  type LeftOutReason,
} from "../../lib/campaigns/types";

/**
 * DISC-CAMP-P0-05.1 / 05.2: what the Campaigns pages are made of. Server components:
 * each shows the campaign's own stored rows and posts a form. Every count is a count of
 * rows; a value that is not known is not shown.
 */

type FormAction = (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const day = (value: string | null) => (value ? DAY.format(new Date(value)) : null);

const STATUS_TONE: Record<Campaign["status"], "default" | "secondary" | "outline"> = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  completed: "outline",
};

export function CampaignStatusBadge({ status }: { status: Campaign["status"] }) {
  return <Badge variant={STATUS_TONE[status]}>{CAMPAIGN_STATUS_LABEL[status]}</Badge>;
}

/** "3 have no email address; 2 are already in a campaign" -- every reason, with its count. */
export function leftOutText(leftOut: Partial<Record<LeftOutReason, number>>): string | null {
  const parts = (Object.entries(leftOut) as [LeftOutReason, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${LEFT_OUT_LABEL[reason]}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

/** One list, a card per campaign: on a phone the parts stack, from `md` up they sit in a
 * row. A campaign carries one control, the link to its page. */
export function CampaignList({ campaigns, basePath }: { campaigns: (Campaign & { enrolled: number; sent: number; replied: number })[]; basePath: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {campaigns.map((campaign) => (
        <li key={campaign.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <Link href={`${basePath}/${campaign.id}`} className="truncate font-medium underline-offset-2 hover:underline">
              {campaign.name}
            </Link>
            {campaign.status === "paused" && campaign.pause_reason ? <p className="text-xs text-muted-foreground">{campaign.pause_reason}</p> : null}
          </div>
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <CampaignStatusBadge status={campaign.status} />
            <div className="flex gap-1">
              <dt>Enrolled</dt>
              <dd className="font-medium text-foreground">{campaign.enrolled}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Sent</dt>
              <dd className="font-medium text-foreground">{campaign.sent}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Replied</dt>
              <dd className="font-medium text-foreground">{campaign.replied}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** The sequence, as it will run: which step, what it is for, and when. Read-only. */
export function StepList({ steps }: { steps: CampaignStep[] }) {
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {steps.map((step) => (
        <li key={step.id}>
          <span className="font-medium">
            {step.position}. {STEP_PURPOSE_LABEL[step.purpose]} email
          </span>
          <span className="text-muted-foreground">
            {step.position === 1 ? ", sent first" : `, ${step.delay_days} ${step.delay_days === 1 ? "day" : "days"} after step ${step.position - 1}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Sending from": the address, the password and one action, Connect. Connect saves what
 * the form holds and sends one test message to the person's own account address; the
 * mailbox is verified only when the mail server accepts it. The servers are worked out
 * from the address when its mail provider is one WonderArk knows, and can be entered or
 * changed under "Server settings". The password field is always empty: the stored
 * password is never sent back to the page.
 */
export function MailboxForm({ mailbox, action, defaultLimit }: { mailbox: SenderMailboxView | null; action: FormAction; defaultLimit: number }) {
  const status =
    mailbox?.status === "verified"
      ? `Verified${mailbox.verifiedAt ? ` on ${day(mailbox.verifiedAt)}` : ""}. Emails go out from ${mailbox.fromEmail}.${mailbox.lastError ? ` ${mailbox.lastError}` : ""}`
      : mailbox?.status === "failed"
        ? `The last test failed: ${mailbox.lastError ?? "no reason was recorded."}`
        : mailbox
          ? "Not verified yet. Connect sends a test to check it."
          : "Needs setup: no mailbox is connected.";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{status}</p>
      <p className="text-xs text-muted-foreground">
        Connect saves these and sends one test email to your own address. Your mail provider&apos;s own terms apply to what you send from this mailbox (some restrict
        unsolicited bulk email), which is why the daily limit is low.
      </p>
      <AiActionForm action={action} buttonLabel="Connect" pendingText="Connecting..." formClassName="flex flex-col gap-3" buttonProps={{ variant: "outline", className: "self-start" }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email address" name="fromEmail" type="email" defaultValue={mailbox?.fromEmail} autoComplete="off" />
          <Field
            label={mailbox ? "Password (leave blank to keep the saved one)" : "Password or app password"}
            name="password"
            type="password"
            autoComplete="new-password"
          />
        </div>
        <Fold label="Server settings" variant="ghost">
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {mailbox
                ? "Change these only if your mail provider's settings differ."
                : "Leave these blank and they are filled in from your address when its mail provider is one WonderArk knows (GoDaddy, Google, Microsoft 365, Zoho)."}
            </p>
            <Field label="From name" name="fromName" defaultValue={mailbox?.fromName} autoComplete="off" />
            <Field label="Username (blank uses the address)" name="username" defaultValue={mailbox?.username} autoComplete="off" />
            <Field label="Outgoing mail server (SMTP)" name="smtpHost" defaultValue={mailbox?.smtpHost} placeholder="smtp.example.com" autoComplete="off" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mailbox-smtpPort">Port</Label>
              <NativeSelect id="mailbox-smtpPort" name="smtpPort" defaultValue={mailbox ? String(mailbox.smtpPort) : ""}>
                {mailbox ? null : <option value="">From your address</option>}
                <option value="587">587 (STARTTLS)</option>
                <option value="465">465 (TLS)</option>
              </NativeSelect>
            </div>
            <Field label="Incoming mail server for replies (IMAP)" name="imapHost" defaultValue={mailbox?.imapHost ?? ""} placeholder="imap.example.com" autoComplete="off" />
            <Field label="Emails a day, at most" name="dailyLimit" type="number" defaultValue={String(mailbox?.dailyLimit ?? defaultLimit)} min={1} max={200} />
          </div>
        </Fold>
      </AiActionForm>
    </div>
  );
}

function Field({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`mailbox-${name}`}>{label}</Label>
      <Input id={`mailbox-${name}`} name={name} {...props} />
    </div>
  );
}

/** The folded "Audience" form: the campaign's name and who it enrols. One form, one Save. */
export function AudienceForm({ campaign, action }: { campaign: Campaign; action: FormAction }) {
  return (
    <AiActionForm action={action} buttonLabel="Save audience" pendingText="Saving..." formClassName="flex flex-col gap-4" buttonProps={{ variant: "outline", className: "self-start" }}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campaign-name">Name</Label>
        <Input id="campaign-name" name="name" defaultValue={campaign.name} maxLength={120} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Who is enrolled</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="onlyQualified" className="size-4" defaultChecked={campaign.audience.onlyQualified !== false} />
          Only prospects marked qualified
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoEnroll" className="size-4" defaultChecked={campaign.auto_enroll} />
          Add new prospects automatically
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="includeUnverified" className="size-4" defaultChecked={campaign.include_unverified} />
          Include unverified addresses
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-lines">Lines of work (blank for all)</Label>
            <Input id="campaign-lines" name="linesOfWork" defaultValue={(campaign.audience.linesOfWork ?? []).join(", ")} placeholder="e.g. plumber, electrician" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-fit">Minimum fit score (blank for none)</Label>
            <Input id="campaign-fit" name="minFitScore" type="number" min={0} max={100} defaultValue={campaign.audience.minFitScore ?? ""} />
          </div>
        </div>
      </fieldset>
    </AiActionForm>
  );
}

/**
 * DISC-CAMP-P0-05.4: the folded "Schedule" form: how many emails a day this campaign
 * sends, on which days and hours, and how many emails the sequence has with the days
 * between them. Every field arrives filled from the campaign as it stands, so nobody
 * has to open it. One form, one Save; saving asks for the preview again.
 */
export function ScheduleForm({ campaign, steps, mailboxLimit, action }: { campaign: Campaign; steps: CampaignStep[]; mailboxLimit: number | null; action: FormAction }) {
  return (
    <AiActionForm action={action} buttonLabel="Save schedule" pendingText="Saving..." formClassName="flex flex-col gap-4" buttonProps={{ variant: "outline", className: "self-start" }}>
      <p className="text-xs text-muted-foreground">Changing the schedule means previewing the campaign again before it can send.</p>
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="campaign-daily">Emails a day for this campaign{mailboxLimit ? ` (blank for the mailbox's ${mailboxLimit})` : ""}</Label>
        <Input id="campaign-daily" name="dailyLimit" type="number" min={1} max={mailboxLimit ?? 200} defaultValue={campaign.daily_limit ?? ""} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Days and hours ({campaign.timezone})</legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAY_LABEL.map((label, index) => (
            <label key={label} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="sendDays" value={index + 1} className="size-4" defaultChecked={campaign.send_days.includes(index + 1)} />
              {label}
            </label>
          ))}
        </div>
        <div className="grid max-w-xs grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-from">From hour</Label>
            <Input id="campaign-from" name="sendFromHour" type="number" min={0} max={23} defaultValue={campaign.send_from_hour} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-to">To hour</Label>
            <Input id="campaign-to" name="sendToHour" type="number" min={1} max={24} defaultValue={campaign.send_to_hour} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Follow-ups</legend>
        <p className="text-xs text-muted-foreground">
          The first email is sent first. For each follow-up, enter how many days after the email before it is sent ({MIN_FOLLOW_UP_DAYS} to {MAX_FOLLOW_UP_DAYS}); leave it blank to
          end the sequence there. A new follow-up needs its message written before the preview. One that has already been sent to someone can&apos;t be removed.
        </p>
        <div className="grid max-w-md grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: MAX_STEPS - 1 }, (_, index) => index + 2).map((position) => (
            <div key={position} className="flex flex-col gap-1.5">
              <Label htmlFor={`campaign-step-${position}`}>Email {position}: days</Label>
              <Input
                id={`campaign-step-${position}`}
                name={`delayDays${position}`}
                type="number"
                min={MIN_FOLLOW_UP_DAYS}
                max={MAX_FOLLOW_UP_DAYS}
                defaultValue={steps.find((step) => step.position === position)?.delay_days ?? ""}
              />
            </div>
          ))}
        </div>
      </fieldset>
    </AiActionForm>
  );
}

/**
 * The text of each step, grouped by step, each labelled with where it came from
 * (AI-generated, edited, or written by the person). The text is shown as text; editing
 * it is folded, one form per message.
 */
export function TemplateList({
  steps,
  templates,
  editable,
  saveAction,
}: {
  steps: CampaignStep[];
  templates: CampaignTemplate[];
  editable: boolean;
  saveAction: (templateId: string) => FormAction;
}) {
  const fields = MERGE_FIELDS.map((field) => `{{${field}}}`).join(", ");
  return (
    <div className="flex flex-col gap-4">
      {steps.map((step) => {
        const own = templates
          .filter((template) => template.step_id === step.id)
          .sort((a, b) => (a.segment === GENERAL_SEGMENT ? -1 : b.segment === GENERAL_SEGMENT ? 1 : a.segment.localeCompare(b.segment)));
        return (
          <section key={step.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Step {step.position}: {STEP_PURPOSE_LABEL[step.purpose]}
            </h3>
            {own.length === 0 ? <p className="text-sm text-muted-foreground">No text yet.</p> : null}
            {own.map((template) => (
              <article key={template.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{template.segment === GENERAL_SEGMENT ? "Everyone else" : `Line of work: ${template.segment}`}</p>
                  <Badge variant="outline" className="font-normal">
                    {TEMPLATE_ORIGIN_LABEL[template.origin]}
                  </Badge>
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Subject: </span>
                  {template.subject}
                </p>
                <p className="whitespace-pre-wrap text-sm">{template.body}</p>
                {editable ? (
                  <Fold label="Edit" variant="ghost">
                    <AiActionForm
                      action={saveAction(template.id)}
                      buttonLabel="Save message"
                      pendingText="Saving..."
                      formClassName="flex flex-col gap-2 pt-2"
                      buttonProps={{ variant: "outline", className: "self-start" }}
                    >
                      <Label htmlFor={`subject-${template.id}`}>Subject</Label>
                      <Input id={`subject-${template.id}`} name="subject" defaultValue={template.subject ?? ""} maxLength={200} />
                      <Label htmlFor={`body-${template.id}`}>Message</Label>
                      <Textarea id={`body-${template.id}`} name="body" defaultValue={template.body} rows={9} maxLength={5000} />
                      <p className="text-xs text-muted-foreground">
                        Merge fields: {fields}. A prospect with no value for a field you use is skipped for that step, with the reason shown.
                      </p>
                    </AiActionForm>
                  </Fold>
                ) : null}
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const ENROLLMENT_STATUS_LABEL: Record<string, string> = { active: "In progress", replied: "Replied", completed: "Finished", stopped: "Stopped" };

/**
 * DISC-CAMP-P0-05.2: the funnel and each prospect's place in it. The counts are counts
 * of this campaign's rows. There is no "delivered": a business's own mailbox reports no
 * delivery, so it is not shown.
 */
export function CampaignResultsView({ results, prospectsPath }: { results: CampaignResults; prospectsPath: string }) {
  const funnel: [string, number][] = [
    ["Enrolled", results.enrolled],
    ["Sent", results.sent],
    ["Bounced", results.bounced],
    ["Replied", results.replied],
    ["Interested", results.interested],
    ["Won", results.won],
  ];
  const notSent = results.failed + results.skipped;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {funnel.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {notSent > 0 ? (
        <p className="text-sm text-muted-foreground">
          {results.skipped > 0 ? `${results.skipped} ${results.skipped === 1 ? "step was" : "steps were"} skipped. ` : ""}
          {results.failed > 0 ? `${results.failed} ${results.failed === 1 ? "email" : "emails"} could not be sent or ${results.failed === 1 ? "has" : "have"} an unknown outcome. ` : ""}
          The reason is beside each prospect below.
        </p>
      ) : null}

      {results.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody is enrolled.</p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-3 border-b px-3 pb-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Prospect</span>
            <span>Status</span>
            <span>Emails sent</span>
            <span>Next step or reason</span>
          </div>
          <ul className="flex flex-col gap-2 md:gap-0">
            {results.rows.map((row) => (
              <li
                key={row.enrollmentId}
                className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-sm md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] md:items-center md:gap-3 md:rounded-none md:border-0 md:border-b md:bg-transparent"
              >
                <Link href={`${prospectsPath}/${row.prospectId}`} className="truncate font-medium underline-offset-2 hover:underline">
                  {row.company}
                </Link>
                <span>
                  <span className="text-muted-foreground md:hidden">Status: </span>
                  {ENROLLMENT_STATUS_LABEL[row.status] ?? row.status}
                </span>
                <span>
                  <span className="text-muted-foreground md:hidden">Emails sent: </span>
                  {row.stepsSent}
                </span>
                <span className="text-muted-foreground">{row.stopReason ?? (row.nextDueAt ? `Next step due ${day(row.nextDueAt)}` : "")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * What activating does, in this campaign's own numbers. Built on the server from rows;
 * the schedule lines are the ones the preview showed (`scheduleLines`).
 */
export function activateLines(input: { campaign: Campaign; wouldEnrol: number; mailbox: SenderMailboxView; steps: CampaignStep[] }): string[] {
  const { campaign, wouldEnrol, mailbox, steps } = input;
  return [
    `${wouldEnrol} ${wouldEnrol === 1 ? "prospect is" : "prospects are"} enrolled now${campaign.auto_enroll ? ", and new prospects that fit are added as they appear" : ""}.`,
    `Each gets the ${steps.length === 1 ? "email" : `${steps.length} emails`} you previewed, from ${mailbox.fromEmail}. Nobody approves each email first.`,
    ...scheduleLines({ campaign, steps, mailboxDailyLimit: mailbox.dailyLimit }),
    "A few go straight away if it is within those hours now; the rest at the daily check.",
    "Follow-ups to a prospect stop when it replies, its email bounces, it unsubscribes, or you mark it won or lost.",
    "You can pause the campaign at any time, and nothing more is sent while it is paused.",
  ];
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { Button } from "@cofounderai/core/ui/button";
import { Fold } from "@cofounderai/core/ui/fold";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import { ActivateButton } from "@cofounderai/module-discovery/components/campaigns/activate-button";
import {
  AudienceForm,
  CampaignResultsView,
  CampaignStatusBadge,
  MailboxForm,
  ScheduleForm,
  StepList,
  TemplateList,
  activateLines,
  leftOutText,
} from "@cofounderai/module-discovery/components/campaigns/campaign-parts";
import { CampaignPreviewView } from "@cofounderai/module-discovery/components/campaigns/preview-parts";
import { getCampaignDetail, getCampaignResults, previewAudience, previewBlocker } from "@cofounderai/module-discovery/lib/campaigns/campaigns";
import { MAILBOX_DAILY_LIMIT_DEFAULT, getSenderMailbox } from "@cofounderai/module-discovery/lib/campaigns/mailbox";
import { buildCampaignPreview } from "@cofounderai/module-discovery/lib/campaigns/preview";
import { GENERAL_SEGMENT, dailyCheckIn } from "@cofounderai/module-discovery/lib/campaigns/types";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  activateCampaignAction,
  confirmPreviewAction,
  finishCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  saveAudienceAction,
  saveScheduleAction,
  saveTemplateAction,
  sendTestAction,
  testMailboxAction,
  writeMessagesAction,
} from "../actions";

/**
 * DISC-CAMP-P0-05.1 to 05.4: one campaign.
 *
 * Planned before markup (docs/design/claude-ui-design-rules.md). What the person is here
 * to do depends on where the campaign is, so the page has one primary action at a time
 * and the rest is folded:
 *
 *   draft, no text                   Write messages
 *   text ready, no mailbox           "Needs setup: connect a mailbox" in the action's place
 *   text ready, preview unconfirmed  Preview
 *   preview confirmed                Activate (with its confirmation dialog)
 *   running                          Pause
 *   paused                           Resume, or Preview if it was changed while paused
 *   finished                         none: the results
 *
 * `?preview=1` shows the preview in place of the page's body (`CampaignPreviewView`):
 * what activating would do, computed by the code that enrols and sends, ending in "This
 * looks right". Activate appears only after that, and the database refuses activation
 * without it.
 *
 * Below the action: who would be enrolled and why the rest are left out (draft), or the
 * funnel and each prospect's place in it; then the steps and their text, each labelled
 * with where it came from. Folded: "Sending from", and, while nothing is being sent,
 * "Schedule" and "Audience"; once activated, "Finish campaign".
 *
 * Visible controls with the folds closed, before -> after (05.3/05.4). N is the number
 * of messages, P the number of enrolled prospects. The link back to Campaigns went: the
 * offering's tab bar already has it.
 *   draft, no text      4 -> 4      (Write messages, 3 folds)
 *   draft, text ready   4+N -> 4+N  (Preview or Activate, 3 folds, N Edit)
 *   running             5+N+P -> 3+P  (Pause, 2 folds; nothing is editable while sending)
 *   paused              5+N+P -> 5+N+P
 *   finished            2+P -> 1+P
 */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; productId: string; campaignId: string }>;
  searchParams: Promise<{ preview?: string; step?: string; n?: string }>;
}) {
  const { businessSlug, productId, campaignId } = await params;
  const query = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();
  const detail = await getCampaignDetail(campaignId);
  if (!detail || detail.campaign.workspace_id !== workspace.id) notFound();

  const { campaign, steps, templates } = detail;
  const offeringPath = `/${businessSlug}/discovery/offerings/${productId}`;
  const campaignPath = `${offeringPath}/campaigns/${campaign.id}`;
  const draft = campaign.status === "draft";
  const editable = draft || campaign.status === "paused";
  const bind = <T extends unknown[], R>(action: (businessId: string, productId: string, campaignId: string, ...rest: T) => R) =>
    action.bind(null, businessId, productId, campaign.id) as (...rest: T) => R;

  const header = (action: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-medium">{campaign.name}</h1>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        {campaign.status === "paused" && campaign.pause_reason ? <p className="text-sm text-muted-foreground">{campaign.pause_reason}</p> : null}
      </div>
      {action}
    </div>
  );

  // The preview takes the page's place: it is what the person came to check.
  if (query.preview && editable) {
    const result = await buildCampaignPreview(campaign.id, { step: Number(query.step) || undefined, index: Number(query.n) || undefined });
    return (
      <div className="flex flex-col gap-6">
        {header(
          <Button asChild variant="outline" size="sm">
            <Link href={campaignPath}>Back to the campaign</Link>
          </Button>,
        )}
        {result.status === "ready" ? (
          <CampaignPreviewView
            preview={result.preview}
            campaignPath={campaignPath}
            confirmAction={bind(confirmPreviewAction)}
            testAction={(segment, step, index) => sendTestAction.bind(null, campaign.id, segment, step, index)}
          />
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm">{result.message}</p>
        )}
      </div>
    );
  }

  const [mailbox, preview, results] = await Promise.all([
    getSenderMailbox(workspace.id),
    draft ? previewAudience(campaign) : null,
    draft ? null : getCampaignResults(campaign.id),
  ]);

  const verified = mailbox?.status === "verified";
  const written = steps.every((step) => templates.some((template) => template.step_id === step.id && template.segment === GENERAL_SEGMENT));
  const blocker = editable ? previewBlocker(detail, verified) : null;
  const confirmed = Boolean(campaign.preview_confirmed_at);
  const check = dailyCheckIn(campaign);
  const leftOut = preview ? leftOutText(preview.leftOut) : null;
  const previewLink = (
    <Button asChild size="sm">
      <Link href={`${campaignPath}?preview=1`}>Preview</Link>
    </Button>
  );

  const primary =
    campaign.status === "active" ? (
      <AiActionForm action={bind(pauseCampaignAction)} buttonLabel="Pause" pendingText="Pausing..." buttonProps={{ variant: "outline" }} />
    ) : campaign.status === "completed" ? null : !written ? (
      <AiActionForm action={bind(writeMessagesAction)} buttonLabel="Write messages" pendingText="Writing..." />
    ) : blocker?.status === "needs_setup" ? (
      <p className="rounded-md border border-dashed px-3 py-2 text-sm">{blocker.message}</p>
    ) : blocker ? (
      <p className="max-w-xs text-sm text-muted-foreground">{blocker.message}</p>
    ) : !confirmed ? (
      previewLink
    ) : draft && mailbox ? (
      <ActivateButton action={bind(activateCampaignAction)} lines={activateLines({ campaign, wouldEnrol: preview?.enrol.length ?? 0, mailbox, steps })} />
    ) : (
      <AiActionForm action={bind(resumeCampaignAction)} buttonLabel="Resume" pendingText="Resuming..." />
    );

  return (
    <div className="flex flex-col gap-6">
      {header(primary)}

      {campaign.status === "paused" && written && !confirmed && !blocker ? (
        <p role="status" className="rounded-md border bg-card p-3 text-sm">
          This campaign was changed while it was paused. Preview it and confirm it looks right before it can resume.
        </p>
      ) : null}

      {!check.inHours && campaign.status !== "completed" ? (
        <p role="status" className="rounded-md border bg-card p-3 text-sm">
          Emails are sent at the daily check, {check.time} in {campaign.timezone}, which is outside this campaign&apos;s sending hours ({campaign.send_from_hour}:00 to{" "}
          {campaign.send_to_hour}:00). Nothing will be sent until the hours include it; change them under Schedule.
        </p>
      ) : null}

      {preview ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Audience</h2>
          <p className="text-sm">
            {preview.enrol.length} {preview.enrol.length === 1 ? "prospect" : "prospects"} would be enrolled now
            {preview.segments.length > 0 ? `, in ${preview.segments.length} ${preview.segments.length === 1 ? "line" : "lines"} of work with their own text` : ""}.
          </p>
          {leftOut ? <p className="text-sm text-muted-foreground">Left out: {leftOut}.</p> : null}
        </section>
      ) : null}

      {results ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Results</h2>
          {campaign.last_enrollment && leftOutText(campaign.last_enrollment.leftOut) ? (
            <p className="text-sm text-muted-foreground">Left out when it was last enrolled: {leftOutText(campaign.last_enrollment.leftOut)}.</p>
          ) : null}
          {!mailbox?.imapHost ? (
            <p className="text-sm text-muted-foreground">
              Replies are not detected automatically for this mailbox. When a prospect replies, log the reply on its page and its follow-ups stop.
            </p>
          ) : mailbox.lastError ? (
            <p role="status" className="text-sm text-destructive">
              {mailbox.lastError}
            </p>
          ) : null}
          <CampaignResultsView results={results} prospectsPath={`${offeringPath}/prospects`} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Steps and messages</h2>
        {templates.length === 0 ? (
          <>
            <StepList steps={steps} />
            <p className="text-sm text-muted-foreground">
              No text yet. Write messages drafts each step from your offering&apos;s profile, once for each line of work in the audience; you can read and edit every one
              before you preview and activate. You can change how many emails there are first, under Schedule.
            </p>
          </>
        ) : (
          <TemplateList
            steps={steps}
            templates={templates}
            editable={editable}
            saveAction={(templateId) => saveTemplateAction.bind(null, businessId, productId, campaign.id, templateId)}
          />
        )}
        {written && (preview?.segments ?? []).some((entry) => !templates.some((template) => template.segment === entry.segment)) ? (
          <AiActionForm action={bind(writeMessagesAction)} buttonLabel="Write the missing messages" pendingText="Writing..." buttonProps={{ variant: "outline" }} />
        ) : null}
      </section>

      <div className="flex flex-wrap items-start gap-2">
        <Fold label="Sending from" defaultOpen={editable && written && !verified}>
          <MailboxForm mailbox={mailbox} action={testMailboxAction.bind(null, businessId, productId, workspace.id, campaign.id)} defaultLimit={MAILBOX_DAILY_LIMIT_DEFAULT} />
        </Fold>
        {editable ? (
          <>
            <Fold label="Schedule">
              <ScheduleForm campaign={campaign} steps={steps} mailboxLimit={mailbox?.dailyLimit ?? null} action={bind(saveScheduleAction)} />
            </Fold>
            <Fold label="Audience">
              <AudienceForm campaign={campaign} action={bind(saveAudienceAction)} />
            </Fold>
          </>
        ) : null}
        {campaign.status === "active" || campaign.status === "paused" ? (
          <Fold label="Finish campaign">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">A finished campaign sends nothing more and cannot be started again. Its results stay here.</p>
              <AiActionForm action={bind(finishCampaignAction)} buttonLabel="Finish campaign" pendingText="Finishing..." buttonProps={{ variant: "destructive" }} />
            </div>
          </Fold>
        ) : null}
      </div>
    </div>
  );
}

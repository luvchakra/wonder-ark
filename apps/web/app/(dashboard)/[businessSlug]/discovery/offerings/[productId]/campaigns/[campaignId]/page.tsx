import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { Fold } from "@cofounderai/core/ui/fold";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import {
  CampaignResultsView,
  CampaignStatusBadge,
  MailboxForm,
  OptionsForm,
  StepList,
  TemplateList,
  launchLines,
  leftOutText,
} from "@cofounderai/module-discovery/components/campaigns/campaign-parts";
import { LaunchButton } from "@cofounderai/module-discovery/components/campaigns/launch-button";
import { getCampaignDetail, getCampaignResults, launchBlocker, previewAudience } from "@cofounderai/module-discovery/lib/campaigns/campaigns";
import { MAILBOX_DAILY_LIMIT_DEFAULT, getSenderMailbox } from "@cofounderai/module-discovery/lib/campaigns/mailbox";
import { GENERAL_SEGMENT, dailyCheckIn } from "@cofounderai/module-discovery/lib/campaigns/types";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  finishCampaignAction,
  launchCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  saveOptionsAction,
  saveTemplateAction,
  testMailboxAction,
  writeMessagesAction,
} from "../actions";

/**
 * DISC-CAMP-P0-05.1 / 05.2: one campaign.
 *
 * Planned before markup (docs/design/claude-ui-design-rules.md). What the person is here
 * to do depends on where the campaign is, so the page has one primary action at a time
 * and the rest is folded:
 *
 *   draft, no text     Write messages
 *   draft, text ready  Launch, or in its place "Needs setup: connect a mailbox"
 *   running            Pause
 *   paused             Resume (the reason it paused is shown above it)
 *   finished           none: the results
 *
 * Below the action: who would be enrolled and why the rest are left out (draft), or the
 * funnel and each prospect's place in it (launched); then the steps and their text,
 * each labelled with where it came from. Folded: "Sending from" (the mailbox and its one
 * action, "Send a test to me"), "Options" (audience, hours, steps) and, once launched,
 * "Finish campaign".
 *
 * Visible controls with the folds closed: the primary action, the two or three folds,
 * one "Edit" per message while it is a draft, and one link per enrolled prospect.
 */
export default async function CampaignPage({ params }: { params: Promise<{ businessSlug: string; productId: string; campaignId: string }> }) {
  const { businessSlug, productId, campaignId } = await params;
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
  const draft = campaign.status === "draft";
  const [mailbox, preview, results] = await Promise.all([
    getSenderMailbox(workspace.id),
    draft ? previewAudience(campaign) : null,
    draft ? null : getCampaignResults(campaign.id),
  ]);

  const verified = mailbox?.status === "verified";
  const blocker = draft ? launchBlocker(detail, verified) : null;
  const written = steps.every((step) => templates.some((template) => template.step_id === step.id && template.segment === GENERAL_SEGMENT));
  const check = dailyCheckIn(campaign);
  const bind = <T extends unknown[], R>(action: (businessId: string, productId: string, campaignId: string, ...rest: T) => R) =>
    action.bind(null, businessId, productId, campaign.id) as (...rest: T) => R;
  const leftOut = preview ? leftOutText(preview.leftOut) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href={`${offeringPath}/campaigns`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Campaigns
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-medium">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          {campaign.status === "paused" && campaign.pause_reason ? <p className="text-sm text-muted-foreground">{campaign.pause_reason}</p> : null}
        </div>

        {draft && !written ? (
          <AiActionForm action={bind(writeMessagesAction)} buttonLabel="Write messages" pendingText="Writing..." />
        ) : draft && blocker?.status === "needs_setup" ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm">{blocker.message}</p>
        ) : draft && blocker ? (
          <p className="max-w-xs text-sm text-muted-foreground">{blocker.message}</p>
        ) : draft && mailbox ? (
          <LaunchButton action={bind(launchCampaignAction)} lines={launchLines({ campaign, wouldEnrol: preview?.enrol.length ?? 0, mailbox, steps })} />
        ) : campaign.status === "active" ? (
          <AiActionForm action={bind(pauseCampaignAction)} buttonLabel="Pause" pendingText="Pausing..." buttonProps={{ variant: "outline" }} />
        ) : campaign.status === "paused" ? (
          verified ? (
            <AiActionForm action={bind(resumeCampaignAction)} buttonLabel="Resume" pendingText="Resuming..." />
          ) : (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm">Needs setup: connect a mailbox</p>
          )
        ) : null}
      </div>

      {!check.inHours && campaign.status !== "completed" ? (
        <p role="status" className="rounded-md border bg-card p-3 text-sm">
          Emails are sent at the daily check, {check.time} in {campaign.timezone}, which is outside this campaign&apos;s sending hours ({campaign.send_from_hour}:00 to{" "}
          {campaign.send_to_hour}:00). Nothing will be sent until the hours include it; change them under Options.
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
              before launching. You can change the steps first, under Options.
            </p>
          </>
        ) : (
          <TemplateList
            steps={steps}
            templates={templates}
            editable={campaign.status !== "completed"}
            saveAction={(templateId) => saveTemplateAction.bind(null, businessId, productId, campaign.id, templateId)}
          />
        )}
        {draft && written && templates.length > 0 && (preview?.segments ?? []).some((entry) => !templates.some((template) => template.segment === entry.segment)) ? (
          <AiActionForm action={bind(writeMessagesAction)} buttonLabel="Write the missing messages" pendingText="Writing..." buttonProps={{ variant: "outline" }} />
        ) : null}
      </section>

      <div className="flex flex-wrap items-start gap-2">
        <Fold label="Sending from" defaultOpen={draft && written && !verified}>
          <MailboxForm mailbox={mailbox} action={testMailboxAction.bind(null, businessId, productId, workspace.id, campaign.id)} defaultLimit={MAILBOX_DAILY_LIMIT_DEFAULT} />
        </Fold>
        {campaign.status !== "completed" ? (
          <Fold label="Options">
            <OptionsForm campaign={campaign} steps={steps} action={saveOptionsAction.bind(null, businessId, productId, campaign.id, draft)} />
          </Fold>
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

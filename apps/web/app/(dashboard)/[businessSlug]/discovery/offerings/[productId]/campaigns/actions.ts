"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { businessPath } from "@/lib/business-path";
import {
  activateCampaign,
  confirmCampaignPreview,
  createCampaign,
  finishCampaign,
  pauseCampaign,
  replaceCampaignSteps,
  resumeCampaign,
  saveCampaignTemplate,
  updateCampaignSettings,
} from "@cofounderai/module-discovery/lib/campaigns/campaigns";
import { saveSenderMailbox, sendMailboxTest } from "@cofounderai/module-discovery/lib/campaigns/mailbox";
import { sendCampaignTest } from "@cofounderai/module-discovery/lib/campaigns/preview";
import { markTaskDone } from "@cofounderai/module-discovery/lib/campaigns/tasks";
import { runCampaignTick } from "@cofounderai/module-discovery/lib/campaigns/tick";
import { MAX_STEPS, type StepChannel, type TaskOutcome } from "@cofounderai/module-discovery/lib/campaigns/types";
import { writeCampaignMessages } from "@cofounderai/module-discovery/lib/campaigns/write-messages";

/**
 * DISC-CAMP-P0-05.1: the Campaigns pages' actions. Each one only passes on what the
 * form posted; the library resolves the workspace, checks the licence and
 * discovery.manage, and decides. A refusal is returned as state so its reason reaches
 * the screen (see `runAiAction`), never dressed as success.
 */

async function campaignsPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/campaigns`;
}

/** How many emails go out straight after Activate; the rest wait for the scheduled check. */
const FIRST_BATCH = 5;

export async function createCampaignAction(businessId: string, productId: string, workspaceId: string) {
  const id = await createCampaign(workspaceId);
  const path = await campaignsPath(businessId, productId);
  revalidatePath(path);
  redirect(`${path}/${id}`);
}

export async function writeMessagesAction(businessId: string, productId: string, campaignId: string): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await writeCampaignMessages(campaignId);
    revalidatePath(`${await campaignsPath(businessId, productId)}/${campaignId}`);
    if (outcome.status === "refused") throw new Error(outcome.message);
    if (outcome.failed.length > 0) {
      const written = outcome.written.length > 0 ? `Written for ${outcome.written.length} of ${outcome.written.length + outcome.failed.length}. ` : "";
      throw new Error(`${written}Not written for: ${outcome.failed.map((entry) => entry.segment).join(", ")}. ${outcome.failed[0]!.reason}`);
    }
  });
}

export async function saveTemplateAction(
  businessId: string,
  productId: string,
  campaignId: string,
  templateId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await saveCampaignTemplate(templateId, { subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") });
    if (outcome.status === "refused") throw new Error(outcome.message);
    revalidatePath(`${await campaignsPath(businessId, productId)}/${campaignId}`);
  });
}

const numberField = (formData: FormData, name: string) => {
  const raw = String(formData.get(name) ?? "").trim();
  return raw === "" ? null : Number(raw);
};

/** The folded "Audience" form: the campaign's name and who it enrols. */
export async function saveAudienceAction(businessId: string, productId: string, campaignId: string, _prevState: AiActionState, formData: FormData): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await updateCampaignSettings(campaignId, {
      name: String(formData.get("name") ?? ""),
      audience: {
        onlyQualified: formData.get("onlyQualified") !== null,
        minFitScore: numberField(formData, "minFitScore"),
        linesOfWork: String(formData.get("linesOfWork") ?? "").split(/[,;\n]/),
      },
      autoEnroll: formData.get("autoEnroll") !== null,
      includeUnverified: formData.get("includeUnverified") !== null,
    });
    if (outcome.status === "refused") throw new Error(outcome.message);
    revalidatePath(`${await campaignsPath(businessId, productId)}/${campaignId}`);
  });
}

/**
 * DISC-CAMP-P0-05.4: the folded "Schedule" form: emails a day for this campaign, the
 * days and hours, and how many emails the sequence has with the days between them.
 * Saving it clears the preview's confirmation (the database does that), so the page
 * asks for the preview again.
 */
export async function saveScheduleAction(businessId: string, productId: string, campaignId: string, _prevState: AiActionState, formData: FormData): Promise<AiActionState> {
  return runAiAction(async () => {
    const settings = await updateCampaignSettings(campaignId, {
      dailyLimit: numberField(formData, "dailyLimit"),
      sendDays: formData.getAll("sendDays").map(Number),
      sendFromHour: numberField(formData, "sendFromHour") ?? undefined,
      sendToHour: numberField(formData, "sendToHour") ?? undefined,
    });
    if (settings.status === "refused") throw new Error(settings.message);

    // Step 1 is always there, and an email; a later step exists when its days field is
    // filled. DISC-CAMP-P0-06.1: a later step is an email unless the form says a call, a
    // WhatsApp message or a LinkedIn message. The library refuses anything else.
    const steps: { channel: StepChannel; delayDays: number }[] = [{ channel: "email", delayDays: 0 }];
    for (let position = 2; position <= MAX_STEPS; position += 1) {
      const days = numberField(formData, `delayDays${position}`);
      if (days === null) break;
      steps.push({ channel: (String(formData.get(`channel${position}`) ?? "") || "email") as StepChannel, delayDays: days });
    }
    const changed = await replaceCampaignSteps(campaignId, steps);
    revalidatePath(`${await campaignsPath(businessId, productId)}/${campaignId}`);
    if (changed.status === "refused") throw new Error(changed.message);
  });
}

/**
 * DISC-CAMP-P0-05.3: "This looks right", at the bottom of the preview. Records the
 * confirmation and returns to the campaign, where Activate (or Resume) now shows.
 */
export async function confirmPreviewAction(businessId: string, productId: string, campaignId: string): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await confirmCampaignPreview(campaignId);
    if (outcome.status !== "saved") throw new Error(outcome.message);
    const path = `${await campaignsPath(businessId, productId)}/${campaignId}`;
    revalidatePath(path);
    redirect(path);
  });
}

export type TestSendState = { status: "sent" | "failed"; message: string } | null;

/**
 * "Send me a test": sends the previewed email of one line of work to the mailbox's own
 * address. Which email is named by where it is in the preview; there is no address to
 * post. What comes back says whether it was sent, failed, or has an unknown outcome.
 */
export async function sendTestAction(campaignId: string, segment: string, step: number, index: number): Promise<TestSendState> {
  try {
    const outcome = await sendCampaignTest(campaignId, { segment, step, index });
    return outcome.status === "sent"
      ? { status: "sent", message: `Sent to ${outcome.to}. Check that mailbox.` }
      : { status: "failed", message: outcome.status === "refused" ? outcome.message : `Not confirmed as sent. ${outcome.message}` };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "failed", message: error instanceof Error ? error.message : "The test could not be sent." };
  }
}

/**
 * Connect: saves what the form holds, then sends one message through the mailbox to the
 * acting user's own account address. The mailbox is verified only when the mail server
 * accepted that message. With the servers left blank they are worked out from the
 * address (`saveSenderMailbox`). The fold's fields are absent from the form while it is
 * closed, which reads the same as blank.
 */
export async function testMailboxAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  campaignId: string,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const field = (name: string) => String(formData.get(name) ?? "");
    const saved = await saveSenderMailbox(workspaceId, {
      fromName: field("fromName"),
      fromEmail: field("fromEmail"),
      smtpHost: field("smtpHost"),
      smtpPort: field("smtpPort"),
      username: field("username"),
      password: field("password"),
      imapHost: field("imapHost"),
      dailyLimit: field("dailyLimit"),
    });
    const path = `${await campaignsPath(businessId, productId)}/${campaignId}`;
    if (saved.status === "invalid") throw new Error(saved.message);
    const tested = await sendMailboxTest(workspaceId);
    revalidatePath(path);
    if (tested.status === "failed") {
      throw new Error(`Saved, but the test wasn't sent. ${tested.message}${saved.signInHint && /sign-in/.test(tested.message) ? ` ${saved.signInHint}` : ""}`);
    }
  });
}

/**
 * Activate: the opt-in. The library refuses it without a confirmed preview, a verified
 * mailbox, text for every email step, or anybody to enrol; the database refuses it
 * without the confirmation and the mailbox too. Once activated, a first small batch is
 * sent straight after the response, through the same tick as every later send; the
 * rest go at the scheduled check.
 */
export async function activateCampaignAction(businessId: string, productId: string, campaignId: string): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await activateCampaign(campaignId);
    revalidatePath(`${await campaignsPath(businessId, productId)}/${campaignId}`);
    if (outcome.status !== "activated") throw new Error(outcome.message);
    after(async () => {
      try {
        await runCampaignTick({ campaignId, maxSends: FIRST_BATCH });
      } catch (error) {
        console.error("The first campaign batch failed:", error instanceof Error ? error.message : error);
      }
    });
  });
}

/**
 * DISC-CAMP-P0-06.1: "Mark done" on a campaign task's row of the Today list. The person
 * made the call or sent the message themselves; this records how it went ("done" or
 * "not_reached") and moves the prospect to its next step. Nothing is sent. The library
 * reads the enrollment as the person, checks the licence and discovery.manage, and
 * records a step once however often this is pressed.
 */
export async function markTaskDoneAction(businessId: string, productId: string, enrollmentId: string, outcome: TaskOutcome): Promise<AiActionState> {
  return runAiAction(async () => {
    const result = await markTaskDone(enrollmentId, outcome);
    const path = await campaignsPath(businessId, productId);
    revalidatePath(path.replace(/\/campaigns$/, "/prospects"));
    revalidatePath(path, "layout");
    if (result.status === "refused") throw new Error(result.message);
  });
}

async function changeStatus(
  businessId: string,
  productId: string,
  campaignId: string,
  change: (id: string) => Promise<{ status: string; message?: string }>,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await change(campaignId);
    const path = await campaignsPath(businessId, productId);
    revalidatePath(path);
    revalidatePath(`${path}/${campaignId}`);
    if (outcome.status !== "saved") throw new Error(outcome.message ?? "The campaign could not be changed.");
  });
}

export const pauseCampaignAction = async (businessId: string, productId: string, campaignId: string) =>
  changeStatus(businessId, productId, campaignId, pauseCampaign);
export const resumeCampaignAction = async (businessId: string, productId: string, campaignId: string) =>
  changeStatus(businessId, productId, campaignId, resumeCampaign);
export const finishCampaignAction = async (businessId: string, productId: string, campaignId: string) =>
  changeStatus(businessId, productId, campaignId, finishCampaign);

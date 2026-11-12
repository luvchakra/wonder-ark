"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { runAiAction, type AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { businessPath } from "@/lib/business-path";
import {
  createCampaign,
  finishCampaign,
  launchCampaign,
  pauseCampaign,
  replaceCampaignSteps,
  resumeCampaign,
  saveCampaignTemplate,
  updateCampaignSettings,
} from "@cofounderai/module-discovery/lib/campaigns/campaigns";
import { saveSenderMailbox, sendMailboxTest } from "@cofounderai/module-discovery/lib/campaigns/mailbox";
import { runCampaignTick } from "@cofounderai/module-discovery/lib/campaigns/tick";
import { MAX_STEPS } from "@cofounderai/module-discovery/lib/campaigns/types";
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

/** How many emails go out straight after Launch; the rest wait for the scheduled check. */
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

/** The folded "Options" form: who is enrolled, when emails go out, and the steps. */
export async function saveOptionsAction(
  businessId: string,
  productId: string,
  campaignId: string,
  draft: boolean,
  _prevState: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  return runAiAction(async () => {
    const number = (name: string) => {
      const raw = String(formData.get(name) ?? "").trim();
      return raw === "" ? null : Number(raw);
    };
    const settings = await updateCampaignSettings(campaignId, {
      name: String(formData.get("name") ?? ""),
      audience: {
        onlyQualified: formData.get("onlyQualified") !== null,
        minFitScore: number("minFitScore"),
        linesOfWork: String(formData.get("linesOfWork") ?? "").split(/[,;\n]/),
      },
      sendDays: formData.getAll("sendDays").map(Number),
      sendFromHour: number("sendFromHour") ?? undefined,
      sendToHour: number("sendToHour") ?? undefined,
      autoEnroll: formData.get("autoEnroll") !== null,
      includeUnverified: formData.get("includeUnverified") !== null,
    });
    if (settings.status === "refused") throw new Error(settings.message);

    if (draft) {
      // Step 1 is always there; a later step exists when its days field is filled.
      const steps = [{ channel: "email" as const, delayDays: 0 }];
      for (let position = 2; position <= MAX_STEPS; position += 1) {
        const days = number(`delayDays${position}`);
        if (days === null) break;
        steps.push({ channel: "email" as const, delayDays: days });
      }
      const changed = await replaceCampaignSteps(campaignId, steps);
      if (changed.status === "refused") throw new Error(changed.message);
    }
    revalidatePath(`${await campaignsPath(businessId, productId)}/${campaignId}`);
  });
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
 * Launch: the opt-in. The library refuses it without a verified mailbox, without text
 * for every email step, or with nobody to enrol. Once launched, a first small batch is
 * sent straight after the response, through the same tick as every later send; the
 * rest go at the scheduled check.
 */
export async function launchCampaignAction(businessId: string, productId: string, campaignId: string): Promise<AiActionState> {
  return runAiAction(async () => {
    const outcome = await launchCampaign(campaignId);
    revalidatePath(`${await campaignsPath(businessId, productId)}/${campaignId}`);
    if (outcome.status !== "launched") throw new Error(outcome.message);
    after(async () => {
      try {
        await runCampaignTick({ campaignId, maxSends: FIRST_BATCH });
      } catch (error) {
        console.error("The first campaign batch failed:", error instanceof Error ? error.message : error);
      }
    });
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

import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "../../db/server";
import {
  WRITE_CAMPAIGN_MESSAGES_PROMPT_VERSION,
  writeCampaignMessagesPrompt,
} from "../../prompts/outreach/write_campaign_messages_v1";
import { hashInput } from "../ai/hash";
import { resolveAiModel, toAiProviderError } from "../ai/router";
import { recordAiRun } from "../ai/usage";
import { getIcpProfile } from "../icp/queries";
import { getBusiness, getProduct, getWorkspace } from "../tenancy/queries";
import { assertWithinUsageLimit } from "../usage/limits";
import { authoriseCampaigns, getCampaignDetail, previewAudience } from "./campaigns";
import { fieldsUsed, templateProblem } from "./render";
import { GENERAL_SEGMENT, type CampaignStep } from "./types";

/**
 * DISC-CAMP-P0-03.1: "Write messages". For a draft campaign, writes the text of every
 * email step, once for each line of work in the audience (the twelve most common) and
 * once for everyone else.
 *
 * What this code decides, whatever the model returns:
 *  - it runs only on a person's click, for a licensed member with discovery.manage, and
 *    passes the workspace's usage check before each request;
 *  - one request per line of work writes all the steps, and a request whose input has
 *    been answered before (same prompt, version and model) is not sent again: the
 *    earlier answer is copied from the template it was stored in;
 *  - the answer is a draft. It is stored as a template labelled AI-generated, which the
 *    person can read and edit before Activate; nothing is sent by writing it;
 *  - an answer is stored only if it has exactly the steps asked for, uses only the
 *    listed merge fields, stays inside the length limits and contains no link, address
 *    or phone number. Anything else is refused whole for that line of work and reported;
 *  - text a person has written or edited is never overwritten.
 */

const OPERATION = "write_campaign_messages";

const MessagesSchema = z.object({
  messages: z
    .array(
      z.object({
        step: z.number().int().describe("The step number this email is for"),
        subject: z.string().describe("Subject line, at most 9 words"),
        body: z.string().describe("The email body, 50 to 120 words, using only the allowed placeholders"),
      }),
    )
    .describe("One entry per step asked for"),
});

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|org|net|io|co|app|ai|biz|info)\b)/i;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;
const ADDRESS = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Why a written message cannot be stored, or null. Pure. */
export function writtenMessageProblem(subject: string, body: string, generalOnly: boolean): string | null {
  if (subject.trim().length < 3 || subject.length > 150) return "subject length";
  if (body.trim().length < 40 || body.length > 1800) return "body length";
  if (templateProblem(subject, body)) return "placeholder outside the list";
  const used = fieldsUsed(`${subject}\n${body}`).fields;
  if (used.includes("first_name")) return "uses a first name";
  if (generalOnly && used.includes("line_of_work")) return "names a line of work in the general text";
  const text = `${subject}\n${body}`;
  if (LINK.test(text)) return "contains a link";
  if (ADDRESS.test(text)) return "contains an email address";
  if (PHONE.test(text)) return "contains a phone number";
  if (/\[[^\]]{1,40}\]/.test(text)) return "bracket placeholder";
  return null;
}

export type WriteMessagesOutcome =
  | {
      status: "completed";
      /** Lines of work whose text was written or copied, the general one included. */
      written: string[];
      /** Lines of work whose text already existed and was left alone. */
      kept: string[];
      /** Lines of work the model's answer was refused for, with why. */
      failed: { segment: string; reason: string }[];
      modelCalls: number;
    }
  | { status: "refused"; message: string };

export async function writeCampaignMessages(campaignId: string): Promise<WriteMessagesOutcome> {
  const detail = await getCampaignDetail(campaignId);
  if (!detail) throw new Error("Campaign not found.");
  const { campaign, steps, templates } = detail;
  await authoriseCampaigns(campaign.workspace_id);
  // DISC-CAMP-P0-05.4: also while paused, for a follow-up that was added then.
  if (campaign.status !== "draft" && campaign.status !== "paused") {
    return { status: "refused", message: campaign.status === "active" ? "Pause the campaign to write or change its messages." : "A finished campaign can't be changed." };
  }

  const emailSteps = steps.filter((step) => step.channel === "email");
  if (emailSteps.length === 0) return { status: "refused", message: "This campaign has no email step to write." };

  const workspace = await getWorkspace(campaign.workspace_id);
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const business = product ? await getBusiness(product.business_id) : null;
  if (!product?.product_profile || !business) {
    return { status: "refused", message: "Generate the offering's profile on Overview first: the messages are written from it." };
  }
  const icp = await getIcpProfile(campaign.workspace_id);
  const idealCustomer = icp?.status === "approved" ? { painPoints: icp.pain_points ?? [], buyingSignals: icp.buying_signals ?? [] } : null;

  // A draft is written for the lines of work it would enrol. A paused campaign already
  // has its people: a step added to it is written for the lines of work it has text for.
  const lines =
    campaign.status === "draft"
      ? (await previewAudience(campaign)).segments.map((entry) => entry.segment)
      : [...new Set(templates.map((template) => template.segment))].filter((segment) => segment !== GENERAL_SEGMENT).sort();
  const segments = [GENERAL_SEGMENT, ...lines];

  const supabase = await createClient();
  const written: string[] = [];
  const kept: string[] = [];
  const failed: { segment: string; reason: string }[] = [];
  let modelCalls = 0;

  for (const segment of segments) {
    const missing = emailSteps.filter((step) => !templates.some((template) => template.step_id === step.id && template.segment === segment));
    if (missing.length === 0) {
      kept.push(segment);
      continue;
    }

    const prompt = writeCampaignMessagesPrompt({
      offeringName: product.name,
      businessName: business.name,
      productProfile: product.product_profile,
      idealCustomer,
      lineOfWork: segment === GENERAL_SEGMENT ? null : segment,
      steps: emailSteps.map((step) => ({ position: step.position, purpose: step.purpose, delayDays: step.delay_days })),
    });
    const { accountId, provider, modelId, model } = await resolveAiModel(campaign.workspace_id, OPERATION);
    const inputHash = hashInput({ prompt, version: WRITE_CAMPAIGN_MESSAGES_PROMPT_VERSION, model: modelId });

    // Asked before? Then the answer is already stored, in the templates that run produced.
    let messages: { step: number; subject: string; body: string }[] | null = null;
    let aiRunId: string | null = null;
    const { data: prior, error: priorError } = await supabase
      .from("ai_runs")
      .select("id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("operation", OPERATION)
      .eq("prompt_version", WRITE_CAMPAIGN_MESSAGES_PROMPT_VERSION)
      .eq("input_hash", inputHash)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priorError) throw priorError;
    if (prior) {
      const { data: cached, error: cachedError } = await supabase
        .from("outreach_templates")
        .select("step_id, subject, body, origin")
        .eq("workspace_id", campaign.workspace_id)
        .eq("ai_run_id", prior.id)
        .eq("origin", "ai_generated");
      if (cachedError) throw cachedError;
      // The earlier answer is usable only if it is still whole: one unedited text per step.
      const { data: cachedSteps, error: stepsError } = (cached ?? []).length
        ? await supabase.from("outreach_campaign_steps").select("id, position").in("id", (cached ?? []).map((row) => row.step_id))
        : { data: [], error: null };
      if (stepsError) throw stepsError;
      const positionOf = new Map(((cachedSteps ?? []) as { id: string; position: number }[]).map((step) => [step.id, step.position]));
      const copied = emailSteps.map((step) => {
        const hit = (cached ?? []).find((row) => positionOf.get(row.step_id) === step.position);
        return hit?.subject ? { step: step.position, subject: hit.subject as string, body: hit.body as string } : null;
      });
      if (copied.every((entry) => entry !== null)) {
        messages = copied as { step: number; subject: string; body: string }[];
        aiRunId = prior.id as string;
      }
    }

    if (!messages) {
      await assertWithinUsageLimit(campaign.workspace_id);
      const startedAt = Date.now();
      modelCalls += 1;
      try {
        const response = await generateObject({ model, schema: MessagesSchema, prompt });
        messages = response.object.messages;
        aiRunId = await recordAiRun({
          workspaceId: campaign.workspace_id,
          operation: OPERATION,
          model: modelId,
          promptVersion: WRITE_CAMPAIGN_MESSAGES_PROMPT_VERSION,
          inputHash,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          status: "succeeded",
          accountId,
          provider,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const aiError = toAiProviderError(error, provider);
        await recordAiRun({
          workspaceId: campaign.workspace_id,
          operation: OPERATION,
          model: modelId,
          promptVersion: WRITE_CAMPAIGN_MESSAGES_PROMPT_VERSION,
          inputHash,
          status: "failed",
          accountId,
          provider,
          durationMs: Date.now() - startedAt,
          errorCode: aiError.code,
        });
        // The provider is down or refused: say so, and keep what was already written.
        failed.push({ segment, reason: aiError.message });
        continue;
      }
    }

    const problem = checkAnswer(messages, emailSteps, segment === GENERAL_SEGMENT);
    if (problem) {
      failed.push({ segment, reason: `The text that came back couldn't be used (${problem}). Nothing was stored for it.` });
      continue;
    }

    const rows = missing.map((step) => {
      const message = messages!.find((entry) => entry.step === step.position)!;
      return {
        campaign_id: campaign.id,
        step_id: step.id,
        workspace_id: campaign.workspace_id,
        segment,
        subject: message.subject.replace(/\s+/g, " ").trim(),
        body: message.body.trim(),
        origin: "ai_generated",
        ai_run_id: aiRunId,
      };
    });
    // A text a person saved meanwhile wins: the unique key refuses the row and it is left.
    const { error: insertError } = await supabase.from("outreach_templates").upsert(rows, { onConflict: "step_id,segment", ignoreDuplicates: true });
    if (insertError) throw insertError;
    written.push(segment);
  }

  return { status: "completed", written, kept, failed, modelCalls };
}

/** The answer must cover exactly the steps asked for, each passing every check. */
function checkAnswer(messages: { step: number; subject: string; body: string }[], steps: CampaignStep[], generalOnly: boolean): string | null {
  if (!Array.isArray(messages)) return "not a list of messages";
  for (const step of steps) {
    const matches = messages.filter((entry) => entry?.step === step.position);
    if (matches.length !== 1) return `step ${step.position} missing or repeated`;
    const { subject, body } = matches[0]!;
    if (typeof subject !== "string" || typeof body !== "string") return `step ${step.position} has no text`;
    const problem = writtenMessageProblem(subject, body, generalOnly);
    if (problem) return `step ${step.position}: ${problem}`;
  }
  return null;
}

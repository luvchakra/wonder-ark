import { z } from "zod";
import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { getWorkspace, getProduct } from "../tenancy/queries";
import { getOutreachStrategy } from "../outreach/queries";
import type { Contact } from "../contacts/types";
import type { Message } from "../messages/types";
import {
  generateMessagePrompt,
  GENERATE_MESSAGE_PROMPT_VERSION,
} from "../../prompts/outreach/generate_message_v1";
import { hashInput } from "./hash";
import { OutreachMessageSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "generate_outreach_message";


/**
 * Only works from an *approved* strategy (blueprint §18: "Prospect -> Research -> Score
 * -> Strategy -> Founder Review -> Message"). Every message is created with status
 * "draft" -- generation never sends anything, matching blueprint §20's human-approval
 * gate on all outbound communication.
 */
export async function generateOutreachMessage(strategyId: string): Promise<Message> {
  const strategy = await getOutreachStrategy(strategyId);
  if (!strategy) throw new Error("Strategy not found.");
  if (strategy.status !== "approved") {
    throw new Error("Approve the strategy before generating a message.");
  }

  const prospect = await getProspect(strategy.prospect_id);
  if (!prospect) throw new Error("Prospect not found.");

  const workspace = await getWorkspace(prospect.workspace_id);
  if (!workspace) throw new Error("Workspace not found.");

  const product = await getProduct(workspace.product_id);
  if (!product?.product_profile) throw new Error("Product profile not found.");

  await assertWithinUsageLimit(workspace.id);

  const supabase = await createClient();
  let contact: Contact | null = null;
  if (strategy.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", strategy.contact_id)
      .maybeSingle();
    contact = data;
  }

  const prompt = generateMessagePrompt({
    productName: product.name,
    productProfile: product.product_profile,
    prospect,
    contact,
    strategy,
  });
  const promptVersion = GENERATE_MESSAGE_PROMPT_VERSION;

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({ prompt, version: promptVersion, model: modelId });

  const startedAt = Date.now();
  try {
    const response = await generateObject({ model, schema: OutreachMessageSchema, prompt });

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    // EMAIL-SMTP-01: written subject and body only; Resend templates are no longer used.
    const insertPayload = {
      subject: response.object.subject,
      content: response.object.body,
      resend_template_id: null,
      resend_template_name: null,
      template_variables: null,
    };

    const { data, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: workspace.id,
        prospect_id: prospect.id,
        contact_id: strategy.contact_id,
        channel: strategy.channel,
        direction: "outbound",
        status: "draft",
        ...insertPayload,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}

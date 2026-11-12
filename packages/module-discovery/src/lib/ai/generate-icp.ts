import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProduct, getWorkspaceForProduct } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { recordIcpProfileVersion } from "../icp/mutations";
import type { IcpProfile } from "../icp/types";
import {
  generateIcpPrompt,
  GENERATE_ICP_PROMPT_VERSION,
} from "../../prompts/icp/generate_icp_v2";
import { hashInput } from "./hash";
import { IcpProfileSchema, type IcpProfileDraft } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { hasRecentSuccess } from "./dedup";
import { resolveAiModel, toAiProviderError } from "./router";
import {
  generateConsumerIcpPrompt,
  GENERATE_CONSUMER_ICP_PROMPT_VERSION,
} from "../../prompts/icp/generate_consumer_icp_v1";
import {
  audienceTypeOf,
  IdealUserDraftSchema,
  readIdealUser,
  type IdealUser,
  type IdealUserDraft,
} from "../icp/audience";
import type { Product } from "../tenancy/types";

const OPERATION = "generate_icp";
/** DISC-CONS-P0-01.2: the Ideal user of a consumer offering. */
export const CONSUMER_OPERATION = "generate_consumer_icp";

type Model = Awaited<ReturnType<typeof resolveAiModel>>;

/** Asks for the company ICP. "cached" when an identical request succeeded moments ago
 * (a double-clicked "Regenerate") and there is an ICP to return. */
async function requestCompanyDraft(
  workspaceId: string,
  product: Product,
  existing: IcpProfile | null,
): Promise<IcpProfileDraft | "cached"> {
  const prompt = generateIcpPrompt({
    productName: product.name,
    profile: product.product_profile!,
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspaceId, OPERATION);
  const inputHash = hashInput({ prompt, version: GENERATE_ICP_PROMPT_VERSION, model: modelId });

  // Guards the force-regenerate path -- a double-click on "Regenerate" with nothing
  // changed would otherwise re-bill for identical input every time.
  if (existing && (await hasRecentSuccess(workspaceId, OPERATION, inputHash, undefined, modelId))) {
    return "cached";
  }

  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: IcpProfileSchema,
      prompt,
    });

    await recordAiRun({
      workspaceId,
      operation: OPERATION,
      model: modelId,
      promptVersion: GENERATE_ICP_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });
    return response.object;
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId,
      operation: OPERATION,
      model: modelId,
      promptVersion: GENERATE_ICP_PROMPT_VERSION,
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

/**
 * DISC-CONS-P0-01.2: asks for the Ideal user through `generate_consumer_icp_v1`, the
 * same AI layer, usage check and ledger as the company ICP. Cached by input: the stored
 * Ideal user names the input hash and prompt version it was written from, so a request
 * whose input (prompt, prompt version and model) has not changed is answered from the
 * stored draft and the model is not asked again. A person's edit drops that mark, so a
 * regenerate after an edit asks again.
 */
async function requestIdealUserDraft(
  workspaceId: string,
  product: Product,
  existing: IcpProfile | null,
): Promise<{ draft: IdealUserDraft; audience: IdealUser } | "cached"> {
  const prompt = generateConsumerIcpPrompt({
    productName: product.name,
    profile: product.product_profile,
    targetMarket: product.target_market ?? null,
  });
  const resolved: Model = await resolveAiModel(workspaceId, CONSUMER_OPERATION);
  const { accountId, provider, modelId, model } = resolved;
  const inputHash = hashInput({ prompt, version: GENERATE_CONSUMER_ICP_PROMPT_VERSION, model: modelId });

  const stored = readIdealUser(existing?.audience);
  if (
    stored?.generated_from?.input_hash === inputHash &&
    stored.generated_from.prompt_version === GENERATE_CONSUMER_ICP_PROMPT_VERSION
  ) {
    return "cached";
  }

  const startedAt = Date.now();
  let draft: IdealUserDraft;
  try {
    const response = await generateObject({ model, schema: IdealUserDraftSchema, prompt });
    draft = response.object;
    await recordAiRun({
      workspaceId,
      operation: CONSUMER_OPERATION,
      model: modelId,
      promptVersion: GENERATE_CONSUMER_ICP_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    // A provider failure and an answer that does not match the schema both land here:
    // recorded as failed, nothing stored.
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId,
      operation: CONSUMER_OPERATION,
      model: modelId,
      promptVersion: GENERATE_CONSUMER_ICP_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }

  const audience = readIdealUser(draft);
  if (!audience) throw new Error("The AI returned an empty ideal user. Nothing was saved; try again.");
  audience.generated_from = { input_hash: inputHash, prompt_version: GENERATE_CONSUMER_ICP_PROMPT_VERSION };
  return { draft, audience };
}

/**
 * Generates (or regenerates) an ICP draft from the product's approved profile.
 * Regenerating always overwrites the existing row and resets it to "draft" -- an
 * approved ICP is only skipped when the caller does NOT explicitly force it, so this
 * never silently clobbers founder-approved data (blueprint §13).
 *
 * DISC-CONS-P0-01.2: what is asked follows the offering's audience type. Companies: the
 * company ICP, as before. Consumers: the Ideal user, which also gives the ICP its name
 * and description. Both: the two, written to the row in one go as one version.
 */
export async function generateIcp(
  productId: string,
  options: { force?: boolean } = {},
): Promise<IcpProfile> {
  const product = await getProduct(productId);
  if (!product) throw new Error("Product not found.");
  if (!product.product_profile) {
    throw new Error("Generate a product profile before defining an ICP.");
  }

  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) throw new Error("Workspace not found for product.");

  const existing = await getIcpProfile(workspace.id);
  if (existing && existing.status === "approved" && !options.force) {
    return existing;
  }

  await assertWithinUsageLimit(workspace.id);

  const audienceType = audienceTypeOf(product);
  const company = audienceType === "consumer" ? null : await requestCompanyDraft(workspace.id, product, existing);
  const user = audienceType === "business" ? null : await requestIdealUserDraft(workspace.id, product, existing);

  const companyDraft = company === "cached" ? null : company;
  const userDraft = user === "cached" ? null : user;
  if (!companyDraft && !userDraft) {
    // Everything asked for was answered from what is already stored.
    return existing as IcpProfile;
  }

  const companyFields = companyDraft
    ? {
        name: companyDraft.name,
        description: companyDraft.description,
        industries: companyDraft.industries,
        company_sizes: companyDraft.company_sizes,
        geographies: companyDraft.geographies,
        roles: companyDraft.roles,
        pain_points: companyDraft.pain_points,
        buying_signals: companyDraft.buying_signals,
        exclusions: companyDraft.exclusions,
        revenue: companyDraft.revenue,
        business_model: companyDraft.business_model,
        technology: companyDraft.technology,
        growth_stage: companyDraft.growth_stage,
        existing_tools: companyDraft.existing_tools,
      }
    : {};
  // For a consumer offering the Ideal user names the ICP; beside a company ICP it does not.
  const userFields = userDraft
    ? {
        audience: userDraft.audience,
        ...(audienceType === "consumer" ? { name: userDraft.draft.name, description: userDraft.draft.description } : {}),
      }
    : {};
  const confidenceSource = companyDraft ?? userDraft?.draft;

  const supabase = await createClient();
  const { data, error: upsertError } = await supabase
    .from("icp_profiles")
    .upsert(
      {
        workspace_id: workspace.id,
        ...companyFields,
        ...userFields,
        confidence: confidenceSource?.confidence ?? null,
        evidence: [...(companyDraft?.evidence ?? []), ...(userDraft?.draft.evidence ?? [])],
        status: "draft",
        // DISC-OFFER-P0-14.2: "existing" (fetched above) is this workspace's ICP as it
        // stood before this AI write -- 0/undefined for a workspace with none yet.
        version: (existing?.version ?? 0) + 1,
      },
      { onConflict: "workspace_id" },
    )
    .select()
    .single();
  if (upsertError) throw upsertError;

  await recordIcpProfileVersion(data, "ai_generated");
  return data;
}

import { generateObject, generateText } from "ai";
import { createClient } from "../../db/server";
import { getWorkspace, getProduct } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { listProspects } from "../prospects/queries";
import { findDuplicateProspect } from "../prospects/duplicates";
import type { ProspectSuggestion } from "../prospects/types";
import {
  discoverProspectsPrompt,
  structureDiscoveryPrompt,
  DISCOVER_PROSPECTS_PROMPT_VERSION,
  type DiscoveryFilters,
} from "../../prompts/prospecting/discover_prospects_v1";
import { hashInput } from "./hash";
import { DiscoveredProspectsSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { acquireDiscoveryLock, releaseDiscoveryLock } from "./discovery-lock";
import { resolveAiModel, toAiProviderError } from "./router";
import { createWebSearchTools } from "@cofounderai/core/ai/provider-factory";
import { WEB_SEARCH_SOURCE_ID, WEB_SEARCH_SOURCE_LABEL } from "../data-sources/types";

const OPERATION = "discover_prospects";

/**
 * Finds up to 10 new prospect companies matching the workspace's approved ICP by
 * searching the live web -- same two-call pattern as researchProspect, through the BYOK
 * router: the operation's "reasoning" tier plus that provider's own provider-executed
 * web search tool gathers findings, then the "fast" tier (via modelAtTier, no second
 * credential fetch) structures them. Results are stored as *suggestions*, never inserted
 * straight into `prospects`: a noisy search or a loose ICP should never silently pollute
 * the real pipeline. The founder reviews and approves/discards each one in the UI.
 *
 * Anthropic's maxUses is capped at 6 in provider-factory.ts's createWebSearchTools, not
 * 10 -- production data showed 10 let this run up to 300K+ input tokens ($0.60-0.80/call)
 * without a corresponding quality gain; 6 covers 10 companies in practice, and the prompt
 * now explicitly tells the model to stop once it has enough evidence rather than
 * exhausting the budget by default (ai-usage-cost-requirements R3).
 * No input-hash dedup here (unlike understandProduct/generateIcp/researchProspect) --
 * the ICP + known-companies list this searches from shifts as prospects are added, so
 * there's no stable "same input" to key off; an explicit per-workspace lock (R6) is what
 * stops two overlapping runs from both billing instead.
 *
 * `filters` (industry/companySize/location/keywords) let the founder narrow a single
 * search run beyond the ICP's own broader criteria -- e.g. the ICP allows "50-500
 * employees" across three industries, but this run should only look at fintech in
 * Bangalore. They're query-time only, never written back to the ICP.
 *
 * `maxResults` (default 10, the manual Discover page's own count) narrows how many
 * distinct companies this run looks for -- the auto-populate flow (product page's "Let
 * AI Auto-Populate Info") passes 1, so a first-time setup costs one company's worth of
 * search tokens rather than ten, on the assumption the founder will review Overview/ICP
 * and run a full Discover pass themselves once satisfied with those.
 */
export async function discoverProspects(
  workspaceId: string,
  filters?: DiscoveryFilters,
  maxResults = 10,
): Promise<ProspectSuggestion[]> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  const product = await getProduct(workspace.product_id);
  if (!product) throw new Error("Product not found.");
  if (!product.product_profile) {
    throw new Error("Generate a product profile before discovering prospects.");
  }

  const icp = await getIcpProfile(workspaceId);
  if (!icp || icp.status !== "approved") {
    throw new Error("Approve an ICP before discovering prospects.");
  }

  await acquireDiscoveryLock(workspaceId);
  try {
    await assertWithinUsageLimit(workspaceId);

    const existing = await listProspects(workspaceId, {});
    const knownCompanies = existing.map((p) => p.company_name);

    const prompt = discoverProspectsPrompt({
      productName: product.name,
      productProfile: product.product_profile,
      icp,
      knownCompanies,
      filters,
      maxResults,
    });

    const { accountId, provider, modelId, model, modelAtTier } = await resolveAiModel(
      workspaceId,
      OPERATION,
    );
    const inputHash = hashInput({
      prompt,
      version: DISCOVER_PROSPECTS_PROMPT_VERSION,
      model: modelId,
    });

    const startedAt = Date.now();
    try {
      const searchResponse = await generateText({
        model,
        tools: createWebSearchTools(provider),
        prompt,
      });

      const findings = searchResponse.text.trim();
      if (!findings) throw new Error("Prospect discovery returned no findings.");

      const structureResponse = await generateObject({
        model: modelAtTier("fast"),
        schema: DiscoveredProspectsSchema,
        prompt: structureDiscoveryPrompt(findings, maxResults),
      });

      // The known-companies list above is a soft signal to the model (prompt-level);
      // this is the actual enforcement, via the same shared check manual add and CSV
      // import use (docs/prospects-pipeline-redesign-requirements.md R9) -- domain
      // first, name second -- rather than the exact-name-only match this used to do.
      const candidates: typeof structureResponse.object.prospects = [];
      for (const candidate of structureResponse.object.prospects) {
        if (candidates.length >= maxResults) break;
        const duplicate = await findDuplicateProspect(workspaceId, {
          companyName: candidate.company_name,
          website: candidate.website,
        });
        if (!duplicate) candidates.push(candidate);
      }

      await recordAiRun({
        workspaceId,
        operation: OPERATION,
        model: modelId,
        promptVersion: DISCOVER_PROSPECTS_PROMPT_VERSION,
        inputHash,
        inputTokens:
          (searchResponse.usage.inputTokens ?? 0) + (structureResponse.usage.inputTokens ?? 0),
        outputTokens:
          (searchResponse.usage.outputTokens ?? 0) + (structureResponse.usage.outputTokens ?? 0),
        searchCount: searchResponse.toolCalls.length,
        status: "succeeded",
        accountId,
        provider,
        durationMs: Date.now() - startedAt,
      });

      if (candidates.length === 0) return [];

      const supabase = await createClient();
      const { data, error } = await supabase
        .from("prospect_suggestions")
        .insert(
          candidates.map((c) => ({
            workspace_id: workspaceId,
            company_name: c.company_name,
            website: c.website,
            industry: c.industry,
            company_size: c.company_size,
            location: c.location,
            description: c.description,
            match_reason: c.match_reason,
            source_url: c.source_url,
            // DISC-DATA-P0-01.2: every suggestion says which source found it.
            source: WEB_SEARCH_SOURCE_ID,
            source_name: WEB_SEARCH_SOURCE_LABEL,
          })),
        )
        .select();
      if (error) throw error;
      return data;
    } catch (error) {
      const aiError = toAiProviderError(error, provider);
      await recordAiRun({
        workspaceId,
        operation: OPERATION,
        model: modelId,
        promptVersion: DISCOVER_PROSPECTS_PROMPT_VERSION,
        inputHash,
        status: "failed",
        accountId,
        provider,
        durationMs: Date.now() - startedAt,
        errorCode: aiError.code,
      });
      throw aiError;
    }
  } finally {
    await releaseDiscoveryLock(workspaceId);
  }
}

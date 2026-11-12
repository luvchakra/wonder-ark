import { generateObject } from "ai";
import { z } from "zod";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { hashInput } from "../ai/hash";
import { resolveAiModel, toAiProviderError } from "../ai/router";
import { recordAiRun } from "../ai/usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { getIcpProfile } from "../icp/queries";
import { updateIcpProfile } from "../icp/mutations";
import { IDEAL_USER_LIST_FIELDS, idealUserContent, readIdealUser, type IdealUserListField } from "../icp/audience";
import { getBusinessIdForWorkspace, getProduct, getWorkspace } from "../tenancy/queries";
import { SUMMARIZE_FEEDBACK_PROMPT_VERSION, summarizeFeedbackPrompt } from "../../prompts/audience/summarize_feedback_v1";
import { cleanLine } from "./rules";

/**
 * DISC-CONS-P0-04.2/04.3: "What people say", and the Ideal-user edit a theme suggests.
 *
 * The model proposes; code decides: the entries a theme cites must be ones it was given
 * (and are stored as their ids, so the screen links to them), a suggestion must name a
 * known Ideal-user list field, and the summary is stored as AI-generated. One summary per
 * distinct input (the entries, the prompt version and the model), so the same feedback
 * is never summarised twice. A suggested edit changes the ICP only when a person accepts
 * it, and then as their edit (a new draft version to approve).
 */

export const OPERATION = "summarize_audience_feedback";
/** How many of the newest entries a summary reads. */
export const MAX_ENTRIES = 100;

export type Theme = {
  title: string;
  summary: string;
  entryIds: string[];
  suggestion: { field: IdealUserListField; items: string[] } | null;
};

export type ThemesSummary = {
  id: string;
  workspace_id: string;
  themes: Theme[];
  entry_count: number;
  prompt_version: string;
  created_at: string;
};

const ThemesSchema = z.object({
  themes: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        entries: z.array(z.string()),
        suggestion: z.object({ field: z.string(), items: z.array(z.string()) }).nullable(),
      }),
    )
    .max(10),
});

/** Code's check on the model's answer: unknown references dropped, a theme with no
 * known entries dropped, a suggestion kept only for a known field with items. */
export function checkThemes(raw: z.infer<typeof ThemesSchema>, idByRef: Map<string, string>): Theme[] {
  const themes: Theme[] = [];
  for (const theme of raw.themes) {
    const title = cleanLine(theme.title, 120);
    const summary = cleanLine(theme.summary, 600);
    const entryIds = [...new Set(theme.entries.map((ref) => idByRef.get(ref.trim().toUpperCase())).filter((id): id is string => Boolean(id)))];
    if (!title || !summary || entryIds.length === 0) continue;
    let suggestion: Theme["suggestion"] = null;
    if (theme.suggestion && (IDEAL_USER_LIST_FIELDS as readonly string[]).includes(theme.suggestion.field)) {
      const items = theme.suggestion.items.map((item) => cleanLine(item, 120)).filter((item): item is string => item !== null).slice(0, 5);
      if (items.length > 0) suggestion = { field: theme.suggestion.field as IdealUserListField, items };
    }
    themes.push({ title, summary, entryIds, suggestion });
    if (themes.length >= 6) break;
  }
  return themes;
}

export async function getLatestThemes(workspaceId: string): Promise<ThemesSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audience_themes")
    .select("id, workspace_id, themes, entry_count, prompt_version, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ThemesSummary | null) ?? null;
}

export type SummariseOutcome =
  | { status: "completed"; summary: ThemesSummary; cached: boolean }
  | { status: "empty" }
  | { status: "failed"; message: string };

export async function summariseWhatPeopleSay(workspaceId: string): Promise<SummariseOutcome> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) return { status: "failed", message: "Workspace not found." };
  await requireModule(businessId, "discovery");

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("audience_feedback")
    .select("id, kind, body, tags, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(MAX_ENTRIES);
  if (error) throw error;
  const entries = (rows ?? []).slice().reverse();
  if (entries.length === 0) return { status: "empty" };

  const workspace = await getWorkspace(workspaceId);
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const icp = await getIcpProfile(workspaceId);
  const idByRef = new Map(entries.map((entry, index) => [`E${index + 1}`, entry.id as string]));
  const prompt = summarizeFeedbackPrompt({
    offeringName: product?.name ?? "this offering",
    idealUser: idealUserContent(readIdealUser(icp?.audience)),
    entries: entries.map((entry, index) => ({
      ref: `E${index + 1}`,
      kind: entry.kind as string,
      tags: (entry.tags as string[]) ?? [],
      body: entry.body as string,
    })),
    fields: IDEAL_USER_LIST_FIELDS,
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspaceId, OPERATION);
  const inputHash = hashInput({ prompt, version: SUMMARIZE_FEEDBACK_PROMPT_VERSION, model: modelId });

  const { data: cached, error: cacheError } = await supabase
    .from("audience_themes")
    .select("id, workspace_id, themes, entry_count, prompt_version, created_at")
    .eq("workspace_id", workspaceId)
    .eq("input_hash", inputHash)
    .maybeSingle();
  if (cacheError) throw cacheError;
  if (cached) return { status: "completed", summary: cached as ThemesSummary, cached: true };

  await assertWithinUsageLimit(workspaceId);

  const startedAt = Date.now();
  let raw: z.infer<typeof ThemesSchema>;
  let aiRunId: string | null;
  try {
    const response = await generateObject({ model, schema: ThemesSchema, prompt });
    raw = response.object;
    aiRunId = await recordAiRun({
      workspaceId,
      operation: OPERATION,
      model: modelId,
      promptVersion: SUMMARIZE_FEEDBACK_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });
  } catch (cause) {
    const aiError = toAiProviderError(cause, provider);
    await recordAiRun({
      workspaceId,
      operation: OPERATION,
      model: modelId,
      promptVersion: SUMMARIZE_FEEDBACK_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }

  const themes = checkThemes(raw, idByRef);
  if (themes.length === 0) return { status: "failed", message: "The AI's summary didn't cite any of the feedback, so it wasn't saved. Try again." };

  const { data: saved, error: saveError } = await supabase
    .from("audience_themes")
    .insert({
      workspace_id: workspaceId,
      input_hash: inputHash,
      prompt_version: SUMMARIZE_FEEDBACK_PROMPT_VERSION,
      themes,
      entry_count: entries.length,
      ai_run_id: aiRunId,
    })
    .select("id, workspace_id, themes, entry_count, prompt_version, created_at")
    .single();
  if (saveError) throw saveError;
  return { status: "completed", summary: saved as ThemesSummary, cached: false };
}

/** The suggestion of one theme of one summary, read through the member's session. */
export async function getThemeSuggestion(
  workspaceId: string,
  summaryId: string,
  index: number,
): Promise<{ theme: Theme; suggestion: NonNullable<Theme["suggestion"]> } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audience_themes")
    .select("themes")
    .eq("workspace_id", workspaceId)
    .eq("id", summaryId)
    .maybeSingle();
  if (error) throw error;
  const theme = Array.isArray(data?.themes) ? (data.themes[index] as Theme | undefined) : undefined;
  if (!theme?.suggestion || !(IDEAL_USER_LIST_FIELDS as readonly string[]).includes(theme.suggestion.field)) return null;
  return { theme, suggestion: theme.suggestion };
}

/**
 * DISC-CONS-P0-04.3: a person accepts a theme's suggested Ideal-user edit. The items are
 * added to that field (nothing removed) as the person's own edit: a new version, back to
 * draft for approval, recorded as offering feedback like any edit over the AI's words.
 * Rejecting needs no write: nothing changed.
 */
export async function acceptThemeSuggestion(workspaceId: string, summaryId: string, index: number): Promise<void> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");
  const found = await getThemeSuggestion(workspaceId, summaryId, index);
  if (!found) throw new Error("That suggestion is no longer available.");
  const icp = await getIcpProfile(workspaceId);
  if (!icp) throw new Error("Generate the ideal user first.");

  const current = idealUserContent(readIdealUser(icp.audience)) ?? {
    who: "",
    goals: [],
    triggers: [],
    current_solutions: [],
    interests: [],
    online_places: [],
    offline_places: [],
    words: [],
  };
  const field = found.suggestion.field;
  const merged = [...current[field]];
  for (const item of found.suggestion.items) {
    if (!merged.some((existing) => existing.toLowerCase() === item.toLowerCase())) merged.push(item);
  }
  await updateIcpProfile(icp.id, {
    name: icp.name,
    description: icp.description ?? "",
    industries: icp.industries,
    companySizes: icp.company_sizes,
    geographies: icp.geographies,
    roles: icp.roles,
    painPoints: icp.pain_points,
    buyingSignals: icp.buying_signals,
    exclusions: icp.exclusions,
    revenue: icp.revenue,
    businessModel: icp.business_model,
    technology: icp.technology,
    growthStage: icp.growth_stage,
    existingTools: icp.existing_tools,
    audience: { ...current, [field]: merged },
  });
}

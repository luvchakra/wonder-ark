import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { z } from "zod";
import { hashInput } from "../ai/hash";
import { resolveAiModel, toAiProviderError } from "../ai/router";
import { recordAiRun } from "../ai/usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { validateOpeningLine } from "./opening-text";
import { WRITE_OPENING_LINE_PROMPT_VERSION, writeOpeningLinePrompt, type OpeningLineInput } from "../../prompts/outreach/write_opening_line_v1";

/**
 * DISC-CAMP-P0-03.2: the optional personal opening line.
 *
 * When a campaign has "Personal opening line" on, the first email to each prospect
 * starts with one AI-written sentence about that company. The rest of the email is the
 * reviewed text. What this code decides, not the model:
 *  - the sentence is checked here (`validateOpeningLine`): length, one line, no links,
 *    addresses, phone numbers, merge fields, markup or instruction-like text. A sentence
 *    that fails is never used;
 *  - it is written once per (campaign, prospect, input) and kept in
 *    `discovery.outreach_opening_lines`, so the preview, the test and the tick use the
 *    same sentence and the model is asked once (principle 5);
 *  - each call is metered by the workspace's usage limit and recorded in `ai_runs`;
 *  - nothing here throws to the caller. Without a valid sentence (limit reached, the
 *    provider down, a refused sentence) the email goes out as the reviewed text alone,
 *    and the reason is returned so the preview can say so.
 *
 * The caller has already authorised the person or the tick; writes go through the
 * service-role client passed in, scoped to the campaign's own workspace.
 */

export const OPERATION = "write_opening_line";
export const OpeningLineSchema = z.object({ line: z.string().max(1_000) });

export type OpeningLine = { ok: true; line: string; cached: boolean } | { ok: false; reason: string };

/** What the prompt is told about a prospect, from its record. */
export function openingProspect(prospect: {
  company_name: string;
  industry?: string | null;
  location?: string | null;
  description?: string | null;
  website?: string | null;
}): OpeningLineInput["prospect"] {
  return {
    companyName: prospect.company_name,
    lineOfWork: prospect.industry ?? null,
    location: prospect.location ?? null,
    description: prospect.description ?? null,
    website: prospect.website ?? null,
  };
}

export type OpeningDeps = {
  generate?: (prompt: string, model: unknown) => Promise<{ object: unknown; usage: { inputTokens?: number; outputTokens?: number } }>;
};

const defaultGenerate: NonNullable<OpeningDeps["generate"]> = async (prompt, model) => {
  const response = await generateObject({ model: model as Parameters<typeof generateObject>[0]["model"], schema: OpeningLineSchema, prompt });
  return { object: response.object, usage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens } };
};

/** The opening line for one prospect of one campaign: the kept one, or a new one. */
export async function getOpeningLine(
  admin: SupabaseClient,
  input: { workspaceId: string; campaignId: string; prospectId: string } & OpeningLineInput,
  deps: OpeningDeps = {},
): Promise<OpeningLine> {
  const prompt = writeOpeningLinePrompt(input);
  const inputHash = hashInput({ prompt, version: WRITE_OPENING_LINE_PROMPT_VERSION });

  const { data: kept, error: keptError } = await admin
    .from("outreach_opening_lines")
    .select("line")
    .eq("campaign_id", input.campaignId)
    .eq("prospect_id", input.prospectId)
    .eq("input_hash", inputHash)
    .maybeSingle();
  if (keptError) return { ok: false, reason: "No opening line: it could not be read" };
  if (kept) return { ok: true, line: (kept as { line: string }).line, cached: true };

  try {
    await assertWithinUsageLimit(input.workspaceId, admin);
  } catch {
    return { ok: false, reason: "No opening line: this month's AI usage limit is reached" };
  }

  let resolved: Awaited<ReturnType<typeof resolveAiModel>>;
  try {
    resolved = await resolveAiModel(input.workspaceId, OPERATION, admin);
  } catch (error) {
    return { ok: false, reason: `No opening line: ${error instanceof Error ? error.message : "no AI provider"}` };
  }
  const { accountId, provider, modelId, model } = resolved;
  const startedAt = Date.now();
  const run = { workspaceId: input.workspaceId, operation: OPERATION, model: modelId, promptVersion: WRITE_OPENING_LINE_PROMPT_VERSION, inputHash, client: admin, accountId, provider };

  let raw: string;
  let aiRunId: string | null;
  try {
    const response = await (deps.generate ?? defaultGenerate)(prompt, model);
    const parsed = OpeningLineSchema.safeParse(response.object);
    aiRunId = await recordAiRun({
      ...run,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: parsed.success ? "succeeded" : "failed",
      durationMs: Date.now() - startedAt,
      errorCode: parsed.success ? undefined : "invalid_output",
    });
    if (!parsed.success) return { ok: false, reason: "No opening line: the AI's answer was not in the expected form" };
    raw = parsed.data.line;
  } catch (error) {
    await recordAiRun({ ...run, status: "failed", durationMs: Date.now() - startedAt, errorCode: toAiProviderError(error, provider).code });
    return { ok: false, reason: "No opening line: the AI provider could not be reached" };
  }

  const checked = validateOpeningLine(raw);
  if (!checked.ok) return { ok: false, reason: `No opening line: the one written was refused because ${checked.reason}` };

  const { error: insertError } = await admin.from("outreach_opening_lines").upsert(
    {
      workspace_id: input.workspaceId,
      campaign_id: input.campaignId,
      prospect_id: input.prospectId,
      input_hash: inputHash,
      prompt_version: WRITE_OPENING_LINE_PROMPT_VERSION,
      line: checked.line,
      ai_run_id: aiRunId,
    },
    { onConflict: "campaign_id,prospect_id,input_hash", ignoreDuplicates: true },
  );
  if (insertError) return { ok: false, reason: "No opening line: it could not be kept" };
  // Two callers at once may both have written one; the kept row is the one used.
  const { data: winner } = await admin
    .from("outreach_opening_lines")
    .select("line")
    .eq("campaign_id", input.campaignId)
    .eq("prospect_id", input.prospectId)
    .eq("input_hash", inputHash)
    .maybeSingle();
  return { ok: true, line: (winner as { line: string } | null)?.line ?? checked.line, cached: false };
}

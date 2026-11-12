import { createClient } from "../../db/server";
import { detectIcpFieldCorrections } from "../offerings/offering-feedback";
import { readIdealUser, idealUserContent } from "./audience";
import type { IcpProfile, IcpProfileVersionSource } from "./types";

type IcpFieldsInput = {
  name: string;
  description: string;
  industries: string[];
  companySizes: string[];
  geographies: string[];
  roles: string[];
  painPoints: string[];
  buyingSignals: string[];
  exclusions: string[];
  revenue: string[];
  businessModel: string[];
  technology: string[];
  growthStage: string[];
  existingTools: string[];
  /** DISC-CONS-P0-01.2: the Ideal user's fields as the form posted them. Left out by a
   * form that has none (an offering sold to companies only), which leaves the stored
   * Ideal user as it is. */
  audience?: unknown;
};

function icpFieldsToRow(input: IcpFieldsInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  return {
    name,
    description: input.description.trim() || null,
    industries: input.industries,
    company_sizes: input.companySizes,
    geographies: input.geographies,
    roles: input.roles,
    pain_points: input.painPoints,
    buying_signals: input.buyingSignals,
    exclusions: input.exclusions,
    revenue: input.revenue,
    business_model: input.businessModel,
    technology: input.technology,
    growth_stage: input.growthStage,
    existing_tools: input.existingTools,
    // A person's edit is no longer what the AI wrote, so it carries no `generated_from`.
    ...(input.audience !== undefined ? { audience: idealUserContent(readIdealUser(input.audience)) } : {}),
  };
}

/**
 * DISC-OFFER-P0-14.2: snapshots an ICP's own current content as its own immutable
 * version row -- called by every mutation below right after it writes new content, with
 * the just-written row (so the snapshot always matches exactly what the live row now
 * holds) and which of the two things that can produce new ICP content did it. Exported
 * so `generateIcp` (`lib/ai/generate-icp.ts`, a different file -- the AI-generation path
 * lives there, not here) can call it too rather than duplicating the insert.
 */
export async function recordIcpProfileVersion(icp: IcpProfile, source: IcpProfileVersionSource): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("icp_profile_versions").insert({
    workspace_id: icp.workspace_id,
    icp_id: icp.id,
    version: icp.version,
    source,
    name: icp.name,
    description: icp.description,
    industries: icp.industries,
    company_sizes: icp.company_sizes,
    geographies: icp.geographies,
    roles: icp.roles,
    pain_points: icp.pain_points,
    buying_signals: icp.buying_signals,
    exclusions: icp.exclusions,
    revenue: icp.revenue,
    business_model: icp.business_model,
    technology: icp.technology,
    growth_stage: icp.growth_stage,
    existing_tools: icp.existing_tools,
    audience: icp.audience ?? null,
    confidence: icp.confidence,
    evidence: icp.evidence,
    status: icp.status,
  });
  if (error) throw error;
}

/**
 * DISC-OFFER-P1-04.1: "Learn From User Edits" -- only worth recording as feedback on the
 * AI when the content this edit is overwriting was itself the AI's own last claim, not a
 * founder correcting their own prior edit (there is no "AI value" to compare against in
 * that case). `previous.version === 0` means this ICP has never been snapshotted at all
 * (predates DISC-OFFER-P0-14.2, or has never been written to since) -- its provenance is
 * genuinely unknown, so "never manufacture missing information" (the same restraint
 * DISC-OFFER-P1-03.2 already applied) means skipping rather than guessing.
 *
 * Never lets a feedback-capture failure break the actual save that already succeeded --
 * the same "never let a logging failure break the caller's actual result" restraint
 * `recordAiRun` (`lib/ai/usage.ts`) already established for a comparable secondary,
 * non-essential write.
 */
async function captureOfferingFeedbackIfAiOverwritten(previous: IcpProfile, updated: IcpProfile): Promise<void> {
  if (previous.version < 1) return;
  try {
    const supabase = await createClient();
    const { data: lastVersion, error: lastVersionError } = await supabase
      .from("icp_profile_versions")
      .select("source")
      .eq("icp_id", previous.id)
      .eq("version", previous.version)
      .maybeSingle();
    if (lastVersionError) throw lastVersionError;
    if (!lastVersion || lastVersion.source !== "ai_generated") return;

    const corrections = detectIcpFieldCorrections(previous, updated);
    if (corrections.length === 0) return;

    const { error: insertError } = await supabase.from("offering_feedback").insert(
      corrections.map((correction) => ({
        workspace_id: updated.workspace_id,
        icp_id: updated.id,
        field_name: correction.field,
        ai_value: correction.aiValue,
        user_value: correction.userValue,
      })),
    );
    if (insertError) throw insertError;
  } catch (error) {
    console.error("Failed to record offering_feedback entry:", error instanceof Error ? error.message : error);
  }
}

/**
 * Any manual edit resets status to draft -- it must be explicitly re-approved.
 *
 * DISC-OFFER-P0-13.1: also clears `confidence`/`evidence` -- both describe how well the
 * *pre-edit* claims were grounded in the product profile; once a founder hand-edits any
 * field, that assessment no longer honestly describes what's now on the row. Same "don't
 * let a stale AI judgment linger over content a human has since changed" call as the
 * `status` reset just above, not a new precedent.
 *
 * DISC-OFFER-P0-14.2: also bumps `version` and records a `user_edit` snapshot of the
 * result -- a manual Save is one of exactly two things that ever overwrite ICP content
 * (the other, AI regeneration, is versioned in `generateIcp` instead). Reads the row's
 * current version first (a plain read-then-write, not an atomic increment -- the same
 * single-flight assumption `markPipelineStageRunning`, DISC-OFFER-P0-10.2, already
 * accepts for its own version bump: nothing in this module lets two saves of the same
 * ICP race each other).
 *
 * DISC-OFFER-P1-04.1: also captures structured offering feedback for any field whose
 * value actually changed, when the content being overwritten was itself the AI's own
 * last claim -- see `captureOfferingFeedbackIfAiOverwritten` above. Reads the full
 * pre-edit row (not just `version`, as before this story) so there is something to diff
 * against.
 */
export async function updateIcpProfile(icpId: string, input: IcpFieldsInput): Promise<IcpProfile> {
  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("icp_profiles")
    .select("*")
    .eq("id", icpId)
    .single();
  if (currentError) throw currentError;

  const { data, error } = await supabase
    .from("icp_profiles")
    .update({ ...icpFieldsToRow(input), status: "draft", confidence: null, evidence: [], version: current.version + 1 })
    .eq("id", icpId)
    .select()
    .single();
  if (error) throw error;
  await recordIcpProfileVersion(data, "user_edit");
  await captureOfferingFeedbackIfAiOverwritten(current, data);
  return data;
}

/**
 * DISC-OFFER-P0-02.2's "ICP can be cloned" -- copies every field from one offering's ICP
 * onto another's, since `icp_profiles.workspace_id` is unique (one ICP per workspace,
 * and therefore per offering): "clone" means overwrite-or-create the target's own row
 * with the source's values, not a second row. Reset to `draft` either way -- a cloned
 * ICP still needs the founder's own review/approval for its new offering, the same as
 * any other edit.
 *
 * DISC-OFFER-P0-14.2: a clone overwrites the *target* workspace's own existing ICP
 * content exactly like a manual edit does, so it versions the same way -- bumps the
 * target's own version (0 if this workspace never had an ICP at all yet) and records a
 * `user_edit` snapshot: a clone is a human clicking "Clone", not a new AI generation, so
 * it reads as the human side of this story's own closed two-value vocabulary rather than
 * a third value the doc never asked for (flagged in this story's own audit-log entry).
 */
export async function cloneIcpProfileToWorkspace(sourceIcpId: string, targetWorkspaceId: string): Promise<IcpProfile> {
  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase.from("icp_profiles").select("*").eq("id", sourceIcpId).single();
  if (sourceError) throw sourceError;

  const { data: existingTarget, error: existingTargetError } = await supabase
    .from("icp_profiles")
    .select("version")
    .eq("workspace_id", targetWorkspaceId)
    .maybeSingle();
  if (existingTargetError) throw existingTargetError;

  const row = {
    workspace_id: targetWorkspaceId,
    name: source.name,
    description: source.description,
    industries: source.industries,
    company_sizes: source.company_sizes,
    geographies: source.geographies,
    roles: source.roles,
    pain_points: source.pain_points,
    buying_signals: source.buying_signals,
    exclusions: source.exclusions,
    revenue: source.revenue,
    business_model: source.business_model,
    technology: source.technology,
    growth_stage: source.growth_stage,
    existing_tools: source.existing_tools,
    // DISC-CONS-P0-01.2: the Ideal user is cloned with the rest, as a person's copy.
    audience: idealUserContent(readIdealUser(source.audience)),
    /** DISC-OFFER-P0-13.1: deliberately NOT `source.confidence`/`source.evidence` --
     * those describe how well the *source* ICP is grounded in the *source* offering's
     * own product profile; carrying them onto a different workspace/offering would
     * misrepresent evidence quoted from one product's profile as support for another's
     * ICP. Left null/empty, same as any other never-yet-(re)generated ICP, until this
     * offering's own `generateIcp` call computes real values for it. */
    confidence: null,
    evidence: [],
    status: "draft" as const,
    version: (existingTarget?.version ?? 0) + 1,
  };

  const { data, error } = await supabase.from("icp_profiles").upsert(row, { onConflict: "workspace_id" }).select().single();
  if (error) throw error;
  await recordIcpProfileVersion(data, "user_edit");
  return data;
}

export async function approveIcpProfile(icpId: string): Promise<IcpProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("icp_profiles")
    .update({ status: "approved" })
    .eq("id", icpId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Parses one list-field textarea (one item per line) into a clean string array. */
export function parseListField(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

import { IDEAL_USER_FIELDS, idealUserContent, readIdealUser, type IdealUserField } from "../icp/audience";
import type { IcpProfile } from "../icp/types";

/**
 * DISC-OFFER-P1-04.1: "Learn From User Edits" -- the doc's own worked example is a single
 * field-level correction ("AI: Target industry = Retail / User: Target industry =
 * Banking"), stored as "structured offering feedback." Scoped to the ICP alone, per this
 * story's own reconnaissance: the ICP is the one entity in this module today whose
 * version history (`icp_profile_versions`, DISC-OFFER-P0-14.2) already tags every
 * snapshot `ai_generated`/`user_edit` -- a real, already-computed signal for "the AI wrote
 * X, a human then changed it to Y," not something requiring new instrumentation. No
 * "quality"/"feedback" concept exists in `00-MASTER-PLAN.md` §5's entity ownership map,
 * so a new table is genuinely warranted, not a duplicate of anything.
 *
 * "Do not silently retrain models" -- this module only ever writes rows to
 * `discovery.offering_feedback`; nothing here (or at either call site) feeds a prompt,
 * a model choice, or any other AI-facing parameter. It is a capture mechanism, not a
 * learning loop -- acting on this data is explicitly out of this story's own scope.
 *
 * These are every content field `icp_profiles`/`icp_profile_versions` mirror exactly
 * (excludes `status`/`confidence`/`evidence`/`version` -- those describe the AI's own
 * confidence or workflow state, not a claim a founder corrects the *value* of). Kept as
 * a single source of truth for both the TS union below and the DB write path
 * (`lib/icp/mutations.ts`) -- the migration's own check constraint on `field_name` must
 * list the exact same fourteen values; if this list ever changes, so must that
 * constraint (same "two things must stay in sync by hand" precedent already accepted for
 * `icp_profiles`/`icp_profile_versions`' own identical column shape).
 */
export const COMPANY_ICP_FIELDS = [
  "name",
  "description",
  "industries",
  "company_sizes",
  "geographies",
  "roles",
  "pain_points",
  "buying_signals",
  "exclusions",
  "revenue",
  "business_model",
  "technology",
  "growth_stage",
  "existing_tools",
] as const;

/** DISC-CONS-P0-01.2: the Ideal user's fields (`icp_profiles.audience`), as feedback
 * names them: `audience_` and the field. Same order as `IDEAL_USER_FIELDS`. */
export const AUDIENCE_FEEDBACK_FIELDS = IDEAL_USER_FIELDS.map((field) => `audience_${field}` as const);

/** Every value `offering_feedback.field_name` may hold. The migration's check
 * (20261112160000_discovery_consumer_channels.sql) lists the same twenty-two. */
export const ICP_CONTENT_FIELDS = [...COMPANY_ICP_FIELDS, ...AUDIENCE_FEEDBACK_FIELDS] as const;

export type OfferingFeedbackFieldName = (typeof COMPANY_ICP_FIELDS)[number] | `audience_${IdealUserField}`;

/** The subset of `IcpProfile` this diagnostic actually compares -- both the pre-edit and
 * post-edit side of an ICP save share this exact shape. `audience` is optional: an
 * offering sold to companies has none. */
export type IcpContentFields = Pick<IcpProfile, (typeof COMPANY_ICP_FIELDS)[number]> & { audience?: unknown };

export type DetectedIcpCorrection = {
  field: OfferingFeedbackFieldName;
  /** The value the AI's own last write actually held for this field, before this edit. */
  aiValue: string | string[] | null;
  /** The value the founder just saved instead. */
  userValue: string | string[] | null;
};

function valuesEqual(a: string | string[] | null, b: string | string[] | null): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}

/**
 * Pure and deterministic (CLAUDE.md dev principle #4 -- no LLM for a computable diff).
 * Compares the AI's last-written content for one ICP against what a founder just saved
 * over it, field by field, and returns one entry per field that actually changed value --
 * an unedited field contributes nothing, so "no changes" returns an empty list rather
 * than a placeholder.
 *
 * Caller is responsible for calling this ONLY when `aiFields` is genuinely known to be
 * the AI's own last claim (i.e. the version being overwritten was tagged
 * `ai_generated` in `icp_profile_versions`) -- this function has no way to check that
 * itself, and doing so here would require a DB round trip inside otherwise-pure logic.
 *
 * Deliberately exact-order array comparison, not a set comparison -- a founder who
 * merely reorders an unchanged list of industries would register as a "correction" here.
 * Flagged as a simplification (CLAUDE.md dev principle #1, simplest implementation that
 * works): the doc's own worked example is a single-value change, not a reordering, and
 * this module has no existing precedent for order-insensitive list comparison to reuse.
 */
export function detectIcpFieldCorrections(aiFields: IcpContentFields, userFields: IcpContentFields): DetectedIcpCorrection[] {
  const corrections: DetectedIcpCorrection[] = [];
  for (const field of COMPANY_ICP_FIELDS) {
    const aiValue = aiFields[field];
    const userValue = userFields[field];
    if (!valuesEqual(aiValue, userValue)) {
      corrections.push({ field, aiValue, userValue });
    }
  }
  // DISC-CONS-P0-01.2: the Ideal user's fields, compared the same way. A side with no
  // Ideal user reads as empty, so writing one for the first time records each field.
  const aiUser = idealUserContent(readIdealUser(aiFields.audience));
  const userUser = idealUserContent(readIdealUser(userFields.audience));
  if (aiUser || userUser) {
    for (const field of IDEAL_USER_FIELDS) {
      const aiValue = aiUser ? aiUser[field] : field === "who" ? "" : [];
      const userValue = userUser ? userUser[field] : field === "who" ? "" : [];
      if (!valuesEqual(aiValue, userValue)) {
        corrections.push({ field: `audience_${field}`, aiValue, userValue });
      }
    }
  }
  return corrections;
}

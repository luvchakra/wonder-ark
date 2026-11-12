import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { extractDomain } from "./mutations";

export type DuplicateCandidate = {
  companyName: string;
  website?: string | null;
};

export type DuplicateMatch = { id: string; company_name: string };

/**
 * Shared duplicate check for all three ways a prospect enters the pipeline -- manual
 * add, CSV import, AI discovery (docs/prospects-pipeline-redesign-requirements.md R9),
 * which previously each checked differently or not at all. Domain match first (same
 * www-stripped normalization extractDomain already applies elsewhere), company name
 * second (case-insensitive) since many prospects won't have a website on file yet.
 */
export async function findDuplicateProspect(
  workspaceId: string,
  candidate: DuplicateCandidate,
  /** For a caller with no signed-in user (a saved search run by the events drain). */
  client?: SupabaseClient,
): Promise<DuplicateMatch | null> {
  const supabase = client ?? (await createClient());
  const domain = candidate.website ? extractDomain(candidate.website) : null;

  if (domain) {
    const { data, error } = await supabase
      .from("prospects")
      .select("id, company_name")
      .eq("workspace_id", workspaceId)
      .eq("domain", domain)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const companyName = candidate.companyName.trim();
  if (!companyName) return null;

  const { data, error } = await supabase
    .from("prospects")
    .select("id, company_name")
    .eq("workspace_id", workspaceId)
    .ilike("company_name", companyName)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

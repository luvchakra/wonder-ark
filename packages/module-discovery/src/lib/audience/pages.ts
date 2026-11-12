import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { getBusiness, getBusinessIdForWorkspace } from "../tenancy/queries";
import { cleanLine, cleanQuestions, defaultConsentText, newToken } from "./rules";
import type { SignupPage } from "./types";

/**
 * DISC-CONS-P0-03.2: the offering's public sign-up page, as its owner sets it up: on or
 * off, one line of value, up to two questions, and the consent line people agree to.
 * Through the member's session (RLS) with the Discovery licence required to change it.
 */

export async function getSignupPage(workspaceId: string): Promise<SignupPage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("audience_signup_pages").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as SignupPage), questions: cleanQuestions(Array.isArray(data.questions) ? data.questions : []) };
}

export type SignupPageInput = { enabled: boolean; valueLine: unknown; questions: unknown[]; consentText: unknown };

export async function saveSignupPage(workspaceId: string, input: SignupPageInput): Promise<SignupPage> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");

  const existing = await getSignupPage(workspaceId);
  const business = existing ? null : await getBusiness(businessId);
  const consentText = cleanLine(input.consentText, 500) ?? existing?.consent_text ?? defaultConsentText(business?.name ?? "this business");
  const row = {
    enabled: input.enabled,
    value_line: cleanLine(input.valueLine, 200),
    questions: cleanQuestions(input.questions),
    consent_text: consentText,
  };

  const supabase = await createClient();
  const query = existing
    ? supabase.from("audience_signup_pages").update(row).eq("id", existing.id)
    : supabase.from("audience_signup_pages").insert({ ...row, workspace_id: workspaceId, token: newToken(16) });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as SignupPage;
}

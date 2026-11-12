import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { recordUnsubscribe } from "@cofounderai/core/privacy/suppression";
import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import { createAdminClient } from "../../db/admin";
import { readAnswers, cleanQuestions } from "./rules";
import { businessForWorkspace } from "./send";

/**
 * DISC-CONS-P0-03.5/04.1: the two things a person does from an email, with no session:
 * unsubscribe, and answer the questions they were sent. Their private token (in the
 * email only) is the authorisation, and it reaches only their own record.
 */

function isLeadToken(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{32,64}$/.test(value);
}

type TokenLead = { id: string; workspace_id: string; email: string; status: string; survey: unknown };

async function leadByToken(token: string, client: SupabaseClient): Promise<TokenLead | null> {
  const { data, error } = await client
    .from("audience_leads")
    .select("id, workspace_id, email, status, survey")
    .eq("lead_token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as TokenLead | null) ?? null;
}

/**
 * Marks the person unsubscribed, so no later email reaches them (B5.3.5), and adds the
 * address to the business's opt-out list, which every outreach send checks. Repeating
 * it changes nothing. False for a link that matches nobody.
 */
export async function unsubscribeLead(token: string | null, client: SupabaseClient = createAdminClient()): Promise<boolean> {
  if (!isLeadToken(token)) return false;
  const lead = await leadByToken(token, client);
  if (!lead) return false;
  const context = await businessForWorkspace(lead.workspace_id, client);
  if (lead.status !== "unsubscribed") {
    const { error } = await client.from("audience_leads").update({ status: "unsubscribed", survey: null }).eq("id", lead.id);
    if (error) throw error;
    if (context) {
      const core = createCoreAdminClient({ schema: "core" });
      await core.rpc("append_audit_log", {
        p_business_id: context.businessId,
        p_actor_id: null,
        p_action: "discovery.audience_lead.unsubscribed",
        p_entity_type: "discovery_audience_lead",
        p_entity_id: lead.id,
        p_before: null,
        p_after: null,
      });
    }
  }
  if (context) await recordUnsubscribe(context.businessId, emailHash(lead.email));
  return true;
}

export type SurveyView = { businessName: string; offeringName: string; questions: string[] };

function surveyQuestions(survey: unknown): string[] {
  if (typeof survey !== "object" || survey === null) return [];
  const questions = (survey as { questions?: unknown }).questions;
  return cleanQuestions(Array.isArray(questions) ? questions : []);
}

/** The questions waiting for this person, or null when there are none to answer. */
export async function getSurvey(token: string, client: SupabaseClient = createAdminClient()): Promise<SurveyView | null> {
  if (!isLeadToken(token)) return null;
  const lead = await leadByToken(token, client);
  if (!lead || lead.status === "unsubscribed") return null;
  const questions = surveyQuestions(lead.survey);
  if (questions.length === 0) return null;
  const context = await businessForWorkspace(lead.workspace_id, client);
  if (!context) return null;
  return { businessName: context.businessName, offeringName: context.offeringName, questions };
}

export type SurveyOutcome = { status: "saved" | "empty" | "unavailable" | "rate_limited" };

/** Stores the answers as one survey entry of feedback (append-only) and clears the
 * questions, which are answered once: the clear is the claim, so a double submit
 * stores one entry. */
export async function submitSurveyAnswers(
  token: string,
  answer: (index: number) => unknown,
  client: SupabaseClient = createAdminClient(),
): Promise<SurveyOutcome> {
  if (!isLeadToken(token)) return { status: "unavailable" };
  const lead = await leadByToken(token, client);
  if (!lead || lead.status === "unsubscribed") return { status: "unavailable" };
  const questions = surveyQuestions(lead.survey);
  if (questions.length === 0) return { status: "unavailable" };

  const { data: allowed } = await client.rpc("take_signup_attempt", { p_key: `survey:${lead.id}`, p_window_seconds: 3600, p_limit: 5 });
  if (allowed !== true) return { status: "rate_limited" };

  const answers = readAnswers(questions, answer);
  if (Object.keys(answers).length === 0) return { status: "empty" };

  const { data: claimed, error: claimError } = await client
    .from("audience_leads")
    .update({ survey: null })
    .eq("id", lead.id)
    .not("survey", "is", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { status: "unavailable" };

  const body = Object.entries(answers)
    .map(([question, value]) => `${question}\n${value}`)
    .join("\n\n");
  const { error } = await client.from("audience_feedback").insert({
    workspace_id: lead.workspace_id,
    lead_id: lead.id,
    kind: "survey",
    body,
  });
  if (error) {
    // Put the questions back so the answers can be sent again.
    await client.from("audience_leads").update({ survey: lead.survey }).eq("id", lead.id);
    throw error;
  }
  return { status: "saved" };
}

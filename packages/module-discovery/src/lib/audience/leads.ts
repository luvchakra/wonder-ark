import { createHash } from "node:crypto";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { addPartyRole, createParty } from "@cofounderai/core/parties/mutations";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import {
  cleanLine,
  cleanQuestions,
  IMPORT_CONSENT_TEXT,
  messagingRefusal,
  newReferralCode,
  newToken,
  normaliseEmail,
  parseTags,
} from "./rules";
import { answerUrlFor, businessForWorkspace, sendLeadEmail, type LeadEmailOutcome } from "./send";
import {
  LEAD_COLUMNS,
  LEAD_STATUSES,
  type AudienceFeedback,
  type AudienceLead,
  type AudienceLeadWithReferrals,
  type LeadStatus,
} from "./types";

/**
 * DISC-CONS-P0-03.1/03.6/03.7/04.1/05.2: what a signed-in member does with the people on
 * an offering's list. Every read and write goes through the member's own session, so
 * `tenant AND licensed` RLS decides first; each write also requires the Discovery
 * licence (`requireModule`). The private token a send needs is read with the service
 * role only after the session has shown the person is the member's to reach.
 */

export async function listLeads(workspaceId: string): Promise<AudienceLeadWithReferrals[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audience_leads")
    .select(LEAD_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const leads = (data ?? []) as unknown as AudienceLead[];
  const referrals = new Map<string, number>();
  for (const lead of leads) {
    if (lead.referrer_lead_id) referrals.set(lead.referrer_lead_id, (referrals.get(lead.referrer_lead_id) ?? 0) + 1);
  }
  return leads.map((lead) => ({ ...lead, referrals: referrals.get(lead.id) ?? 0 }));
}

/** DISC-CONS-P0-05.2: sign-ups not contacted yet, for the Today list. */
export async function countNewSignups(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("audience_leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("source", "waitlist")
    .eq("status", "new");
  if (error) throw error;
  return count ?? 0;
}

export async function getLead(leadId: string): Promise<AudienceLead | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("audience_leads").select(LEAD_COLUMNS).eq("id", leadId).maybeSingle();
  if (error) throw error;
  return (data as unknown as AudienceLead | null) ?? null;
}

export async function listLeadFeedback(leadId: string): Promise<AudienceFeedback[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audience_feedback")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AudienceFeedback[];
}

/** The lead, through the member's session, and the business it belongs to, with the
 * Discovery licence required for a write. */
async function authorisedLead(leadId: string): Promise<{ lead: AudienceLead; businessId: string }> {
  const lead = await getLead(leadId);
  if (!lead) throw new Error("Person not found.");
  const businessId = await getBusinessIdForWorkspace(lead.workspace_id);
  if (!businessId) throw new Error("Person not found.");
  await requireModule(businessId, "discovery");
  return { lead, businessId };
}

/**
 * DISC-CONS-P0-03.7: on first contact the person becomes a `core.parties` row (kind
 * 'person', role 'lead'), as a prospect does (`lib/prospects/party-sync.ts`). A second
 * contact finds the link and does nothing.
 */
export async function ensureLeadParty(lead: AudienceLead, businessId: string): Promise<string> {
  if (lead.party_id) return lead.party_id;
  const party = await createParty({ businessId, kind: "person", name: lead.name ?? lead.email, email: lead.email });
  await addPartyRole(businessId, party.id, "lead");
  const supabase = await createClient();
  const { error } = await supabase.from("audience_leads").update({ party_id: party.id }).eq("id", lead.id).is("party_id", null);
  if (error) throw error;
  return party.id;
}

/** Status and tags, as a member sets them. Moving someone out of "Unsubscribed" is
 * refused by the database. */
export async function updateLead(leadId: string, input: { status: string; tags: string }): Promise<void> {
  const { lead } = await authorisedLead(leadId);
  if (!(LEAD_STATUSES as readonly string[]).includes(input.status)) throw new Error("Choose a status.");
  if (lead.status === "unsubscribed" && input.status !== "unsubscribed") {
    throw new Error("This person unsubscribed. Only they can sign up again.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("audience_leads")
    .update({ status: input.status as LeadStatus, tags: parseTags(input.tags) })
    .eq("id", leadId);
  if (error) throw error;
}

/** DISC-CONS-P0-04.1: "Log a conversation". Appends feedback; never edits any. */
export async function logConversation(leadId: string, input: { body: string; tags: string }): Promise<void> {
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 10_000) : "";
  if (!body) throw new Error("Write what was said.");
  const { lead, businessId } = await authorisedLead(leadId);
  const supabase = await createClient();
  const { error } = await supabase.from("audience_feedback").insert({
    workspace_id: lead.workspace_id,
    lead_id: lead.id,
    kind: "interview",
    body,
    tags: parseTags(input.tags),
  });
  if (error) throw error;
  if (lead.status === "new" || lead.status === "contacted") {
    await supabase.from("audience_leads").update({ status: "interviewed" }).eq("id", lead.id).neq("status", "unsubscribed");
  }
  await ensureLeadParty(lead, businessId);
}

async function readToken(lead: AudienceLead): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("audience_leads")
    .select("lead_token")
    .eq("id", lead.id)
    .eq("workspace_id", lead.workspace_id)
    .single();
  if (error) throw error;
  return data.lead_token as string;
}

function outcomeMessage(outcome: LeadEmailOutcome, done: string): { status: "completed" | "failed"; message: string } {
  if (outcome.status === "sent") return { status: "completed", message: done };
  return { status: "failed", message: outcome.message };
}

/**
 * DISC-CONS-P0-04.1: "Send questions": a short survey by email, in the sign-up page's
 * answers format. The questions are kept on the person until they answer them on their
 * private page. Only to someone who consented and has not unsubscribed.
 */
export async function sendQuestions(leadId: string, rawQuestions: unknown[]): Promise<{ status: "completed" | "failed"; message: string }> {
  const questions = cleanQuestions(rawQuestions);
  if (questions.length === 0) return { status: "failed", message: "Write at least one question." };
  const { lead, businessId } = await authorisedLead(leadId);
  const refusal = messagingRefusal(lead);
  if (refusal) return { status: "failed", message: refusal };

  // Kept through the member's session first: a member who may not write here sends nothing.
  const sentAt = new Date().toISOString();
  const supabase = await createClient();
  const { data: kept, error } = await supabase
    .from("audience_leads")
    .update({ survey: { questions, sent_at: sentAt }, ...(lead.status === "new" ? { status: "contacted" } : {}) })
    .eq("id", lead.id)
    .neq("status", "unsubscribed")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!kept) return { status: "failed", message: "This person can't be emailed." };

  const context = await businessForWorkspace(lead.workspace_id, createAdminClient());
  const token = await readToken(lead);
  const outcome = await sendLeadEmail({
    client: createAdminClient(),
    lead: { ...lead, lead_token: token },
    subject: `A quick question from ${context?.businessName ?? "us"}`,
    body: [
      `${context?.businessName ?? "We"} would like to hear from you about ${context?.offeringName ?? "this"}:`,
      questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      `Answer here: ${answerUrlFor(token)}`,
    ].join("\n\n"),
    idempotencyKey: `audience-survey/${lead.id}/${sentAt}`,
  });
  if (outcome.status !== "sent") {
    // Nothing was asked of them after all.
    await supabase.from("audience_leads").update({ survey: null }).eq("id", lead.id);
    return outcomeMessage(outcome, "");
  }
  await ensureLeadParty(lead, businessId);
  return { status: "completed", message: "Questions sent." };
}

/** DISC-CONS-P0-05.2: an email to one person, through the existing send path, only when
 * they consented and have not unsubscribed. The same text sent twice is one email. */
export async function messageLead(
  leadId: string,
  input: { subject: string; body: string },
): Promise<{ status: "completed" | "failed"; message: string }> {
  const subject = cleanLine(input.subject, 200);
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 10_000) : "";
  if (!subject || !body) return { status: "failed", message: "Write a subject and a message." };
  const { lead, businessId } = await authorisedLead(leadId);
  const refusal = messagingRefusal(lead);
  if (refusal) return { status: "failed", message: refusal };

  const supabase = await createClient();
  if (lead.status === "new") {
    const { error } = await supabase.from("audience_leads").update({ status: "contacted" }).eq("id", lead.id).eq("status", "new");
    if (error) throw error;
  }
  const key = createHash("sha256").update(`${subject}\n${body}`).digest("hex").slice(0, 32);
  const outcome = await sendLeadEmail({
    client: createAdminClient(),
    lead: { ...lead, lead_token: await readToken(lead) },
    subject,
    body,
    idempotencyKey: `audience-message/${lead.id}/${key}`,
  });
  if (outcome.status === "sent") await ensureLeadParty(lead, businessId);
  return outcomeMessage(outcome, "Sent.");
}

// ---------------------------------------------------------------------------------------
// DISC-CONS-P0-03.6: import a people list, with the importer's confirmation of consent
// ---------------------------------------------------------------------------------------

export type PersonRow = { email: string; name: string | null; tags: string[] };

export type PeopleImportOutcome = { added: number; duplicates: number; invalid: number };

/**
 * Saves an imported people list. Refused outright unless the importer confirmed "These
 * people agreed to hear from me"; that sentence is stored as each row's consent. An
 * address already on the list, or twice in the file, is skipped and counted; an invalid
 * one is counted. Nothing is emailed.
 */
export async function importPeople(
  workspaceId: string,
  rows: { email: unknown; name: unknown; tags: unknown }[],
  confirmedConsent: boolean,
): Promise<PeopleImportOutcome> {
  if (!confirmedConsent) throw new Error(`Confirm "${IMPORT_CONSENT_TEXT}" before importing.`);
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) throw new Error("Workspace not found.");
  await requireModule(businessId, "discovery");

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("audience_leads").select("email").eq("workspace_id", workspaceId);
  if (readError) throw readError;
  const seen = new Set((existing ?? []).map((row) => String(row.email).toLowerCase()));

  let invalid = 0;
  let duplicates = 0;
  const now = new Date().toISOString();
  const toInsert = [];
  for (const row of rows) {
    const email = normaliseEmail(row.email);
    if (!email) {
      invalid += 1;
      continue;
    }
    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);
    toInsert.push({
      workspace_id: workspaceId,
      email,
      name: cleanLine(row.name, 200),
      tags: parseTags(typeof row.tags === "string" ? row.tags : ""),
      source: "import",
      consent_text: IMPORT_CONSENT_TEXT,
      consent_at: now,
      referral_code: newReferralCode(),
      lead_token: newToken(),
    });
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from("audience_leads").insert(toInsert);
    if (error) throw error;
  }
  return { added: toInsert.length, duplicates, invalid };
}

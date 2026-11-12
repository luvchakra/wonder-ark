import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { createAdminClient } from "../../db/admin";
import {
  cleanLine,
  cleanQuestions,
  MAX_NAME_LENGTH,
  newReferralCode,
  newToken,
  normaliseEmail,
  readAnswers,
  readReferralCode,
  readUtm,
} from "./rules";
import { SITE_URL } from "@cofounderai/core/site";
import { businessForWorkspace, sendLeadEmail } from "./send";
import type { SignupOutcome } from "./types";

/**
 * DISC-CONS-P0-03.2/03.3/03.4/03.5: the public sign-up page. There is no session, so
 * everything runs as the service role, and the page's token is the only authorisation:
 *  - the workspace is resolved from the token on the server; nothing the visitor posts
 *    can name a workspace, and a referral code is looked up only inside that workspace;
 *  - the page must be enabled and the business must hold a Discovery licence;
 *  - abuse controls: a honeypot field, a per-page and a per-address rate limit, email
 *    format and length checks, and no answer that reveals whether an address was
 *    already on the list (a repeat, a honeypot hit and a new sign-up all read "joined");
 *  - consent is recorded with the exact consent line shown;
 *  - the confirmation email is sent once (claimed with compare-and-set), through the
 *    existing send path, with the person's unsubscribe link.
 */

/** Sign-ups a page accepts per minute, and attempts per address per hour. */
export const PAGE_LIMIT_PER_MINUTE = 30;
export const ADDRESS_LIMIT_PER_HOUR = 3;

export type PublicSignupPage = {
  pageId: string;
  workspaceId: string;
  businessName: string;
  offeringName: string;
  valueLine: string | null;
  questions: string[];
  consentText: string;
};

function isToken(value: string): boolean {
  return /^[a-f0-9]{32,64}$/.test(value);
}

/** The page behind a token, or null when the link is not (or no longer) live. */
export async function resolveSignupPage(token: string, client: SupabaseClient = createAdminClient()): Promise<PublicSignupPage | null> {
  if (!isToken(token)) return null;
  const { data: page, error } = await client
    .from("audience_signup_pages")
    .select("id, workspace_id, enabled, value_line, questions, consent_text")
    .eq("token", token)
    .maybeSingle();
  if (error || !page || !page.enabled) return null;
  const context = await businessForWorkspace(page.workspace_id as string, client);
  if (!context) return null;
  const core = createCoreAdminClient({ schema: "core" });
  const { data: licensed } = await core.rpc("has_module", { p_business_id: context.businessId, p_key: "discovery" });
  if (!licensed) return null;
  return {
    pageId: page.id as string,
    workspaceId: page.workspace_id as string,
    businessName: context.businessName,
    offeringName: context.offeringName,
    valueLine: (page.value_line as string | null) ?? null,
    questions: cleanQuestions(Array.isArray(page.questions) ? page.questions : []),
    consentText: page.consent_text as string,
  };
}

export type SignupInput = {
  email: unknown;
  name: unknown;
  /** Posted answers, by the question's position on the page. */
  answer: (index: number) => unknown;
  /** The honeypot: a field people never see. Anything in it means a bot. */
  website: unknown;
  ref: unknown;
  utm: (key: string) => unknown;
};

async function takeAttempt(client: SupabaseClient, key: string, windowSeconds: number, limit: number): Promise<boolean> {
  const { data, error } = await client.rpc("take_signup_attempt", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
  // A failed check is not a pass.
  return !error && data === true;
}

function addressKey(pageId: string, email: string): string {
  return `email:${pageId}:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
}

export async function submitSignup(token: string, input: SignupInput, client: SupabaseClient = createAdminClient()): Promise<SignupOutcome> {
  // A bot that filled the hidden field is told it joined, and nothing is stored.
  if (typeof input.website === "string" && input.website.trim() !== "") return { status: "joined" };

  const email = normaliseEmail(input.email);
  if (!email) return { status: "invalid", message: "Enter a valid email address." };

  const page = await resolveSignupPage(token, client);
  if (!page) return { status: "unavailable" };

  if (!(await takeAttempt(client, `page:${page.pageId}`, 60, PAGE_LIMIT_PER_MINUTE))) return { status: "rate_limited" };
  if (!(await takeAttempt(client, addressKey(page.pageId, email), 3600, ADDRESS_LIMIT_PER_HOUR))) return { status: "rate_limited" };

  const name = cleanLine(input.name, MAX_NAME_LENGTH);
  const answers = readAnswers(page.questions, input.answer);
  const now = new Date().toISOString();

  // The referrer must be on this same offering's list; a code from anywhere else is ignored.
  const refCode = readReferralCode(input.ref);
  let referrerId: string | null = null;
  if (refCode) {
    const { data: referrer } = await client
      .from("audience_leads")
      .select("id")
      .eq("workspace_id", page.workspaceId)
      .eq("referral_code", refCode)
      .maybeSingle();
    referrerId = (referrer?.id as string | undefined) ?? null;
  }

  const { data: existing, error: readError } = await client
    .from("audience_leads")
    .select("id, status")
    .eq("workspace_id", page.workspaceId)
    // Every stored address is lower-cased (normaliseEmail), as the unique key compares.
    .eq("email", email)
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    // Already on the list: nothing changes and nothing says so -- unless they had
    // unsubscribed and are signing up again, which is a new consent.
    if (existing.status === "unsubscribed") {
      const { error } = await client
        .from("audience_leads")
        .update({ status: "new", consent_text: page.consentText, consent_at: now, survey: null })
        .eq("id", existing.id)
        .eq("workspace_id", page.workspaceId);
      if (error) throw error;
    }
    return { status: "joined" };
  }

  const { data: lead, error } = await client
    .from("audience_leads")
    .insert({
      workspace_id: page.workspaceId,
      email,
      name,
      answers,
      consent_text: page.consentText,
      consent_at: now,
      source: "waitlist",
      referrer_lead_id: referrerId,
      utm: readUtm(input.utm),
      referral_code: newReferralCode(),
      lead_token: newToken(),
    })
    .select("id, workspace_id, email, consent_at, status, lead_token, referral_code")
    .single();
  if (error) {
    // Two submissions at once: the unique key took the second. Same answer as a repeat.
    if ((error as { code?: string }).code === "23505") return { status: "joined" };
    throw error;
  }

  await sendConfirmation(client, page, token, lead as ConfirmationLead);
  return { status: "joined" };
}

type ConfirmationLead = {
  id: string;
  workspace_id: string;
  email: string;
  consent_at: string | null;
  status: string;
  lead_token: string;
  referral_code: string;
};

/** The confirmation email, once per person: the claim on `confirmation_sent_at` lets
 * only one request send it. A failure to send does not undo the sign-up. */
async function sendConfirmation(client: SupabaseClient, page: PublicSignupPage, token: string, lead: ConfirmationLead): Promise<void> {
  const { data: claimed } = await client
    .from("audience_leads")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", lead.id)
    .is("confirmation_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;
  const referralLink = referralLinkFor(SITE_URL, token, lead.referral_code);
  try {
    await sendLeadEmail({
      client,
      lead,
      subject: `You're on the list for ${page.offeringName}`,
      body: [
        `Thanks for signing up for ${page.offeringName}. ${page.businessName} will be in touch.`,
        `Know someone who'd want this too? Share your own link: ${referralLink}`,
        `You're getting this because you signed up and agreed: "${page.consentText}"`,
      ].join("\n\n"),
      idempotencyKey: `audience-confirm/${lead.id}`,
    });
  } catch (error) {
    console.error("Could not send a sign-up confirmation:", error instanceof Error ? error.message : error);
  }
}

/** The person's own referral link, for the signed-in list. */
export function referralLinkFor(siteUrl: string, pageToken: string, referralCode: string): string {
  return `${siteUrl}/p/w/${pageToken}?ref=${referralCode}`;
}

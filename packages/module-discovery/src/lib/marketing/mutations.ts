import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { deleteAttachment, uploadAttachment } from "@cofounderai/core/attachments/mutations";
import { requireUser } from "../tenancy/queries";
import { checkCampaignTransition, checkContentTransition, statusAfterEdit } from "./lifecycle";
import type { AttributionInput, CampaignInput, ContentInput, MetricSnapshotInput, SeoItemInput, StrategyInput } from "./schemas";
import type { AssetType, CampaignStatus, ContentStatus, ContentVersion, SeoStatus, StrategyGoal } from "./types";

/**
 * MKT-01 — the Marketing write layer. Every function here re-checks, independently of
 * whatever the UI showed (§36.2 — "UI hiding is not security"):
 *
 *   1. the business holds a Discovery licence (`requireModule`), then
 *   2. the caller has the RBAC permission for the operation (`requirePermission`),
 *
 * and then writes through the caller's RLS-bound client, so the database's own
 * `tenant AND licensed` policies are the third, authoritative check. State changes that
 * matter are written to `core.audit_log` (§5.3). Inputs arrive already parsed by the
 * schemas in ./schemas.ts; the database's check constraints stand behind those.
 */

export class MarketingError extends Error {
  constructor(
    public readonly code:
      | "CAMPAIGN_NOT_FOUND"
      | "CAMPAIGN_INVALID_STATE"
      | "CONTENT_NOT_FOUND"
      | "CONTENT_NOT_APPROVED"
      | "CONTENT_INVALID_STATE"
      | "STRATEGY_NOT_FOUND"
      | "ASSET_INVALID"
      | "ASSET_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "MarketingError";
  }
}

async function authorise(businessId: string, permission: "marketing.manage" | "marketing.approve"): Promise<void> {
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, permission);
}

function campaignRow(input: CampaignInput) {
  const utm: Record<string, string> = {};
  if (input.utmSource) utm.source = input.utmSource;
  if (input.utmMedium) utm.medium = input.utmMedium;
  if (input.utmCampaign) utm.campaign = input.utmCampaign;
  return {
    name: input.name,
    description: input.description,
    objective: input.objective,
    channel: input.channel,
    offering_id: input.offeringId,
    icp_profile_id: input.icpProfileId,
    budget: input.budget,
    currency: input.currency,
    start_at: input.startAt,
    end_at: input.endAt,
    landing_page_url: input.landingPageUrl,
    message: input.message,
    cta: input.cta,
    utm,
    notes: input.notes,
  };
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

/** New campaigns start as drafts — "a campaign is not Active simply because it was
 * created" (§9.3). Activation is its own, checked transition. */
export async function createCampaign(businessId: string, input: CampaignInput): Promise<string> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({ business_id: businessId, ...campaignRow(input), status: "draft" })
    .select("id")
    .single();
  if (error) throw error;
  await writeAuditLog({
    businessId,
    action: "marketing.campaign.created",
    entityType: "marketing_campaign",
    entityId: data.id,
    after: { name: input.name, objective: input.objective, channel: input.channel },
  });
  return data.id as string;
}

export async function updateCampaign(businessId: string, campaignId: string, input: CampaignInput): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("marketing_campaigns")
    .select("status")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new MarketingError("CAMPAIGN_NOT_FOUND", "That campaign no longer exists.");
  // An active campaign may not lose the start date that made it activatable.
  if (existing.status === "active" && !input.startAt) {
    throw new MarketingError("CAMPAIGN_INVALID_STATE", "An active campaign needs a start date.");
  }

  const { error } = await supabase
    .from("marketing_campaigns")
    .update({ ...campaignRow(input), updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", campaignId);
  if (error) throw error;
  await writeAuditLog({
    businessId,
    action: "marketing.campaign.updated",
    entityType: "marketing_campaign",
    entityId: campaignId,
    after: { name: input.name },
  });
}

export async function transitionCampaign(businessId: string, campaignId: string, to: CampaignStatus): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: campaign, error: readError } = await supabase
    .from("marketing_campaigns")
    .select("status, start_at, end_at")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  if (readError) throw readError;
  if (!campaign) throw new MarketingError("CAMPAIGN_NOT_FOUND", "That campaign no longer exists.");

  const from = campaign.status as CampaignStatus;
  const check = checkCampaignTransition(from, to, {
    startAt: (campaign.start_at as string) ?? null,
    endAt: (campaign.end_at as string) ?? null,
  });
  if (!check.ok) throw new MarketingError("CAMPAIGN_INVALID_STATE", check.reason);

  // Guarded on the status we read, so two people pressing buttons at once cannot both
  // apply a transition from the same starting state.
  const { data: updated, error } = await supabase
    .from("marketing_campaigns")
    .update({ status: to, updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .eq("status", from)
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    throw new MarketingError("CAMPAIGN_INVALID_STATE", "Someone else changed this campaign. Reload and try again.");
  }
  await writeAuditLog({
    businessId,
    action: `marketing.campaign.${to}`,
    entityType: "marketing_campaign",
    entityId: campaignId,
    before: { status: from },
    after: { status: to },
  });
}

/** Copies a campaign as a fresh draft. Dates and metrics are not copied — the copy has
 * not run yet, so it has nothing to report. */
export async function duplicateCampaign(businessId: string, campaignId: string): Promise<string> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: source, error: readError } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  if (readError) throw readError;
  if (!source) throw new MarketingError("CAMPAIGN_NOT_FOUND", "That campaign no longer exists.");

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      business_id: businessId,
      offering_id: source.offering_id,
      icp_profile_id: source.icp_profile_id,
      name: `Copy of ${source.name}`.slice(0, 200),
      description: source.description,
      objective: source.objective,
      channel: source.channel,
      audience: source.audience,
      budget: source.budget,
      currency: source.currency,
      landing_page_url: source.landing_page_url,
      message: source.message,
      cta: source.cta,
      utm: source.utm,
      notes: source.notes,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  await writeAuditLog({
    businessId,
    action: "marketing.campaign.duplicated",
    entityType: "marketing_campaign",
    entityId: data.id,
    before: { sourceCampaignId: campaignId },
  });
  return data.id as string;
}

/** Records one day's numbers from one source. Re-entering the same day and source
 * replaces that snapshot rather than double-counting it (§10). */
export async function recordCampaignMetric(
  businessId: string,
  campaignId: string,
  input: MetricSnapshotInput,
): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: campaign, error: readError } = await supabase
    .from("marketing_campaigns")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  if (readError) throw readError;
  // §52 rule 7 in spirit: metrics cannot attach to a campaign that does not exist here.
  if (!campaign) throw new MarketingError("CAMPAIGN_NOT_FOUND", "That campaign no longer exists.");

  const { error } = await supabase.from("marketing_campaign_metrics").upsert(
    {
      business_id: businessId,
      campaign_id: campaignId,
      metric_date: input.metricDate,
      source: input.source,
      impressions: input.impressions,
      clicks: input.clicks,
      sessions: input.sessions,
      engagements: input.engagements,
      leads: input.leads,
      qualified_leads: input.qualifiedLeads,
      opportunities: input.opportunities,
      customers: input.customers,
      revenue: input.revenue,
      spend: input.spend,
      currency: input.currency,
    },
    { onConflict: "campaign_id,metric_date,source" },
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function contentFields(input: ContentInput) {
  const seo: Record<string, string> = {};
  if (input.seoTitle) seo.title = input.seoTitle;
  if (input.seoDescription) seo.description = input.seoDescription;
  return {
    title: input.title,
    content_type: input.contentType,
    offering_id: input.offeringId,
    campaign_id: input.campaignId,
    brief: input.brief,
    body: input.body,
    summary: input.summary,
    audience: input.audience,
    channel: input.channel,
    cta: input.cta,
    seo_metadata: seo,
  };
}

export async function createContent(
  businessId: string,
  input: ContentInput,
  origin: ContentVersion["origin"] = "user",
  sourceRefs: Record<string, unknown> = {},
  /** DISC-CONS-P0-02.2: the channel prospect a community post was written for. The
   * database refuses a prospect of another business (marketing_content_prospect_same_business). */
  links: { prospectId?: string } = {},
): Promise<string> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const status: ContentStatus = input.body ? "draft" : "idea";
  const { data, error } = await supabase
    .from("marketing_content")
    .insert({
      business_id: businessId,
      ...contentFields(input),
      status,
      ...(links.prospectId ? { prospect_id: links.prospectId } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: versionError } = await supabase.from("marketing_content_versions").insert({
    business_id: businessId,
    content_id: data.id,
    version_number: 1,
    title: input.title,
    body: input.body,
    summary: input.summary,
    origin,
    source_refs: sourceRefs,
  });
  if (versionError) throw versionError;

  await writeAuditLog({
    businessId,
    action: "marketing.content.created",
    entityType: "marketing_content",
    entityId: data.id,
    after: { title: input.title, contentType: input.contentType, origin },
  });
  return data.id as string;
}

/**
 * Starts a new draft from existing content — the way to change published content, which is
 * never edited in place (see statusAfterEdit). The copy has its own version history.
 */
export async function duplicateContent(businessId: string, contentId: string): Promise<string> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: source, error: readError } = await supabase
    .from("marketing_content")
    .select("title, content_type, offering_id, campaign_id, brief, body, summary, audience, channel, cta, seo_metadata")
    .eq("business_id", businessId)
    .eq("id", contentId)
    .maybeSingle();
  if (readError) throw readError;
  if (!source) throw new MarketingError("CONTENT_NOT_FOUND", "That content no longer exists.");
  const seo = (source.seo_metadata ?? {}) as Record<string, string>;
  return createContent(businessId, {
    title: `Copy of ${source.title as string}`.slice(0, 300),
    contentType: source.content_type as ContentInput["contentType"],
    offeringId: (source.offering_id as string) ?? null,
    campaignId: (source.campaign_id as string) ?? null,
    brief: (source.brief as string) ?? null,
    body: (source.body as string) ?? null,
    summary: (source.summary as string) ?? null,
    audience: (source.audience as string) ?? null,
    channel: (source.channel as string) ?? null,
    cta: (source.cta as string) ?? null,
    seoTitle: seo.title ?? null,
    seoDescription: seo.description ?? null,
  });
}

/**
 * Saves an edit as a new version rather than overwriting the old one (§12.6). Editing
 * approved or scheduled content returns it to draft — what was approved is no longer
 * what is there — and published content is refused outright (see statusAfterEdit).
 */
export async function updateContent(
  businessId: string,
  contentId: string,
  input: ContentInput,
  provenance: { origin: ContentVersion["origin"]; sourceRefs?: Record<string, unknown>; metadata?: Record<string, unknown> } = { origin: "user" },
): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("marketing_content")
    .select("status")
    .eq("business_id", businessId)
    .eq("id", contentId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new MarketingError("CONTENT_NOT_FOUND", "That content no longer exists.");

  const next = statusAfterEdit(current.status as ContentStatus);
  if (!next.ok) throw new MarketingError("CONTENT_INVALID_STATE", next.reason);

  const { data: latest, error: versionReadError } = await supabase
    .from("marketing_content_versions")
    .select("version_number")
    .eq("business_id", businessId)
    .eq("content_id", contentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionReadError) throw versionReadError;

  const { error: versionError } = await supabase.from("marketing_content_versions").insert({
    business_id: businessId,
    content_id: contentId,
    version_number: Number(latest?.version_number ?? 0) + 1,
    title: input.title,
    body: input.body,
    summary: input.summary,
    origin: provenance.origin,
    source_refs: provenance.sourceRefs ?? {},
    metadata: provenance.metadata ?? {},
  });
  if (versionError) throw versionError;

  const resetsApproval = next.status !== current.status;
  const { error } = await supabase
    .from("marketing_content")
    .update({
      ...contentFields(input),
      status: next.status,
      ...(resetsApproval ? { approved_by: null, approved_at: null, scheduled_at: null } : {}),
      updated_by: (await requireUser()).id,
    })
    .eq("business_id", businessId)
    .eq("id", contentId);
  if (error) throw error;

  if (resetsApproval) {
    await writeAuditLog({
      businessId,
      action: "marketing.content.approval_reset",
      entityType: "marketing_content",
      entityId: contentId,
      before: { status: current.status },
      after: { status: next.status },
    });
  }
}

/**
 * Moves content through its lifecycle. Approving and publishing need
 * `marketing.approve`; everything else needs `marketing.manage`. Publishing pins the
 * exact version that went out, and is only ever this explicit call — nothing schedules,
 * approves or publishes on its own (§12.3, §15: "a calendar move must not silently
 * publish content").
 */
export async function transitionContent(
  businessId: string,
  contentId: string,
  to: ContentStatus,
  options: { scheduledAt?: string | null; externalUrl?: string | null } = {},
): Promise<void> {
  await requireModule(businessId, "discovery");
  const supabase = await createClient();
  const { data: content, error: readError } = await supabase
    .from("marketing_content")
    .select("status, scheduled_at, approved_at")
    .eq("business_id", businessId)
    .eq("id", contentId)
    .maybeSingle();
  if (readError) throw readError;
  if (!content) throw new MarketingError("CONTENT_NOT_FOUND", "That content no longer exists.");

  const from = content.status as ContentStatus;
  const scheduledAt = to === "scheduled" ? (options.scheduledAt ?? null) : (content.scheduled_at as string | null);
  const check = checkContentTransition(from, to, {
    scheduledAt,
    hasApprovedVersion: from === "approved" || from === "scheduled",
  });
  if (!check.ok) {
    throw new MarketingError(to === "published" ? "CONTENT_NOT_APPROVED" : "CONTENT_INVALID_STATE", check.reason);
  }
  await requirePermission(businessId, check.requiresApproval ? "marketing.approve" : "marketing.manage");

  const user = await requireUser();
  const patch: Record<string, unknown> = { status: to, updated_by: user.id };
  if (to === "approved") {
    patch.approved_by = user.id;
    patch.approved_at = new Date().toISOString();
  }
  if (to === "scheduled") patch.scheduled_at = scheduledAt;
  if (to === "approved" && from === "scheduled") patch.scheduled_at = null;
  if (to === "draft") {
    patch.approved_by = null;
    patch.approved_at = null;
    patch.scheduled_at = null;
  }
  if (to === "published") {
    const { data: latest, error: versionError } = await supabase
      .from("marketing_content_versions")
      .select("id")
      .eq("business_id", businessId)
      .eq("content_id", contentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw versionError;
    if (!latest) throw new MarketingError("CONTENT_NOT_APPROVED", "There is no approved version to publish.");
    patch.published_version_id = latest.id;
    patch.published_at = new Date().toISOString();
    if (options.externalUrl) patch.external_url = options.externalUrl;
  }

  const { data: updated, error } = await supabase
    .from("marketing_content")
    .update(patch)
    .eq("business_id", businessId)
    .eq("id", contentId)
    .eq("status", from)
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    throw new MarketingError("CONTENT_INVALID_STATE", "Someone else changed this content. Reload and try again.");
  }
  await writeAuditLog({
    businessId,
    action: `marketing.content.${to}`,
    entityType: "marketing_content",
    entityId: contentId,
    before: { status: from },
    after: { status: to, ...(patch.published_version_id ? { versionId: patch.published_version_id } : {}) },
  });
}

/** Moves a scheduled item to another date without changing anything else — the calendar's
 * only write. It does not publish, approve, or change status (§15). */
export async function rescheduleContent(businessId: string, contentId: string, scheduledAt: string): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("marketing_content")
    .update({ scheduled_at: scheduledAt, updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", contentId)
    .eq("status", "scheduled")
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    throw new MarketingError("CONTENT_INVALID_STATE", "Only scheduled content can be moved on the calendar.");
  }
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

function strategyColumns(input: StrategyInput) {
  return {
    name: input.name,
    offering_id: input.offeringId,
    positioning: {
      category: input.category ?? undefined,
      targetProblem: input.targetProblem ?? undefined,
      statement: input.positioningStatement ?? undefined,
      marketContext: input.marketContext ?? undefined,
    },
    value_proposition: {
      headline: input.headline ?? undefined,
      supportingPoints: input.supportingPoints,
      proofPoints: input.proofPoints,
    },
    differentiation: {
      differentiators: input.differentiators,
      competitorStatements: input.competitorStatements,
      whyUs: input.whyUs ?? undefined,
    },
    target_markets: {
      regions: input.regions,
      industries: input.industries,
      companySegments: input.companySegments,
      buyerSegments: input.buyerSegments,
    },
    messaging: { keyMessages: input.keyMessages },
    channels: input.channels,
  };
}

/**
 * Saves a strategy as a new draft version. Editing never rewrites an existing version —
 * an active strategy stays exactly what it was until a newer draft is activated (§8.3:
 * "prefer versioning over destructive replacement").
 */
export async function saveStrategyDraft(
  businessId: string,
  input: StrategyInput,
  basedOnId: string | null,
  origin: "user" | "ai_draft" = "user",
  sourceRefs: Record<string, unknown> = {},
): Promise<string> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();

  let versionNumber = 1;
  let goals: unknown = [];
  if (basedOnId) {
    const { data: base, error } = await supabase
      .from("marketing_strategies")
      .select("version_number, goals")
      .eq("business_id", businessId)
      .eq("id", basedOnId)
      .maybeSingle();
    if (error) throw error;
    if (!base) throw new MarketingError("STRATEGY_NOT_FOUND", "The strategy this was based on no longer exists.");
    versionNumber = Number(base.version_number) + 1;
    goals = base.goals ?? [];
  }

  const { data, error } = await supabase
    .from("marketing_strategies")
    .insert({
      business_id: businessId,
      ...strategyColumns(input),
      goals,
      status: "draft",
      version_number: versionNumber,
      supersedes_id: basedOnId,
      origin,
      source_refs: sourceRefs,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Makes a draft the active strategy for its scope, archiving whatever was active. An
 * AI-drafted strategy only ever becomes authoritative through this explicit call (§8.2). */
export async function activateStrategy(businessId: string, strategyId: string): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: strategy, error: readError } = await supabase
    .from("marketing_strategies")
    .select("status, offering_id")
    .eq("business_id", businessId)
    .eq("id", strategyId)
    .maybeSingle();
  if (readError) throw readError;
  if (!strategy) throw new MarketingError("STRATEGY_NOT_FOUND", "That strategy no longer exists.");
  if (strategy.status === "active") return;

  let archive = supabase
    .from("marketing_strategies")
    .update({ status: "archived" })
    .eq("business_id", businessId)
    .eq("status", "active");
  archive = strategy.offering_id ? archive.eq("offering_id", strategy.offering_id) : archive.is("offering_id", null);
  const { data: archived, error: archiveError } = await archive.select("id");
  if (archiveError) throw archiveError;

  const { error } = await supabase
    .from("marketing_strategies")
    .update({ status: "active", updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", strategyId);
  if (error) {
    // Put the previous strategy back rather than leave the business with none.
    const previous = (archived ?? []).map((r) => r.id as string);
    if (previous.length > 0) {
      await supabase.from("marketing_strategies").update({ status: "active" }).in("id", previous);
    }
    throw error;
  }
  await writeAuditLog({
    businessId,
    action: "marketing.strategy.activated",
    entityType: "marketing_strategy",
    entityId: strategyId,
    before: { archived: (archived ?? []).map((r) => r.id) },
  });
}

export async function setStrategyGoals(businessId: string, strategyId: string, goals: StrategyGoal[]): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("marketing_strategies")
    .update({ goals, updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", strategyId)
    .neq("status", "archived")
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    throw new MarketingError("STRATEGY_NOT_FOUND", "That strategy can no longer be changed.");
  }
}

// ---------------------------------------------------------------------------
// SEO opportunities
// ---------------------------------------------------------------------------

function seoEvidence(input: SeoItemInput): Record<string, unknown> {
  const evidence: Record<string, unknown> = {};
  if (input.evidenceNote) evidence.note = input.evidenceNote;
  if (input.query) evidence.query = input.query;
  if (input.engine) evidence.engine = input.engine;
  if (input.observedAnswer) evidence.observedAnswer = input.observedAnswer;
  if (input.companyAppears !== null) evidence.companyAppears = input.companyAppears;
  if (input.citedUrls.length > 0) evidence.citedUrls = input.citedUrls;
  return evidence;
}

export async function createSeoItem(businessId: string, input: SeoItemInput): Promise<string> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_seo_items")
    .insert({
      business_id: businessId,
      title: input.title,
      category: input.category,
      severity: input.severity,
      page_url: input.pageUrl,
      description: input.description,
      recommended_action: input.recommendedAction,
      // A manually logged finding records who observed it and what they saw — it is
      // evidence a person supplied, labelled as such (§5.2).
      evidence: seoEvidence(input),
      source: "manual",
      observed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function setSeoItemStatus(businessId: string, itemId: string, status: SeoStatus): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_seo_items")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      updated_by: (await requireUser()).id,
    })
    .eq("business_id", businessId)
    .eq("id", itemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** Files travel through a server action, and Vercel refuses request bodies over 4.5 MB, so
 * the cap sits just under that (apps/web/next.config.ts raises Next's own 1 MB default to
 * match). Larger media belongs on a video host, linked from the content. */
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

/**
 * What an uploaded file may be, keyed by extension, with the MIME types each is allowed
 * to claim. Both must agree (§64: "do not trust browser-provided file metadata alone") —
 * a `.pdf` that claims to be `text/html` is refused, as is anything not on the list.
 */
const ALLOWED_FILES: Record<string, { mimes: string[]; defaultType: AssetType }> = {
  png: { mimes: ["image/png"], defaultType: "image" },
  jpg: { mimes: ["image/jpeg"], defaultType: "image" },
  jpeg: { mimes: ["image/jpeg"], defaultType: "image" },
  webp: { mimes: ["image/webp"], defaultType: "image" },
  gif: { mimes: ["image/gif"], defaultType: "image" },
  svg: { mimes: ["image/svg+xml"], defaultType: "logo" },
  pdf: { mimes: ["application/pdf"], defaultType: "pdf" },
  mp4: { mimes: ["video/mp4"], defaultType: "video" },
  mov: { mimes: ["video/quicktime"], defaultType: "video" },
  webm: { mimes: ["video/webm"], defaultType: "video" },
  pptx: {
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    defaultType: "presentation",
  },
  docx: {
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    defaultType: "document",
  },
  xlsx: { mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], defaultType: "document" },
};

export function validateAssetFile(
  file: { name: string; type: string; size: number },
): { ok: true; defaultType: AssetType } | { ok: false; reason: string } {
  if (file.size <= 0) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_ASSET_BYTES) return { ok: false, reason: `Files must be ${MAX_ASSET_BYTES / (1024 * 1024)} MB or smaller.` };
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const rule = ALLOWED_FILES[extension];
  if (!rule) {
    return { ok: false, reason: "Upload an image, video, PDF, PowerPoint, Word or Excel file." };
  }
  if (!rule.mimes.includes(file.type)) {
    return { ok: false, reason: "The file's type does not match its extension." };
  }
  return { ok: true, defaultType: rule.defaultType };
}

/** Uploads a file through the shared attachment service and records it as a marketing
 * asset. If recording fails, the uploaded file is removed so storage never holds a file
 * nothing points at. */
export async function uploadMarketingAsset(
  businessId: string,
  file: File,
  meta: {
    name: string;
    assetType: AssetType;
    altText: string | null;
    description: string | null;
    campaignId: string | null;
    offeringId: string | null;
  },
): Promise<string> {
  await authorise(businessId, "marketing.manage");
  const check = validateAssetFile(file);
  if (!check.ok) throw new MarketingError("ASSET_INVALID", check.reason);

  const assetId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-150);
  const attachment = await uploadAttachment({
    businessId,
    entityType: "discovery.marketing_asset",
    entityId: assetId,
    file,
    fileName: safeName,
  });

  const supabase = await createClient();
  const { error } = await supabase.from("marketing_assets").insert({
    id: assetId,
    business_id: businessId,
    attachment_id: attachment.id,
    name: meta.name,
    asset_type: meta.assetType,
    alt_text: meta.altText,
    description: meta.description,
    campaign_id: meta.campaignId,
    offering_id: meta.offeringId,
  });
  if (error) {
    await deleteAttachment(attachment.id).catch(() => undefined);
    throw error;
  }
  return assetId;
}

export async function deleteMarketingAsset(businessId: string, assetId: string): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: asset, error: readError } = await supabase
    .from("marketing_assets")
    .select("attachment_id, name")
    .eq("business_id", businessId)
    .eq("id", assetId)
    .maybeSingle();
  if (readError) throw readError;
  if (!asset) throw new MarketingError("ASSET_NOT_FOUND", "That asset no longer exists.");

  // Deleting the attachment cascades to the asset row (attachment_id ... on delete cascade).
  await deleteAttachment(asset.attachment_id as string);
  await writeAuditLog({
    businessId,
    action: "marketing.asset.deleted",
    entityType: "marketing_asset",
    entityId: assetId,
    before: { name: asset.name },
  });
}

// ---------------------------------------------------------------------------
// Metric import (MKT-06) and attribution (MKT-07)
// ---------------------------------------------------------------------------

/** Writes an imported batch in one upsert; re-importing the same file replaces rather
 * than double-counts (the (campaign, date, source) key). */
export async function importCampaignMetrics(businessId: string, campaignId: string, rows: MetricSnapshotInput[]): Promise<number> {
  await authorise(businessId, "marketing.manage");
  if (rows.length === 0) return 0;
  const supabase = await createClient();
  const { data: campaign, error: readError } = await supabase
    .from("marketing_campaigns")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  if (readError) throw readError;
  if (!campaign) throw new MarketingError("CAMPAIGN_NOT_FOUND", "That campaign no longer exists.");
  const { error } = await supabase.from("marketing_campaign_metrics").upsert(
    rows.map((r) => ({
      business_id: businessId,
      campaign_id: campaignId,
      metric_date: r.metricDate,
      source: "import",
      impressions: r.impressions,
      clicks: r.clicks,
      sessions: r.sessions,
      engagements: r.engagements,
      leads: r.leads,
      qualified_leads: r.qualifiedLeads,
      opportunities: r.opportunities,
      customers: r.customers,
      revenue: r.revenue,
      spend: r.spend,
      currency: r.currency,
    })),
    { onConflict: "campaign_id,metric_date,source" },
  );
  if (error) throw error;
  await writeAuditLog({ businessId, action: "marketing.metrics.imported", entityType: "marketing_campaign", entityId: campaignId, after: { rows: rows.length } });
  return rows.length;
}

/**
 * Records that a campaign touched a prospect, opportunity or customer. The record must be
 * this business's own — checked here, since the target lives in another table (or schema)
 * that a foreign key cannot reach. Ownership of that record does not move (§11).
 */
export async function recordAttribution(businessId: string, campaignId: string, input: AttributionInput): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_campaigns")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) throw new MarketingError("CAMPAIGN_NOT_FOUND", "That campaign no longer exists.");

  let owned = false;
  if (input.entityType === "customer") {
    const core = await createCoreClient({ schema: "core" });
    const { data } = await core.from("parties").select("id").eq("business_id", businessId).eq("id", input.entityId).maybeSingle();
    owned = Boolean(data);
  } else {
    const table = input.entityType === "prospect" ? "prospects" : "opportunities";
    const { data } = await supabase.from(table).select("workspace_id").eq("id", input.entityId).maybeSingle();
    if (data) {
      const { data: ws } = await supabase.from("workspaces").select("product_id").eq("id", data.workspace_id as string).maybeSingle();
      const { data: product } = ws
        ? await supabase.from("products").select("id").eq("business_id", businessId).eq("id", ws.product_id as string).maybeSingle()
        : { data: null };
      owned = Boolean(product);
    }
  }
  if (!owned) throw new MarketingError("CAMPAIGN_NOT_FOUND", "That record was not found in this business.");

  const { error } = await supabase.from("marketing_attributions").upsert(
    {
      business_id: businessId,
      campaign_id: campaignId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      touch_type: input.touchType,
      source: "manual",
      occurred_at: input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString(),
      evidence: input.evidence ? { note: input.evidence } : {},
    },
    { onConflict: "campaign_id,entity_type,entity_id,touch_type" },
  );
  if (error) throw error;
  await writeAuditLog({
    businessId,
    action: "marketing.attribution.recorded",
    entityType: "marketing_campaign",
    entityId: campaignId,
    after: { entityType: input.entityType, entityId: input.entityId, touchType: input.touchType },
  });
}

export async function deleteAttribution(businessId: string, attributionId: string): Promise<void> {
  await authorise(businessId, "marketing.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_attributions").delete().eq("business_id", businessId).eq("id", attributionId);
  if (error) throw error;
}

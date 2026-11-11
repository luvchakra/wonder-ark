import { understandProduct } from "../ai/understand-product";
import { generateIcp } from "../ai/generate-icp";
import { discoverProspects } from "../ai/discover-prospects";
import { researchProspect } from "../ai/research-prospect";
import { generateResearchBrief } from "../ai/generate-research-brief";
import { getProduct } from "../tenancy/queries";
import { getIcpProfile } from "../icp/queries";
import { approveIcpProfile } from "../icp/mutations";
import { seedBuyerPersonasFromIcp } from "../personas/mutations";
import { listBuyerPersonas } from "../personas/queries";
import { seedDiscoveryDefinitionFromIcp } from "../discovery-definitions/mutations";
import { listDiscoveryDefinitions } from "../discovery-definitions/queries";
import { approveProspectSuggestions } from "../prospects/mutations";
import { listProspects } from "../prospects/queries";
import { listContacts } from "../contacts/queries";
import { listMessages } from "../messages/queries";
import { syncNegativeSignalsForProspect } from "../negative-signals/mutations";
import { listNegativeSignalsForProspect } from "../negative-signals/queries";
import { correlateSignalsForProspect, syncSignalsFromResearch } from "../signals/mutations";
import { computeBuyerIntelligence } from "../buyer-intelligence/intelligence";
import { computeBuyerFitScores } from "../buyer-intelligence/scoring";
import {
  createOpportunity,
  attachSignalCorrelation,
  setOpportunityWhyNow,
  setOpportunityBuyerIntelligence,
  setOpportunityNextBestAction,
} from "../opportunities/mutations";
import { listOpportunities } from "../opportunities/queries";
import type { NextBestActionInput } from "../opportunities/next-best-action";
import type { DiscoveryDefinition } from "../discovery-definitions/types";
import type { Opportunity } from "../opportunities/types";
import {
  classifyEnumConfidence,
  classifyEvidenceConfidences,
  classifyNumericConfidence,
  worstReviewLevel,
  type StageReviewLevel,
} from "./review";
import { passesIcpPreFilter } from "./icp-pre-filter";
import type { AiApprovalMode } from "../ai-approval/types";

/** DISC-AI-APPROVAL-01: `aiApprovalMode` is the business's own setting, read on the
 * server by the route (never taken from the request body) -- it decides whether the ICP
 * and account-discovery stages approve their own results. */
export type StageContext = {
  workspaceId: string;
  productId: string;
  aiApprovalMode: AiApprovalMode;
};

/** DISC-OFFER-P1-02.1: `reviewLevel` is undefined for a stage with no confidence-bearing
 * result of its own (the several deterministic, rule-based stages -- buyer personas,
 * discovery strategy, account discovery, CRM handoff -- have nothing an AI judged
 * uncertain to flag); `run-ai-discovery/route.ts` treats an undefined level exactly like
 * `"automated"` (write `completed`, not `needs_review`/`insufficient_evidence`). */
export type StageOutcome = {
  outcome: "completed" | "skipped";
  detail: string;
  reviewLevel?: StageReviewLevel;
  /** DISC-AI-APPROVAL-01: true when this stage left a proposal for a person to approve
   * ("Review each step") and the run should stop here rather than carry on as if it had
   * been approved. The route records the run as `awaiting_approval`. */
  awaitingApproval?: boolean;
};

const ACCOUNT_DISCOVERY_MAX = 10;
const RESEARCH_TOP_N = 3;

function activeDefinition(definitions: DiscoveryDefinition[]): DiscoveryDefinition | null {
  return definitions.find((d) => d.is_enabled) ?? definitions[0] ?? null;
}

/** DISC-OFFER-P0-10.1: "Research Website" -- `understandProduct()` already does both the
 * live website research AND the structuring into `products.product_profile` in one AI
 * call (its own freshness check skips re-researching when nothing's changed since the
 * last run, honoring CLAUDE.md dev principle #5's "minimize LLM calls"). That single call
 * covers this stage's own name and `offering_profile`'s below at once -- see that
 * handler's own comment for why they still get separate stage rows. */
export async function runWebsiteUnderstandingStage(ctx: StageContext): Promise<StageOutcome> {
  const product = await getProduct(ctx.productId);
  if (!product) throw new Error("Offering not found.");
  if (!product.website) {
    throw new Error("Add a website to this offering before running AI Discovery.");
  }
  const profile = await understandProduct(ctx.productId);
  return {
    outcome: "completed",
    detail: "Website researched and offering profile updated.",
    reviewLevel: classifyNumericConfidence(profile.confidence),
  };
}

/** No AI call of its own -- `website_understanding` (above) already wrote
 * `products.product_profile` as part of the same research call. This stage exists as its
 * own row (rather than folding it into `website_understanding`) because DISC-OFFER-P0-
 * 10.2's own stage-key list names them separately, and DISC-OFFER-P0-11.x's "Editable
 * Pipeline Stages"/"Run From This Stage" need a distinct stage to attach an edit/rerun
 * affordance to once a founder edits the *profile* specifically, independent of
 * re-researching the site. Simply confirms the profile exists. */
export async function runOfferingProfileStage(ctx: StageContext): Promise<StageOutcome> {
  const product = await getProduct(ctx.productId);
  if (!product?.product_profile) {
    throw new Error("No offering profile yet -- run Research Website first.");
  }
  return {
    outcome: "completed",
    detail: "Offering profile confirmed.",
    reviewLevel: classifyNumericConfidence(product.product_profile.confidence),
  };
}

/** DISC-OFFER-P0-10.1: "Build / Refine ICP". Generates (or reuses an already-approved)
 * ICP. DISC-AI-APPROVAL-01: approves it only when the business chose "Approve
 * automatically" -- every downstream automated function in this module hard-requires an
 * *approved* ICP (`discoverProspects`, `detectNegativeSignals`, `generateOutreachStrategy`),
 * so that mode lets the run carry on unattended. In "Review each step" a fresh ICP stays a
 * draft version, the stage is recorded as needing review, and the run stops here until the
 * founder approves it on the ICP page and resumes. An ICP the founder already approved is
 * reused untouched (generateIcp's own freshness check) and the run continues in both modes.
 * A founder can still edit/re-approve it by hand afterward like any other ICP
 * (DISC-OFFER-P0-02.2). */
export async function runIcpStage(ctx: StageContext): Promise<StageOutcome> {
  const generated = await generateIcp(ctx.productId);
  const icp = generated.status !== "approved" && ctx.aiApprovalMode === "auto" ? await approveIcpProfile(generated.id) : generated;
  const summary = `${icp.industries.length} industries, ${icp.roles.length} roles`;
  if (icp.status !== "approved") {
    return {
      outcome: "completed",
      detail: `ICP saved as a draft for your review (${summary}). Approve it on the ICP page, then resume AI Discovery.`,
      reviewLevel: "needs_review",
      awaitingApproval: true,
    };
  }
  // DISC-OFFER-P1-02.1: `confidence` is null when this run reused an already-approved
  // ICP untouched (generateIcp's own freshness check) or the ICP was last written by a
  // founder's own manual edit (updateIcpProfile clears it -- see icp/types.ts's own
  // comment) -- in both cases this run made no fresh automated claim of its own to
  // second-guess, so there's nothing to flag. Only a genuinely freshly-generated ICP
  // (always a real 0-1 number per IcpProfileSchema) gets classified.
  return {
    outcome: "completed",
    detail: `ICP ready (${summary}).`,
    reviewLevel: icp.confidence === null ? "automated" : classifyNumericConfidence(icp.confidence),
  };
}

/** DISC-OFFER-P0-10.1: "Identify Buyer Personas" -- deterministic (see
 * `deriveBuyerPersonasFromIcp`), not an AI call. */
export async function runBuyerPersonasStage(ctx: StageContext): Promise<StageOutcome> {
  const icp = await getIcpProfile(ctx.workspaceId);
  if (!icp) throw new Error("No ICP yet -- run Build / Refine ICP first.");
  const created = await seedBuyerPersonasFromIcp(ctx.workspaceId, icp);
  return { outcome: "completed", detail: created > 0 ? `${created} buyer persona(s) added.` : "Buyer personas already up to date." };
}

/** DISC-OFFER-P0-10.1: "Build Discovery Strategy" -- deterministic (see
 * `seedDiscoveryDefinitionFromIcp`), not an AI call. */
export async function runDiscoveryStrategyStage(ctx: StageContext): Promise<StageOutcome> {
  const icp = await getIcpProfile(ctx.workspaceId);
  if (!icp) throw new Error("No ICP yet -- run Build / Refine ICP first.");
  const created = await seedDiscoveryDefinitionFromIcp(ctx.workspaceId, icp);
  return { outcome: "completed", detail: created ? `Discovery definition "${created.name}" created.` : "A discovery definition already exists." };
}

/** DISC-OFFER-P0-10.1: "Find & Enrich Accounts" -- `discoverProspects()` already returns
 * enriched fields (industry/size/location/description) per candidate in the same search
 * call, so there's no separate enrichment pass to run. Duplicate accounts are already
 * excluded by `discoverProspects`' own `findDuplicateProspect` check.
 *
 * DISC-AI-APPROVAL-01: "Approve automatically" approves every suggestion this run found
 * into a real prospect, so the downstream signal/scoring/research stages have rows to act
 * on (nothing here is sent anywhere external). "Review each step" keeps them as
 * suggestions -- the same review queue the manual Discover page uses -- records the stage
 * as needing review, and stops the run; once the founder approves the ones they want and
 * resumes, the later stages pick those prospects up. */
export async function runAccountDiscoveryStage(ctx: StageContext): Promise<StageOutcome> {
  const suggestions = await discoverProspects(ctx.workspaceId, undefined, ACCOUNT_DISCOVERY_MAX);
  if (suggestions.length === 0) {
    return { outcome: "skipped", detail: "No new accounts found this run." };
  }
  if (ctx.aiApprovalMode !== "auto") {
    return {
      outcome: "completed",
      detail: `${suggestions.length} account(s) suggested for your review. Approve the ones you want under Find, in To review, then resume AI Discovery.`,
      reviewLevel: "needs_review",
      awaitingApproval: true,
    };
  }
  const approved = await approveProspectSuggestions(
    ctx.workspaceId,
    suggestions.map((s) => s.id),
  );
  return { outcome: "completed", detail: `${approved} new account(s) added.` };
}

/** Prospects in this workspace that don't yet have an Opportunity under the active
 * discovery definition -- the stable, resumable selector every downstream stage in this
 * file uses instead of threading an in-memory "this run's accounts" list across separate
 * requests (each stage runs as its own request -- see the route handler's own comment for
 * why). Capped so a workspace with a long prospect history never turns one pipeline click
 * into an unbounded research bill. */
async function prospectsPendingOpportunity(workspaceId: string, definitionId: string, limit: number) {
  const [prospects, opportunities] = await Promise.all([listProspects(workspaceId, {}), listOpportunities(workspaceId)]);
  const covered = new Set(opportunities.filter((o) => o.discovery_definition_id === definitionId).map((o) => o.prospect_id));
  return prospects.filter((p) => !covered.has(p.id)).slice(0, limit);
}

export async function requireActiveDefinition(workspaceId: string): Promise<DiscoveryDefinition> {
  const definitions = await listDiscoveryDefinitions(workspaceId);
  const definition = activeDefinition(definitions);
  if (!definition) throw new Error("No discovery definition -- run Build Discovery Strategy first.");
  return definition;
}

/** DISC-OFFER-P0-10.1: "Collect Signals" -- researches each pending account (a real AI
 * call per account, `researchProspect`), materializes its buying signals/recent events as
 * `discovery.signals` rows, checks it against the seven auto-detectable negative-signal
 * reasons, and opens the Opportunity row the next stages attach their own findings to
 * (DISC-OFFER-P0-05.1: an opportunity is inherently a prospect+definition pairing, first
 * established here). One account's research failing (e.g. a transient provider error)
 * does not fail the whole stage -- partial success, the same precedent
 * DISC-OFFER-P0-09.2's crawl already established for a single page failing -- it is
 * simply left uncovered for a future run to pick up via the same selector above.
 *
 * DISC-OFFER-P1 §7-03.1 "Progressive Intelligence": before spending that AI call, run
 * `passesIcpPreFilter` against each pending account's own already-known industry/
 * location/company_size (from account discovery's own basic enrichment, no new AI
 * call) against the active ICP profile. An account that clearly fails is left
 * uncovered for this run -- same "left uncovered, picked up later" treatment as an
 * actual research failure -- rather than spending Signal Detection's own AI call on an
 * account the cheap, free check already ruled out. No ICP yet (a workspace that hasn't
 * approved one) means nothing to filter against, so every pending account proceeds. */
export async function runSignalsStage(ctx: StageContext): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const pending = await prospectsPendingOpportunity(ctx.workspaceId, definition.id, ACCOUNT_DISCOVERY_MAX);
  if (pending.length === 0) return { outcome: "skipped", detail: "No new accounts to collect signals for." };

  const icp = await getIcpProfile(ctx.workspaceId);
  const toResearch = icp
    ? pending.filter(
        (prospect) =>
          passesIcpPreFilter(
            { industries: icp.industries, geographies: icp.geographies, companySizes: icp.company_sizes, exclusions: icp.exclusions },
            { industry: prospect.industry, location: prospect.location, companySize: prospect.company_size },
          ).passes,
      )
    : pending;
  const filteredOutCount = pending.length - toResearch.length;
  if (toResearch.length === 0) {
    return { outcome: "skipped", detail: `All ${pending.length} pending account(s) were filtered out by ICP fit before spending on research.` };
  }

  let succeeded = 0;
  let lastError: string | null = null;
  // DISC-OFFER-P1-02.1: one flat pool of every evidence item's own confidence across
  // every account this run actually researched -- an account whose research turned up
  // no evidence at all (not the same as one that failed outright, handled below) counts
  // as its own empty contribution via classifyEvidenceConfidences, not silently ignored.
  const evidenceConfidences: ("low" | "medium" | "high")[] = [];
  for (const prospect of toResearch) {
    try {
      const research = await researchProspect(prospect.id);
      evidenceConfidences.push(...research.evidence.map((e) => e.confidence));
      await syncSignalsFromResearch(ctx.workspaceId, prospect.id);
      await syncNegativeSignalsForProspect(ctx.workspaceId, prospect.id);
      await createOpportunity(ctx.workspaceId, {
        prospectId: prospect.id,
        discoveryDefinitionId: definition.id,
        whyThem: null,
        whyNow: null,
        recommendedAction: null,
      });
      succeeded += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Something went wrong.";
    }
  }
  if (succeeded === 0) throw new Error(lastError ?? "Signal collection failed for every account.");
  return {
    outcome: "completed",
    detail: `Signals collected for ${succeeded} of ${toResearch.length} account(s)${filteredOutCount > 0 ? ` (${filteredOutCount} skipped by cheap ICP filtering)` : ""}.`,
    reviewLevel: classifyEvidenceConfidences(evidenceConfidences),
  };
}

/** Every open opportunity under the active definition -- the shared selector the
 * remaining per-opportunity stages below use. */
export async function activeOpportunities(workspaceId: string, definitionId: string): Promise<Opportunity[]> {
  const opportunities = await listOpportunities(workspaceId);
  return opportunities.filter(
    (o) => o.discovery_definition_id === definitionId && !["sent_to_crm", "dismissed", "expired"].includes(o.status),
  );
}

/** DISC-OFFER-P0-10.1: "Correlate Signals" -- DISC-OFFER-P0-05.3's own
 * `correlateSignalsForProspect` already re-syncs signals and persists the correlation;
 * `attachSignalCorrelation` (05.3) writes its confidence into the opportunity's own
 * `signal_strength_score` component and recomputes `score` from whatever's populated so
 * far. Only opportunities lacking a correlation yet -- an opportunity a prior run already
 * correlated is left alone rather than re-correlated on every click. */
export async function runSignalCorrelationStage(ctx: StageContext): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const opportunities = (await activeOpportunities(ctx.workspaceId, definition.id)).filter((o) => !o.signal_correlation_id);
  if (opportunities.length === 0) return { outcome: "skipped", detail: "Nothing new to correlate." };

  let correlated = 0;
  // DISC-OFFER-P1-02.1: an opportunity whose account has no correlatable signals yet is
  // itself a real "insufficient evidence" reading for this stage, worth flagging -- not
  // excluded from the aggregate just because nothing was attached this time.
  const reviewLevels: StageReviewLevel[] = [];
  for (const opportunity of opportunities) {
    const correlation = await correlateSignalsForProspect(ctx.workspaceId, opportunity.prospect_id);
    if (correlation) {
      await attachSignalCorrelation(opportunity.id, correlation);
      correlated += 1;
      reviewLevels.push(classifyEnumConfidence(correlation.confidence, true));
    } else {
      reviewLevels.push("insufficient_evidence");
    }
  }
  return {
    outcome: "completed",
    detail: `${correlated} of ${opportunities.length} opportunity(ies) correlated.`,
    reviewLevel: worstReviewLevel(reviewLevels),
  };
}

/** DISC-OFFER-P0-10.1: "Score Opportunities" -- a checkpoint/reporting stage, not a new
 * computation of its own: DISC-OFFER-P0-05.2's own `computeOpportunityScore` already runs
 * automatically, on whatever components are populated so far, every time
 * `attachSignalCorrelation`/`setOpportunityWhyNow`/`setOpportunityBuyerIntelligence`
 * write one (the previous and following stages). There is deliberately no new scoring
 * dimension invented here for `icp_fit`/`buyer_fit`/`need_fit`/`contactability`/
 * `evidence_confidence` beyond what those already-built mutations populate --
 * DISC-OFFER-P0-05.2's own "no false precision" rule means an unpopulated component is
 * correctly left out of the average, not zero-filled, and inventing a new heuristic for
 * them would be scope creep into an already-closed story (CLAUDE.md dev principle #7). */
export async function runOpportunityScoringStage(ctx: StageContext): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const opportunities = await activeOpportunities(ctx.workspaceId, definition.id);
  if (opportunities.length === 0) return { outcome: "skipped", detail: "No open opportunities to score." };
  const scored = opportunities.filter((o) => o.score !== null).length;
  // DISC-OFFER-P1-02.1: a null score is DISC-OFFER-P0-05.2's own literal "Insufficient
  // evidence" case (zero score components populated) -- a genuinely different fact from
  // a real, if low, `confidence` reading on a score that *did* get computed.
  const reviewLevels = opportunities.map((o) => (o.score === null ? "insufficient_evidence" as const : classifyEnumConfidence(o.confidence, true)));
  return {
    outcome: "completed",
    detail: `${scored} of ${opportunities.length} opportunity(ies) have a score.`,
    reviewLevel: worstReviewLevel(reviewLevels),
  };
}

/** DISC-OFFER-P0-10.1: "Generate Why Now" -- DISC-OFFER-P0-05.4's own `computeWhyNow`,
 * fed the same correlation `signal_correlation` just persisted (recomputed here, cheaply,
 * from already-stored signals -- `correlateSignalsForProspect` is deterministic given the
 * same signal rows, so recomputing it is not a second AI call). */
export async function runWhyNowStage(ctx: StageContext): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const opportunities = (await activeOpportunities(ctx.workspaceId, definition.id)).filter((o) => !o.why_now);
  if (opportunities.length === 0) return { outcome: "skipped", detail: "Nothing new to explain." };

  let updated = 0;
  const reviewLevels: StageReviewLevel[] = [];
  for (const opportunity of opportunities) {
    const correlation = await correlateSignalsForProspect(ctx.workspaceId, opportunity.prospect_id);
    const result = await setOpportunityWhyNow(opportunity.id, correlation);
    // DISC-OFFER-P1-02.1: `timing_strength` is null exactly when `computeWhyNow` had no
    // correlation to work with (why-now.ts's own comment) -- a genuinely different fact
    // from a real, if low, `why_now_confidence` reading on a claim that *was* computed.
    reviewLevels.push(result.timing_strength === null ? "insufficient_evidence" : classifyEnumConfidence(result.why_now_confidence, true));
    updated += 1;
  }
  return { outcome: "completed", detail: `Why Now generated for ${updated} opportunity(ies).`, reviewLevel: worstReviewLevel(reviewLevels) };
}

/** DISC-OFFER-P0-10.1: "Research Top Opportunities" -- bounded to the top-scoring few
 * (nulls last, so opportunities with no score yet are never chosen ahead of ones AI
 * Discovery has real evidence for), matching the pipeline diagram's own literal "Research
 * TOP Opportunities" wording rather than researching every account this run touched.
 * `generateResearchBrief` (DISC-OFFER-P0-06.2) is a real AI call, and as a documented side
 * effect already computes and writes this prospect's buyer intelligence too
 * (DISC-OFFER-P0-06.3's own `setOpportunityBuyerIntelligence`) -- see the
 * `buyer_intelligence` stage's own comment below for why that stage still exists
 * separately. */
export async function runResearchStage(ctx: StageContext): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const opportunities = (await activeOpportunities(ctx.workspaceId, definition.id))
    .filter((o) => !o.why_them)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, RESEARCH_TOP_N);
  if (opportunities.length === 0) return { outcome: "skipped", detail: "No unresearched top opportunities." };

  let succeeded = 0;
  let lastError: string | null = null;
  const reviewLevels: StageReviewLevel[] = [];
  for (const opportunity of opportunities) {
    try {
      const brief = await generateResearchBrief(opportunity.prospect_id);
      reviewLevels.push(classifyEnumConfidence(brief.confidence, true));
      succeeded += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Something went wrong.";
    }
  }
  if (succeeded === 0) throw new Error(lastError ?? "Research failed for every selected opportunity.");
  return {
    outcome: "completed",
    detail: `Researched ${succeeded} of ${opportunities.length} top opportunity(ies).`,
    reviewLevel: worstReviewLevel(reviewLevels),
  };
}

/** DISC-OFFER-P0-10.1: "Identify Buying Committee" -- `research` (above) already computes
 * and writes buyer intelligence for whichever opportunities it deep-researched, as a
 * documented side effect of `generateResearchBrief`. This stage covers the remainder: any
 * open opportunity that already has real contacts on file (e.g. added manually, or from
 * an earlier CSV import) but wasn't one of this run's "top" research picks -- purely
 * deterministic (`computeBuyerIntelligence`, no AI call, CLAUDE.md dev principle #4),
 * since matching existing contacts against existing personas needs no new evidence
 * gathering. An opportunity whose prospect has no contacts on file yet is left alone
 * (nothing to compute -- automation must not invent a person, §25). */
export async function runBuyerIntelligenceStage(ctx: StageContext): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const opportunities = (await activeOpportunities(ctx.workspaceId, definition.id)).filter((o) => o.buyer_fit_score === null);
  if (opportunities.length === 0) return { outcome: "skipped", detail: "Nothing new to compute." };

  const personas = await listBuyerPersonas(ctx.workspaceId);
  const icp = await getIcpProfile(ctx.workspaceId);
  let updated = 0;
  const reviewLevels: StageReviewLevel[] = [];
  for (const opportunity of opportunities) {
    const contacts = await listContacts(opportunity.prospect_id);
    if (contacts.length === 0) continue;
    const candidates = computeBuyerIntelligence(contacts, personas, icp?.roles ?? [], []);
    await setOpportunityBuyerIntelligence(opportunity.id, candidates);
    reviewLevels.push(classifyEvidenceConfidences(candidates.map((c) => c.confidence)));
    updated += 1;
  }
  return updated > 0
    ? { outcome: "completed", detail: `Buying committee identified for ${updated} opportunity(ies).`, reviewLevel: worstReviewLevel(reviewLevels) }
    : { outcome: "skipped", detail: "No contacts on file yet for the remaining opportunities." };
}

/** DISC-OFFER-P0-07.1's own narrow `NextBestActionInput` shape, gathered from data every
 * earlier stage already produces -- no new evidence gathered here. Extracted out of
 * `runRecommendedActionStage` below (DISC-OFFER-P1-01.2) so `lib/pipeline/incremental.ts`
 * can build the exact same input for a single just-updated opportunity without
 * duplicating this gathering logic a second time and risking the two drifting apart.
 * Fetches `personas`/`icp` fresh per call rather than once per batch the way the stage's
 * own loop used to -- one extra pair of cheap reads per opportunity, traded for one
 * shared, single-purpose function instead of two slightly different copies of the same
 * logic. */
export async function buildNextBestActionInput(workspaceId: string, opportunity: Opportunity): Promise<NextBestActionInput> {
  const [personas, icp, contacts, messages, negativeSignals] = await Promise.all([
    listBuyerPersonas(workspaceId),
    getIcpProfile(workspaceId),
    listContacts(opportunity.prospect_id),
    listMessages(opportunity.prospect_id),
    listNegativeSignalsForProspect(opportunity.prospect_id),
  ]);
  const candidates = contacts.length > 0 ? computeBuyerIntelligence(contacts, personas, icp?.roles ?? [], []) : [];
  const { primaryContactId } = computeBuyerFitScores(candidates);
  const primary = candidates.find((c) => c.contact.id === primaryContactId) ?? null;

  return {
    status: opportunity.status,
    score: opportunity.score,
    confidence: opportunity.confidence,
    hasResearch: Boolean(opportunity.why_them),
    negativeSignalReasons: negativeSignals.map((n) => n.reason),
    hasContact: contacts.length > 0,
    bestContactability: primary?.contactability ?? null,
    hasDraftMessage: messages.some((m) => m.status === "draft"),
    hasSentMessage: messages.some((m) => m.status === "sent"),
  };
}

/** DISC-OFFER-P0-10.1: "Recommend Next Action" -- DISC-OFFER-P0-07.1's own
 * `computeNextBestAction`, deterministic. Only opportunities missing a recommendation
 * yet -- one already recommended earlier is left alone here (DISC-OFFER-P1-01.2's own
 * "Incremental Re-Run" is the path that revisits an opportunity that already has one,
 * when fresh evidence specifically calls for it). */
export async function runRecommendedActionStage(ctx: StageContext): Promise<StageOutcome> {
  const definition = await requireActiveDefinition(ctx.workspaceId);
  const opportunities = (await activeOpportunities(ctx.workspaceId, definition.id)).filter((o) => !o.recommended_action);
  if (opportunities.length === 0) return { outcome: "skipped", detail: "Nothing new to recommend." };

  let updated = 0;
  const reviewLevels: StageReviewLevel[] = [];
  for (const opportunity of opportunities) {
    const input = await buildNextBestActionInput(ctx.workspaceId, opportunity);
    // DISC-OFFER-P1-02.1: the recommendation itself is deterministic (07.1), so it's
    // the confidence of the opportunity data it was computed from -- already gathered
    // above -- that decides whether this particular recommendation is worth a founder's
    // second look, the same "score is null" -> insufficient-evidence reading 05.2's own
    // opportunity-scoring stage already established.
    reviewLevels.push(input.score === null ? "insufficient_evidence" : classifyEnumConfidence(input.confidence, true));
    await setOpportunityNextBestAction(opportunity.id, input);
    updated += 1;
  }
  return {
    outcome: "completed",
    detail: `Next best action recommended for ${updated} opportunity(ies).`,
    reviewLevel: worstReviewLevel(reviewLevels),
  };
}

import type { AiQualityTier } from "./model-registry";

// BYOK AI operation registry (docs/byok-ai-requirements.md §5). Every AI-invoking
// function in lib/ai/ declares its requirements here instead of picking a model tier
// itself -- the router (router.ts) is what turns "operation" into "provider + model".
export type AiOperation =
  | "understand_business"
  | "understand_business_website"
  | "understand_product"
  | "discover_products"
  | "generate_icp"
  | "generate_consumer_icp"
  | "research_prospect"
  | "discover_prospects"
  | "generate_outreach_strategy"
  | "generate_outreach_message"
  | "write_campaign_messages"
  | "write_opening_line"
  | "generate_reply"
  | "classify_reply"
  | "chat"
  | "restructure_import"
  | "draft_review_response"
  | "check_response_quality"
  | "summarize_customer"
  | "summarize_conversation"
  | "suggest_offering_profile"
  | "generate_research_brief"
  | "extract_business_offerings"
  | "answer_help_question"
  | "answer_business_question"
  | "draft_customer_reply"
  | "auto_send_customer_reply"
  | "marketing_strategy_draft"
  | "marketing_content_assist"
  | "funding_outreach_draft"
  | "funding_diligence_draft"
  | "funding_investor_research";

export type AiOperationSpec = {
  qualityTier: AiQualityTier;
  /** Needs a provider-executed web search tool wired into the request (Story E). */
  requiresWebSearch: boolean;
};

const OPERATION_REGISTRY: Record<AiOperation, AiOperationSpec> = {
  // Same shape as understand_product below, just for a business instead of a single
  // product -- researches the business's own website via the provider-executed search
  // tool, then structures a short name/description from those findings.
  understand_business: { qualityTier: "reasoning", requiresWebSearch: true },
  // DISC-OFFER-P0-09.1's own "Website URL Business Onboarding" -- same research shape as
  // understand_business above (reasoning + web search for the research step; the
  // structuring step itself still runs at modelAtTier("fast"), same as every other
  // operation here), just a much richer structured output (WebsiteBusinessProfileSchema)
  // with per-field explicit/inferred/unknown provenance instead of a plain name/description.
  understand_business_website: { qualityTier: "reasoning", requiresWebSearch: true },
  // Reasoning + web search: understandProduct() researches the product's own website
  // via the provider-executed search tool before structuring a profile, same shape as
  // research_prospect below -- not just "balanced" text extraction from static sources
  // anymore.
  understand_product: { qualityTier: "reasoning", requiresWebSearch: true },
  // Same shape as understand_product: researches a live website via the provider-
  // executed search tool before structuring a list, rather than extracting from a
  // static source already in hand.
  discover_products: { qualityTier: "reasoning", requiresWebSearch: true },
  generate_icp: { qualityTier: "balanced", requiresWebSearch: false },
  // DISC-CONS-P0-01.2: the "Ideal user" of an offering sold to consumers, from the same
  // offering profile and of the same size as generate_icp, so the same tier. No web search.
  generate_consumer_icp: { qualityTier: "balanced", requiresWebSearch: false },
  research_prospect: { qualityTier: "reasoning", requiresWebSearch: true },
  discover_prospects: { qualityTier: "reasoning", requiresWebSearch: true },
  // Reasoning, not balanced: tying research evidence to a specific angle and CTA is
  // exactly the synthesis task the existing lib/ai/generate-strategy.ts picked the
  // strongest tier for -- BYOK preserves that choice rather than downgrading it.
  generate_outreach_strategy: { qualityTier: "reasoning", requiresWebSearch: false },
  generate_outreach_message: { qualityTier: "balanced", requiresWebSearch: false },
  // DISC-CAMP-P0-03.1: a campaign's messages for one line of work. The same bounded
  // writing task as generate_outreach_message, from the offering's own profile.
  write_campaign_messages: { qualityTier: "balanced", requiresWebSearch: false },
  // DISC-CAMP-P0-03.2: one sentence per prospect, many per campaign, so the fast tier.
  write_opening_line: { qualityTier: "fast", requiresWebSearch: false },
  generate_reply: { qualityTier: "balanced", requiresWebSearch: false },
  classify_reply: { qualityTier: "fast", requiresWebSearch: false },
  // Reasoning, the strongest tier: the founder asked for this directly after the
  // balanced tier kept mis-following its own context (e.g. linking to a business/
  // dashboard page instead of the specific product page it was given). Chat is a
  // synthesis task over real pipeline state plus a growing conversation history --
  // worth the strongest available model, same call as generate_outreach_strategy.
  chat: { qualityTier: "reasoning", requiresWebSearch: false },
  // Fast, not balanced: mapping an uploaded file's own columns/text onto the prospect
  // schema is extraction, not synthesis -- same tier classify_reply already uses for a
  // comparably mechanical task.
  restructure_import: { qualityTier: "fast", requiresWebSearch: false },
  // Balanced, same tier as generate_outreach_message: drafting a short, on-brand reply
  // to one review's rating/comment is a bounded writing task, not extraction (fast) or
  // multi-source synthesis (reasoning). CRM-08.6's own first caller of this registry
  // from outside module-discovery -- see business-router.ts for the business_id-scoped
  // (rather than workspace_id-scoped) credential resolution any other non-discovery
  // module can now reuse the same way.
  draft_review_response: { qualityTier: "balanced", requiresWebSearch: false },
  // Balanced, not fast: CRM-09.7's pre-send quality check is a judgment call across five
  // separate semantic dimensions (unanswered question, unsupported claim, missing price/
  // availability fact, risky/uncertain statement, wrong customer/context) on a message
  // that's about to go out to a real customer -- worth more than the "fast" tier
  // classify_reply uses for a much narrower single-label task. The sixth check (overly
  // long) is deterministic (a plain length threshold), never routed through here.
  check_response_quality: { qualityTier: "balanced", requiresWebSearch: false },
  // Balanced, same tier as draft_review_response: composing a short summary from
  // already-structured CRM facts (Customer 360's own data) is a bounded writing task,
  // not the multi-source strategic synthesis chat/generate_outreach_strategy use
  // "reasoning" for.
  summarize_customer: { qualityTier: "balanced", requiresWebSearch: false },
  // Balanced, same tier as summarize_customer: extracting unresolved questions/promised
  // actions/sentiment from one conversation's own message history is bounded analysis
  // over given text, not multi-source synthesis.
  summarize_conversation: { qualityTier: "balanced", requiresWebSearch: false },
  // DISC-OFFER-P0-02.1's "Offering Setup Wizard" -- fast, same tier as classify_reply/
  // restructure_import: restating a founder's own free-text description into a handful
  // of flat fields is extraction, not synthesis, and needs no web search (unlike
  // understand_product, this never researches a website).
  suggest_offering_profile: { qualityTier: "fast", requiresWebSearch: false },
  // DISC-OFFER-P0-06.2's "Offering Research Brief" -- reasoning, same tier and shape as
  // generate_outreach_strategy: synthesizing offering_fit/problem_hypothesis/
  // potential_objection/suggested_opening from already-gathered research, ICP and
  // negative-signal evidence is exactly that tier's "tying research evidence to a
  // specific angle" case, not extraction. No web search: this reuses researchProspect()'s
  // own already-fetched findings rather than searching again (minimize LLM calls).
  generate_research_brief: { qualityTier: "reasoning", requiresWebSearch: false },
  // DISC-OFFER-P0-09.3's "AI Offering Extraction" -- balanced, same tier as
  // summarize_customer/draft_review_response: consolidating a crawled site's own findings
  // into a handful of distinct commercial offerings (not one per feature) is bounded
  // synthesis over already-gathered text, not the multi-source strategic synthesis
  // generate_outreach_strategy/chat use "reasoning" for. No web search: reuses the same
  // crawl findings understand_business_website already fetched (minimize LLM calls) --
  // no fresh research of its own.
  extract_business_offerings: { qualityTier: "balanced", requiresWebSearch: false },
  // The Get Help assistant. Balanced, not reasoning: the sections that answer the
  // question have already been found deterministically (core/help/search.ts), so this is
  // writing a short, accurate answer from text in hand -- the same bounded writing task
  // summarize_customer/draft_review_response use this tier for, not the multi-source
  // synthesis "reasoning" exists for. No web search, ever: the only allowed source is our
  // own documentation, and a model that went looking elsewhere would answer about some
  // other product.
  answer_help_question: { qualityTier: "balanced", requiresWebSearch: false },
  // PLATFORM-P1-11.2: the MCP server's ask_assistant tool. Balanced, same reasoning as
  // answer_help_question: the records it answers from were already read deterministically
  // through the public API with the caller's own key, so this is writing a short answer
  // from data in hand. No web search: the business's own records are the only source.
  answer_business_question: { qualityTier: "balanced", requiresWebSearch: false },
  // PLATFORM-P1-12.1: a draft answer to a customer's WhatsApp question, written only from facts
  // already gathered deterministically (business profile, items, offering knowledge, the
  // sender's own orders/jobs). Balanced, same bounded "write from data in hand" task; no web
  // search, since anything not in the business's own facts must not be said to a customer.
  draft_customer_reply: { qualityTier: "balanced", requiresWebSearch: false },
  // PLATFORM-P1-12.5/12.6: the same answer, for a business that turned on "Send
  // automatically" -- a separate operation so Platform -> AI can switch automatic sending off
  // on its own while drafts keep working. Same tier and no web search, for the same reason.
  auto_send_customer_reply: { qualityTier: "balanced", requiresWebSearch: false },
  // Discovery Marketing/Funding (MKT-04/09, FND-11/13/08). All draft-only: the result is
  // stored for a person to review and never acts by itself. Investor research is the one
  // that reads the live web, so it takes the reasoning tier with search, like
  // research_prospect.
  marketing_strategy_draft: { qualityTier: "balanced", requiresWebSearch: false },
  marketing_content_assist: { qualityTier: "balanced", requiresWebSearch: false },
  funding_outreach_draft: { qualityTier: "balanced", requiresWebSearch: false },
  funding_diligence_draft: { qualityTier: "balanced", requiresWebSearch: false },
  funding_investor_research: { qualityTier: "reasoning", requiresWebSearch: true },
};

export function getOperationSpec(operation: AiOperation): AiOperationSpec {
  return OPERATION_REGISTRY[operation];
}

/** Every registered AI feature, in registry order -- the rows the Platform Admin's AI
 * feature kill switch (PLATFORM-P0-10.4) lists. */
export function listAiOperations(): AiOperation[] {
  return Object.keys(OPERATION_REGISTRY) as AiOperation[];
}

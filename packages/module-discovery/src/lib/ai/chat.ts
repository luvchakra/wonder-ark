import { generateObject, type ModelMessage } from "ai";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { resolveBusinessIdBySlug, resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";
import {
  getBusiness,
  getCurrentAccount,
  getFirstWorkspaceForAccount,
  getFirstWorkspaceForBusiness,
  getProduct,
  getWorkspaceForProduct,
  listBusinesses,
  listProducts,
  listWorkspacesForProducts,
} from "../tenancy/queries";
import type { Workspace } from "../tenancy/types";
import { getIcpProfile } from "../icp/queries";
import { getProspectCountsForWorkspaces, listProspects } from "../prospects/queries";
import { assertWithinUsageLimit } from "../usage/limits";
import { appendChatMessage, listChatMessages } from "../chat/queries";
import { chatSystemPrompt, CHAT_PROMPT_VERSION } from "../../prompts/chat/chat_v1";
import { hashInput } from "./hash";
import { recordAiRun } from "./usage";
import { AiProviderError, resolveAiModel, toAiProviderError } from "./router";
import { ChatResponseSchema } from "./schemas";
import type { ModuleKey } from "@cofounderai/module-registry";
import { getChatContextSummary as getInventoryChatSummary } from "@cofounderai/module-inventory/contract/index";
import { getChatContextSummary as getFsmChatSummary } from "@cofounderai/module-fsm/contract/index";
import { getChatContextSummary as getGstChatSummary } from "@cofounderai/module-gst/contract/index";
import { getChatContextSummary as getCrmChatSummary } from "@cofounderai/module-crm/contract/index";

const OPERATION = "chat";
/** Caps how much prior turn history rides along on every request -- keeps the prompt
 * short (CLAUDE.md principle 9) rather than re-sending an ever-growing thread. */
const MAX_HISTORY_MESSAGES = 20;

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatReply = { answer: string; followUp: string | null };

/**
 * businessSlug/productId parsed from the current page's URL (lib/tenancy/active-path.ts)
 * -- businessSlug, not businessId: the client-side widget that builds this has no way to
 * resolve a slug to a real id itself (no shared context with whichever component loaded
 * the business list), so resolveChatContext() below does that one resolution server-side
 * instead. `moduleKey` read from the shell's own selected-module storage
 * (module-selection.ts, whatever module the bottom picker currently has selected --
 * "discovery" for its own pages, "inventory"/"fsm"/"crm"/"gst" for the others), and
 * `consultAllModules` the widget's own checkbox: when set, every licensed module
 * contributes its own summary instead of just the selected one, for a more informed
 * (slower) answer.
 */
export type ChatPageContext = {
  businessSlug: string | null;
  productId: string | null;
  moduleKey: string | null;
  consultAllModules: boolean;
};

const OTHER_MODULE_SUMMARIES: Record<Exclude<ModuleKey, "discovery">, (businessId: string) => Promise<{ ok: boolean; data?: string }>> = {
  inventory: getInventoryChatSummary,
  fsm: getFsmChatSummary,
  gst: getGstChatSummary,
  crm: getCrmChatSummary,
};

/**
 * Every OTHER module's own chat-context summary for one business, mechanism 2 (each
 * module's own `contract/index.ts`) -- MODULE_NOT_LICENSED results are silently
 * skipped (ADR-10: a normal result, not an error), so this reads as "whatever's
 * actually licensed for this business," never a wall of "not available" lines.
 * `only` narrows to a single module (the "cater to the selected module" path); omitted
 * entirely, every module runs (the "consult all modules" checkbox path) -- both cases
 * run in parallel, not sequentially, so opting into "all modules" costs one round of
 * concurrent reads, not four serial ones.
 */
async function buildOtherModuleSummaries(businessId: string, only?: ModuleKey): Promise<string[]> {
  const keys = (only && only !== "discovery" ? [only] : (Object.keys(OTHER_MODULE_SUMMARIES) as (keyof typeof OTHER_MODULE_SUMMARIES)[]));
  const results = await Promise.all(
    keys.map(async (key) => {
      const result = await OTHER_MODULE_SUMMARIES[key](businessId);
      return result.ok ? result.data! : null;
    }),
  );
  return results.filter((line): line is string => line !== null);
}

type ResolvedChatContext = {
  /** Workspace to attribute the ai_runs cost-ledger entry, usage-limit check, and
   * persisted chat history to. Set to the current business's own first workspace when
   * only a business is in view (null there only if that business has no products yet --
   * see getFirstWorkspaceForBusiness), and null when there's no business/product context
   * at all (e.g. the founder is on /dashboard). Either null case falls back to the
   * account's first workspace overall (see sendChatMessage/getChatPanelData). */
  workspace: Workspace | null;
  /** The business this conversation is scoped to, if any -- what buildOtherModuleSummaries
   * needs; distinct from `workspace` (discovery-specific) since a business can have
   * other modules licensed with no discovery workspace opinion either way. */
  businessId: string | null;
  contextText: string;
  starterQuestions: string[];
};

function buildStarterQuestions(input: {
  productName: string;
  hasProfile: boolean;
  hasIcp: boolean;
  totalProspects: number;
  needsActionCount: number;
}): string[] {
  const { productName, hasProfile, hasIcp, totalProspects, needsActionCount } = input;
  const questions: string[] = [];

  if (!hasProfile) {
    questions.push(`How do I generate an offering profile for ${productName}?`);
  } else if (!hasIcp) {
    questions.push(`How do I define an ICP for ${productName}?`);
  } else if (totalProspects === 0) {
    questions.push(`How do I find my first prospects for ${productName}?`);
  } else if (needsActionCount > 0) {
    questions.push(
      `What should I do next with the ${needsActionCount} prospect${needsActionCount === 1 ? "" : "s"} that need action?`,
    );
  }

  questions.push("How can I improve my outreach messaging?");
  questions.push("What's a good way to prioritize my prospects?");

  return questions.slice(0, 3);
}

/**
 * One-paragraph account overview -- every business, its products, and a total prospect
 * count -- so the assistant can answer questions that span beyond whatever page the
 * founder happens to be on (e.g. "which of my businesses needs attention?" asked from
 * /dashboard). Built from the same batched helpers the dashboard uses
 * (listWorkspacesForProducts, getProspectCountsForWorkspaces): one query per table for
 * the whole account rather than one per business/product, which is what keeps this cheap
 * enough to compute on every chat turn instead of needing a separate cache layer.
 * getCurrentAccount/listBusinesses/listProducts are already React cache()-wrapped, so
 * calling them again here costs nothing extra when the current-context branch below also
 * ends up calling them in the same request.
 */
type AccountSummary = {
  text: string;
  /** "name": basePath for every product on the account (capped) -- lets the no-selection
   * branch of resolveChatContext point at any product's pages, not just whichever one
   * happens to be in view. */
  productPortalLines: string[];
};

async function buildAccountSummary(accountId: string): Promise<AccountSummary> {
  const businesses = await listBusinesses(accountId);
  if (businesses.length === 0) {
    return { text: "The founder has no businesses set up yet.", productPortalLines: [] };
  }

  const productLists = await Promise.all(businesses.map((b) => listProducts(b.id)));
  const allProducts = productLists.flat();
  const workspaces = await listWorkspacesForProducts(allProducts.map((p) => p.id));
  const countsByWorkspace = await getProspectCountsForWorkspaces(workspaces.map((w) => w.id));
  const totalProspects = Object.values(countsByWorkspace).reduce((sum, c) => sum + c.total, 0);

  const businessLines = businesses.slice(0, 10).map((business, i) => {
    const products = productLists[i]!;
    const productNames = products.length > 0 ? products.map((p) => p.name).join(", ") : "none yet";
    return `- "${business.name}": products: ${productNames}`;
  });

  const productPortalLines = businesses
    .flatMap((business, i) => productLists[i]!.map((p) => ({ business, product: p })))
    .slice(0, 10)
    .map(({ business, product }) => `"${product.name}": ${productPortalPath(business.id, product.id)}`);

  return {
    text: [
      `Account overview: ${businesses.length} business${businesses.length === 1 ? "" : "es"}, ` +
        `${allProducts.length} product${allProducts.length === 1 ? "" : "s"} total, ` +
        `${totalProspects} prospect${totalProspects === 1 ? "" : "s"} across the account.`,
      ...businessLines,
    ].join("\n"),
    productPortalLines,
  };
}

/** The system prompt (prompts/chat/chat_v1.ts) tells the model a product's other pages
 * are this base path plus /icp, /prospects, /conversions, or /usage, so every branch
 * below only needs to supply this one path per product rather than every sub-page link
 * spelled out -- which is what let the model fall back to a dashboard/business link when
 * the founder asked for, say, a prospects page for a product that wasn't the one
 * currently in view: that product's sub-pages simply weren't in the context at all. */
function productPortalPath(businessSlug: string, productId: string): string {
  return `/${businessSlug}/discovery/offerings/${productId}`;
}

/**
 * Turns the current page context into a short grounding summary plus a handful of
 * deterministic (no LLM call -- CLAUDE.md principle 4) starter questions reflecting
 * where the founder actually is in their pipeline. businessId/productId come from the
 * client, but every lookup runs through the RLS-scoped Supabase client (lib/tenancy
 * queries), so a business/product the account doesn't own resolves to null exactly like
 * everywhere else in the app -- no separate authorization check needed here.
 *
 * Deliberately does NOT compute the account-wide overview (buildAccountSummary) when a
 * specific business/product is already in view -- that used to run unconditionally on
 * every single call (both the panel-open path and every message send), scanning every
 * business/product/workspace on the account just to prepend one paragraph that's
 * usually irrelevant to a question about the product actually on screen. It's this
 * function's single most expensive step by far, which made both opening the chat panel
 * and every turn of a conversation slower than the handful of indexed lookups the
 * specific-context branches below actually need. The account-wide view is now opt-in:
 * automatic only when there's truly no business/product context (the fallback branch,
 * unchanged), and otherwise added by buildExtraContext() below only when the founder
 * has checked "consult all modules" -- i.e. paid for only when actually wanted.
 */
async function resolveChatContext(
  accountId: string,
  context: ChatPageContext,
): Promise<ResolvedChatContext> {
  if (context.productId) {
    const product = await getProduct(context.productId);
    if (product) {
      const [business, workspace, businessSlug] = await Promise.all([
        getBusiness(product.business_id),
        getWorkspaceForProduct(product.id),
        resolveBusinessSlugById(product.business_id),
      ]);
      if (business && workspace && businessSlug) {
        const [icp, prospects] = await Promise.all([
          getIcpProfile(workspace.id),
          listProspects(workspace.id),
        ]);
        const hasProfile = Boolean(product.product_profile);
        const hasIcp = Boolean(icp);
        const totalProspects = prospects.length;
        const needsActionCount = prospects.filter((p) => p.nextAction !== null).length;

        const contextText = [
          `Currently viewing:`,
          `Business: "${business.name}"`,
          `Product: "${product.name}"`,
          `Product profile: ${hasProfile ? "generated" : "not generated yet"}`,
          `ICP: ${hasIcp ? "defined" : "not defined yet"}`,
          `Prospects: ${totalProspects} total` +
            (totalProspects > 0 ? `, ${needsActionCount} need a next action` : ""),
          `Portal base path: ${productPortalPath(businessSlug, product.id)}`,
        ].join("\n");

        return {
          workspace,
          businessId: business.id,
          contextText,
          starterQuestions: buildStarterQuestions({
            productName: product.name,
            hasProfile,
            hasIcp,
            totalProspects,
            needsActionCount,
          }),
        };
      }
    }
  }

  if (context.businessSlug) {
    const businessId = await resolveBusinessIdBySlug(context.businessSlug);
    const business = businessId ? await getBusiness(businessId) : null;
    if (business) {
      const products = await listProducts(business.id);
      const contextText = [
        "Currently viewing:",
        `Business: "${business.name}"`,
        `Business portal page: /${context.businessSlug}`,
        products.length > 0
          ? [
              "Products under this business (portal base paths):",
              ...products.map(
                (p) => `"${p.name}": ${productPortalPath(context.businessSlug!, p.id)}`,
              ),
            ].join("\n")
          : "No products created yet for this business.",
      ].join("\n");

      return {
        // This business's own first workspace, not the account-wide fallback -- a chat
        // opened from this business's page must persist under a workspace that actually
        // belongs to it, never a different business's.
        workspace: await getFirstWorkspaceForBusiness(business.id),
        businessId: business.id,
        contextText,
        starterQuestions:
          products.length === 0
            ? [
                `How do I create my first product for ${business.name}?`,
                `How does ${BRAND_NAME} work?`,
              ]
            : [
                "Which of my products needs attention next?",
                "How can I improve my outreach messaging?",
              ],
      };
    }
  }

  const accountSummary = await buildAccountSummary(accountId);
  return {
    workspace: null,
    businessId: null,
    contextText: [
      accountSummary.text,
      "",
      "No specific business or product is currently selected.",
      ...(accountSummary.productPortalLines.length > 0
        ? [
            "Portal base paths for products across the account, in case the founder asks " +
              "for a specific one of these by name:",
            ...accountSummary.productPortalLines,
          ]
        : []),
    ].join("\n"),
    starterQuestions: [
      `How does ${BRAND_NAME} help me find customers?`,
      "What should I set up first?",
    ],
  };
}

/**
 * The module-aware layer resolveChatContext() deliberately no longer computes inline
 * (see that function's own doc comment) -- called once, right before the actual model
 * call in sendChatMessage(), never from the panel-open path, which has no use for it.
 *
 * - `moduleKey` set (and not "discovery", which already has its own full context above)
 *   and `consultAllModules` false: appends just that one module's own summary --
 *   "cater to the selected module."
 * - `consultAllModules` true: appends every licensed module's summary for the resolved
 *   business, PLUS the full account-wide overview (every business, not just this one)
 *   -- "a much more informed decision," at the cost of being the slowest path, which is
 *   exactly why it's the one the founder opts into rather than the default.
 * - Neither: returns "" -- the discovery-specific contextText already built stands on
 *   its own, no extra round trip.
 *
 * `businessId` (from ResolvedChatContext) is null on the "nothing selected" branch;
 * `consultAllModules` there falls back to the account's first business, same fallback
 * getFirstWorkspaceForAccount already uses for the workspace itself, so the checkbox
 * still does something useful even with no business page open.
 */
async function buildExtraContext(
  accountId: string,
  resolved: Pick<ResolvedChatContext, "businessId">,
  context: ChatPageContext,
): Promise<string> {
  if (!context.consultAllModules && (!context.moduleKey || context.moduleKey === "discovery")) {
    return "";
  }

  let businessId = resolved.businessId;
  if (!businessId && context.consultAllModules) {
    const businesses = await listBusinesses(accountId);
    businessId = businesses[0]?.id ?? null;
  }
  if (!businessId) return "";

  const moduleKey = context.consultAllModules ? undefined : (context.moduleKey as ModuleKey);
  const moduleSummaries = await buildOtherModuleSummaries(businessId, moduleKey);
  if (moduleSummaries.length === 0 && !context.consultAllModules) return "";

  const lines = ["", "Other modules for this business:", ...moduleSummaries];
  if (context.consultAllModules) {
    const accountSummary = await buildAccountSummary(accountId);
    lines.push("", accountSummary.text);
  }
  return lines.join("\n");
}

/**
 * Everything the chat panel needs to open against a business/product: persisted history
 * (supabase/migrations/20260906070000_chat_messages_schema.sql) for the same workspace
 * sendChatMessage would attribute a new turn to, plus deterministic starter questions for
 * when there isn't any yet. Combined into one call (rather than a separate
 * getChatHistory/getChatStarterQuestions pair, which is what this used to be) because
 * both need the exact same resolveChatContext() result -- calling it from two separate
 * server actions meant paying for buildAccountSummary's several queries twice on every
 * single panel open, which was the main reason opening the chat felt slow. `followUp` is
 * only the most recent assistant turn's, matching what the widget shows below the last
 * message.
 */
export async function getChatPanelData(context: ChatPageContext): Promise<{
  messages: ChatMessage[];
  followUp: string | null;
  starterQuestions: string[];
}> {
  const account = await getCurrentAccount();
  if (!account) return { messages: [], followUp: null, starterQuestions: [] };

  const resolved = await resolveChatContext(account.id, context);
  const workspace = resolved.workspace ?? (await getFirstWorkspaceForAccount(account.id));
  if (!workspace) {
    return { messages: [], followUp: null, starterQuestions: resolved.starterQuestions };
  }

  const history = await listChatMessages(workspace.id);
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
  return {
    messages: history.map(({ role, content }) => ({ role, content })),
    followUp: lastAssistant?.followUp ?? null,
    starterQuestions: resolved.starterQuestions,
  };
}

/**
 * Header AI assistant (docs item: navbar chat icon) -- grounded in whatever
 * business/product the founder currently has in view. Credential lookup is inherently
 * account-scoped (lib/ai/router.ts); when the page context has no workspace (e.g. the
 * founder is on /dashboard), the account's first workspace is used purely to attribute
 * the ai_runs cost-ledger entry, usage-limit check, and now the persisted chat history
 * too, so all three stay consistent about which workspace "this conversation" belongs to.
 * `messages` is the full transcript the client is holding (including whatever
 * getChatPanelData returned it originally) with exactly one new user turn appended --
 * only that new turn and the assistant's reply get written here, never the whole array,
 * or reloading history and sending a reply would double up every prior turn.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  context: ChatPageContext,
): Promise<ChatReply> {
  const account = await getCurrentAccount();
  if (!account) {
    throw new AiProviderError("no_provider_connected", "Sign in to use the assistant.");
  }

  const resolved = await resolveChatContext(account.id, context);
  const workspace = resolved.workspace ?? (await getFirstWorkspaceForAccount(account.id));
  if (!workspace) {
    throw new AiProviderError(
      "no_provider_connected",
      "Create a business and product before using the assistant.",
    );
  }

  await assertWithinUsageLimit(workspace.id);

  // Only the new user turn is taken from the client. The history the model sees is
  // re-read from what this server stored, so a caller can't put words in the
  // assistant's mouth (forged "assistant" turns are a prompt-injection route).
  const newUserMessage = messages[messages.length - 1];
  if (newUserMessage?.role !== "user" || typeof newUserMessage.content !== "string" || !newUserMessage.content.trim()) {
    throw new AiProviderError("unknown", "Type a question for the assistant.");
  }
  await appendChatMessage(workspace.id, { role: "user", content: newUserMessage.content });

  // The one place buildExtraContext() runs -- module/all-modules grounding is worth
  // however long it takes here (a real model call is about to happen regardless), but
  // has no business slowing down the panel-open path above, which never reaches this
  // function at all.
  const extraContext = await buildExtraContext(account.id, resolved, context);
  const fullContextText = resolved.contextText + extraContext;

  const trimmed = (await listChatMessages(workspace.id))
    .map(({ role, content }) => ({ role, content }))
    .slice(-MAX_HISTORY_MESSAGES);
  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({
    messages: trimmed,
    contextText: fullContextText,
    version: CHAT_PROMPT_VERSION,
    model: modelId,
  });

  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: ChatResponseSchema,
      system: chatSystemPrompt(fullContextText),
      messages: trimmed as ModelMessage[],
    });

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: CHAT_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    const followUp = response.object.followUp || null;
    await appendChatMessage(workspace.id, {
      role: "assistant",
      content: response.object.answer,
      followUp,
    });

    return { answer: response.object.answer, followUp };
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: CHAT_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}

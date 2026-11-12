import { generateObject } from "ai";
import { z } from "zod";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { hashInput } from "../ai/hash";
import { hasRecentSuccess } from "../ai/dedup";
import { resolveAiModel, toAiProviderError } from "../ai/router";
import { recordAiRun } from "../ai/usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { getIcpProfile } from "../icp/queries";
import { idealUserContent, readIdealUser } from "../icp/audience";
import { getProspect } from "../prospects/queries";
import { getBusiness, getProduct, getWorkspace } from "../tenancy/queries";
import { createContent, transitionContent } from "../marketing/mutations";
import { safeHttpUrl } from "../data-sources/suggestions";
import {
  CHANNEL_DRAFT_VARIANTS,
  WRITE_CHANNEL_DRAFT_PROMPT_VERSION,
  writeChannelDraftPrompt,
  type ChannelDraftVariant,
} from "../../prompts/outreach/write_channel_draft_v1";

/**
 * DISC-CONS-P0-02.2: the three drafts on a channel prospect, and "Mark as posted".
 *
 * Through the existing message generation (its operation, usage limit and ledger), with
 * a new prompt variant each:
 *  - "pitch": a partnership or feature pitch to the channel's owner, and
 *  - "sponsorship": a sponsorship or listing enquiry. Both are saved as draft messages
 *    (discovery.messages), the same drafts the Messages section lists;
 *  - "post": a community post the person publishes themselves, saved as marketing
 *    content (discovery.marketing_content, type 'social') tied to the prospect, its
 *    first version marked 'ai_generated'.
 *
 * WonderArk never posts to a community, group or channel. A post is only ever copied by
 * the person; "Mark as posted" records the link they paste back (as the content's
 * external_url) and publishes the record, through the content lifecycle's own checks,
 * permission and audit log. What this code decides, not the model: the prospect is a
 * channel of the caller's offering (RLS and the licence), the draft has a title and a
 * body within limits and holds no link or address, and nothing is sent.
 */

export const OPERATION = "generate_outreach_message";
export { CHANNEL_DRAFT_VARIANTS, type ChannelDraftVariant };

export const CHANNEL_DRAFT_LABEL: Record<ChannelDraftVariant, string> = {
  pitch: "Partnership pitch to the owner",
  sponsorship: "Sponsorship or listing enquiry",
  post: "Community post",
};

const ChannelDraftSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(2_500),
});

const LINK_OR_ADDRESS = /(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+)/i;

/** Code's check on a draft before it is stored. Null when it may be kept. */
export function refuseDraft(draft: { subject: string; body: string }): string | null {
  if (!draft.subject.trim() || !draft.body.trim()) return "The draft came back empty.";
  if (LINK_OR_ADDRESS.test(draft.subject) || LINK_OR_ADDRESS.test(draft.body)) {
    return "The draft contained a link or an address, so it was not saved.";
  }
  if (/[{[]{1,2}\s*\w+\s*[}\]]{1,2}/.test(draft.body)) return "The draft contained a placeholder, so it was not saved.";
  return null;
}

export type ChannelDraftOutcome =
  | { status: "completed"; variant: ChannelDraftVariant; id: string }
  /** The same draft was written from the same input moments ago (a double click). */
  | { status: "duplicate"; variant: ChannelDraftVariant }
  | { status: "failed"; message: string };

export function isChannelDraftVariant(value: string): value is ChannelDraftVariant {
  return (CHANNEL_DRAFT_VARIANTS as readonly string[]).includes(value);
}

/**
 * Writes one draft for a channel prospect. Expected refusals (not a channel, a draft
 * code refused) come back as `failed`; a licence, usage-limit or provider failure is
 * thrown for the caller's error handling, after the provider failure is recorded.
 */
export async function generateChannelDraft(prospectId: string, variant: ChannelDraftVariant): Promise<ChannelDraftOutcome> {
  if (!isChannelDraftVariant(variant)) return { status: "failed", message: "Choose which draft to write." };
  const prospect = await getProspect(prospectId);
  if (!prospect) return { status: "failed", message: "Prospect not found." };
  if (prospect.kind !== "channel") return { status: "failed", message: "These drafts are for channels." };

  const workspace = await getWorkspace(prospect.workspace_id);
  if (!workspace) return { status: "failed", message: "Workspace not found." };
  const product = await getProduct(workspace.product_id);
  if (!product) return { status: "failed", message: "Offering not found." };
  await requireModule(product.business_id, "discovery");
  if (!product.product_profile) return { status: "failed", message: "Generate an offering profile first." };

  const [business, icp] = await Promise.all([getBusiness(product.business_id), getIcpProfile(workspace.id)]);

  await assertWithinUsageLimit(workspace.id);

  const prompt = writeChannelDraftPrompt({
    variant,
    offeringName: product.name,
    businessName: business?.name ?? product.name,
    offeringProfile: product.product_profile,
    idealUser: idealUserContent(readIdealUser(icp?.audience)),
    channel: {
      name: prospect.company_name,
      channelType: prospect.channel_type ?? null,
      topics: (prospect.industry ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      description: prospect.description,
      audienceSize: prospect.audience_size ?? null,
    },
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({ prompt, version: WRITE_CHANNEL_DRAFT_PROMPT_VERSION, model: modelId, prospectId });
  if (await hasRecentSuccess(workspace.id, OPERATION, inputHash, undefined, modelId)) {
    return { status: "duplicate", variant };
  }

  const startedAt = Date.now();
  let draft: z.infer<typeof ChannelDraftSchema>;
  try {
    const response = await generateObject({ model, schema: ChannelDraftSchema, prompt });
    draft = response.object;
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: WRITE_CHANNEL_DRAFT_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: WRITE_CHANNEL_DRAFT_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }

  const refusal = refuseDraft(draft);
  if (refusal) return { status: "failed", message: refusal };
  const subject = draft.subject.trim();
  const body = draft.body.trim();

  if (variant === "post") {
    const id = await createContent(
      product.business_id,
      {
        title: `${subject} (${prospect.company_name})`.slice(0, 300),
        contentType: "social",
        offeringId: product.id,
        campaignId: null,
        brief: null,
        body,
        summary: null,
        audience: null,
        channel: null,
        cta: null,
        seoTitle: null,
        seoDescription: null,
      },
      "ai_generated",
      { prospect_id: prospect.id, prompt_version: WRITE_CHANNEL_DRAFT_PROMPT_VERSION, input_hash: inputHash },
      { prospectId: prospect.id },
    );
    return { status: "completed", variant, id };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      workspace_id: workspace.id,
      prospect_id: prospect.id,
      contact_id: null,
      channel: "email",
      direction: "outbound",
      status: "draft",
      subject,
      content: body,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { status: "completed", variant, id: data.id as string };
}

export type ChannelPost = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  external_url: string | null;
  published_at: string | null;
  created_at: string;
  /** From the first version's origin: what wrote it. */
  origin: string;
};

/** The community posts drafted for one channel prospect, newest first. */
export async function listChannelPosts(businessId: string, prospectId: string): Promise<ChannelPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_content")
    .select("id, title, body, status, external_url, published_at, created_at")
    .eq("business_id", businessId)
    .eq("prospect_id", prospectId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: versions, error: versionError } = await supabase
    .from("marketing_content_versions")
    .select("content_id, origin, version_number")
    .eq("business_id", businessId)
    .in("content_id", rows.map((row) => row.id))
    .order("version_number", { ascending: false });
  if (versionError) throw versionError;
  // The newest version says whether what is there now was written by AI or edited.
  const latestOrigin = new Map<string, string>();
  for (const version of versions ?? []) {
    if (!latestOrigin.has(version.content_id as string)) latestOrigin.set(version.content_id as string, version.origin as string);
  }
  return rows.map((row) => ({ ...(row as Omit<ChannelPost, "origin">), origin: latestOrigin.get(row.id as string) ?? "user" }));
}

/**
 * "Mark as posted": records that the person published the post themselves, at the link
 * they pasted. WonderArk posts nothing; this only moves the content record to published
 * through the lifecycle's own transitions (approve, then publish), which check the
 * approver's permission and write the audit log. A second press finds it published and
 * changes nothing.
 */
export async function markChannelPostPosted(
  businessId: string,
  contentId: string,
  link: string,
): Promise<{ status: "completed" | "failed"; message: string }> {
  const url = safeHttpUrl(link);
  if (!url) return { status: "failed", message: "Paste the link to your post (starting with https://)." };
  const supabase = await createClient();
  const { data: content, error } = await supabase
    .from("marketing_content")
    .select("status, prospect_id")
    .eq("business_id", businessId)
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw error;
  if (!content || !content.prospect_id) return { status: "failed", message: "That post no longer exists." };
  if (content.status === "published") return { status: "completed", message: "Already marked as posted." };
  // The lifecycle's own path: draft -> review -> approved -> published.
  const path: Record<string, ("review" | "approved" | "published")[]> = {
    idea: [],
    draft: ["review", "approved", "published"],
    review: ["approved", "published"],
    approved: ["published"],
    scheduled: ["published"],
  };
  const steps = path[content.status as string];
  if (!steps || steps.length === 0) return { status: "failed", message: "This post can't be marked as posted from its current state." };
  for (const step of steps) {
    await transitionContent(businessId, contentId, step, step === "published" ? { externalUrl: url } : {});
  }
  return { status: "completed", message: "Marked as posted." };
}

import { createHash } from "node:crypto";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { MODULE_VIEW_PERMISSION } from "@cofounderai/core/rbac/module-permissions";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { getOrCreateConversation, logInboundReply } from "../conversations/mutations";
import { approveMessage, markMessageSent } from "../messages/mutations";
import { getMessage, listDirectDrafts } from "../messages/queries";
import { getProspect, listProspects } from "../prospects/queries";
import { getBusinessIdForWorkspace, listProducts, listWorkspacesForProducts } from "../tenancy/queries";

/**
 * DISC-IG-P0-01.2: what the WonderArk Instagram helper (the browser extension in
 * `extensions/instagram-helper`) may read and record. Owner-approved on 2026-11-28 with one
 * hard limit: the helper fills a drafted message into Instagram and the person presses
 * Send; nothing here, and nothing in the extension, sends, follows or browses for them.
 *
 * Everything runs under the signed-in person's own session, so RLS scopes every read and
 * write to the businesses they belong to and that have Discovery licensed; the licence and
 * the module's view permission are also checked here, because `/api/*` is outside the page
 * guard. The helper is told only what it needs to fill a message: the prospect's name, its
 * Instagram handle and the drafted text. A reply it saves is the prospect's words: data,
 * stored as an inbound message, never instructions.
 */

export type HelperItem = {
  /** "first": the first message to a prospect. "reply": the drafted answer to their reply. */
  kind: "first" | "reply";
  messageId: string;
  prospectId: string;
  name: string;
  handle: string;
  text: string;
};
export type HelperQueue = {
  offerings: { offeringId: string; offeringName: string; businessName: string; items: HelperItem[] }[];
  /** Every approved prospect reachable on Instagram, so the helper can tell whose chat is open. */
  prospects: { prospectId: string; name: string; handle: string; offeringId: string }[];
};

/** "https://www.instagram.com/weekview/?hl=en" -> "weekview"; null unless it is a plain
 * Instagram profile address. The same rule as the extension's own (`lib.js`). */
export function instagramHandleOf(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)instagram\.com$/.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    const handle = parts[0]!.toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null;
  } catch {
    return null;
  }
}

/** Licensed, and the person's role opens Discovery. A refusal is a normal answer (ADR-10). */
async function mayUseDiscovery(businessId: string): Promise<boolean> {
  try {
    await requireModule(businessId, "discovery");
  } catch {
    return false;
  }
  return hasPermission(businessId, MODULE_VIEW_PERMISSION.discovery!);
}

/** The Instagram messages waiting to be sent, for every offering the person can work on. */
export async function listHelperQueue(): Promise<HelperQueue> {
  const core = await createCoreClient({ schema: "core" });
  const { data: businesses, error } = await core.from("businesses").select("id, name").eq("status", "active").is("disabled_at", null).order("created_at");
  if (error) throw error;

  const queue: HelperQueue = { offerings: [], prospects: [] };
  for (const business of businesses ?? []) {
    if (!(await mayUseDiscovery(business.id as string))) continue;
    const offerings = (await listProducts(business.id as string)).filter((offering) => offering.status !== "archived");
    const workspaces = await listWorkspacesForProducts(offerings.map((offering) => offering.id));
    for (const offering of offerings) {
      const workspace = workspaces.find((w) => w.product_id === offering.id);
      if (!workspace) continue;
      const onInstagram = (await listProspects(workspace.id, { shortlisted: true }))
        .map((prospect) => ({ prospect, handle: prospect.dmPlatform === "instagram" ? instagramHandleOf(prospect.source_ref) : null }))
        .filter((entry): entry is { prospect: (typeof entry)["prospect"]; handle: string } => entry.handle !== null);
      if (onInstagram.length === 0) continue;
      for (const { prospect, handle } of onInstagram) {
        queue.prospects.push({ prospectId: prospect.id, name: prospect.company_name, handle, offeringId: offering.id });
      }
      const drafts = (await listDirectDrafts(workspace.id, onInstagram.map(({ prospect }) => prospect.id))).filter((draft) => draft.channel === "instagram");
      const items: HelperItem[] = drafts.flatMap((draft) => {
        const entry = onInstagram.find(({ prospect }) => prospect.id === draft.prospect_id);
        if (!entry) return [];
        return [{ kind: draft.conversation_id ? ("reply" as const) : ("first" as const), messageId: draft.id, prospectId: entry.prospect.id, name: entry.prospect.company_name, handle: entry.handle, text: draft.content }];
      });
      queue.offerings.push({ offeringId: offering.id, offeringName: offering.name, businessName: business.name as string, items });
    }
  }
  return queue;
}

export type HelperOutcome<T extends string> = { ok: true; status: T } | { ok: false; code: 403 | 404 | 409; error: string };

/**
 * Records that the person sent this Instagram message themselves. Safe to repeat: a message
 * already marked sent stays as it is (its time and its conversation are not touched again).
 */
export async function markHelperMessageSent(messageId: string): Promise<HelperOutcome<"sent" | "already_sent">> {
  const message = await getMessage(messageId);
  // RLS returns nothing for another business's message: the same answer as one that doesn't exist.
  if (!message || message.direction !== "outbound") return { ok: false, code: 404, error: "Message not found." };
  if (message.channel !== "instagram") return { ok: false, code: 409, error: "This is not an Instagram message." };
  const businessId = await getBusinessIdForWorkspace(message.workspace_id);
  if (!businessId || !(await mayUseDiscovery(businessId))) return { ok: false, code: 403, error: "Discovery is not available for this business." };
  if (message.status === "sent") return { ok: true, status: "already_sent" };
  if (message.status === "draft") await approveMessage(messageId);
  await markMessageSent(messageId);
  return { ok: true, status: "sent" };
}

export const MAX_REPLY_LENGTH = 4000;

/**
 * Saves a prospect's Instagram reply, as the person saw it and chose to save it. Stored as
 * an inbound message on the prospect's Instagram conversation, which is what lets WonderArk
 * draft the answer. The same words for the same prospect on the same day are saved once.
 */
export async function saveHelperReply(prospectId: string, text: string): Promise<HelperOutcome<"saved" | "duplicate">> {
  const content = text.trim();
  if (!content) return { ok: false, code: 409, error: "There is no reply text to save." };
  if (content.length > MAX_REPLY_LENGTH) return { ok: false, code: 409, error: `A reply can be at most ${MAX_REPLY_LENGTH} characters.` };
  const prospect = await getProspect(prospectId);
  if (!prospect) return { ok: false, code: 404, error: "Prospect not found." };
  if (!instagramHandleOf(prospect.source_ref)) return { ok: false, code: 409, error: "This prospect is not on Instagram." };
  const businessId = await getBusinessIdForWorkspace(prospect.workspace_id);
  if (!businessId || !(await mayUseDiscovery(businessId))) return { ok: false, code: 403, error: "Discovery is not available for this business." };

  const day = new Date().toISOString().slice(0, 10);
  const key = `ig:${createHash("sha256").update(`${prospect.id}\0${content}\0${day}`).digest("hex")}`;
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("messages")
    .select("id")
    .eq("workspace_id", prospect.workspace_id)
    .eq("direction", "inbound")
    .eq("provider_message_id", key)
    .maybeSingle();
  if (error) throw error;
  if (existing) return { ok: true, status: "duplicate" };

  const conversation = await getOrCreateConversation(prospect.workspace_id, prospect.id, null, "instagram");
  try {
    await logInboundReply(conversation.id, content, { providerMessageId: key });
  } catch (cause) {
    // Two saves at once: the unique index kept one.
    if ((cause as { code?: string } | null)?.code === "23505") return { ok: true, status: "duplicate" };
    throw cause;
  }
  return { ok: true, status: "saved" };
}

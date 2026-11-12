import { generateIcp } from "../ai/generate-icp";
import { discoverProspects } from "../ai/discover-prospects";
import { researchProspect } from "../ai/research-prospect";
import { generateOutreachStrategy } from "../ai/generate-strategy";
import { generateOutreachMessage } from "../ai/generate-message";
import { scoreProspect } from "../scoring/score-prospect";
import { approveIcpProfile } from "../icp/mutations";
import { getIcpProfile } from "../icp/queries";
import { approveSuggestionsAndQueueEnrichment } from "../data-sources/approval";
import { getMostRecentProspect } from "../prospects/queries";
import { approveOutreachStrategy } from "../outreach/mutations";
import { getWorkspaceForProduct } from "../tenancy/queries";
import { getAiApprovalModeForWorkspace } from "./queries";

/**
 * The Prospects step's result, carried to the Prospects page as `?autopopulated=<value>`:
 * a count of prospects added ("Approve automatically"), or, in "Review each step", what
 * is now waiting for the founder -- the draft ICP (nothing can be searched until it's
 * approved) or the found accounts, kept as suggestions on the Discover page.
 */
export type AutoPopulateProspectsResult = number | "icp_review" | "suggestions_review";

/**
 * DISC-AI-APPROVAL-01: the ICP step of "Let AI Auto-Populate Info". Always generates a
 * fresh ICP; approves it only when the business chose "Approve automatically". In
 * "Review each step" it stays a draft version for the founder to approve on the ICP page.
 */
export async function autoPopulateIcp(productId: string): Promise<void> {
  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) throw new Error("Workspace not found for this offering.");
  const mode = await getAiApprovalModeForWorkspace(workspace.id);
  const icp = await generateIcp(productId, { force: true });
  if (mode === "auto" && icp.status !== "approved") await approveIcpProfile(icp.id);
}

/**
 * DISC-AI-APPROVAL-01: the Prospects step of "Let AI Auto-Populate Info" -- searches for
 * exactly one matching company (a first setup costs one company's worth of search).
 *
 * "Approve automatically" (the behaviour before this story): the suggestion is approved
 * into a real prospect and carried through Research -> Score -> Strategy (approved) ->
 * Message (a draft; nothing is ever sent). Best-effort past the prospect's own creation:
 * a failure in that chain leaves the founder on a real prospect with those sections left
 * for a manual retry.
 *
 * "Review each step": nothing is approved. With the ICP still a draft there is nothing to
 * search against yet (`discoverProspects` needs an approved ICP), so no AI call is made;
 * with an approved ICP, the one company found stays a suggestion on the Discover page.
 */
export async function autoDiscoverOneProspect(workspaceId: string): Promise<AutoPopulateProspectsResult> {
  const mode = await getAiApprovalModeForWorkspace(workspaceId);

  if (mode === "review") {
    const icp = await getIcpProfile(workspaceId);
    if (!icp || icp.status !== "approved") return "icp_review";
    const suggestions = await discoverProspects(workspaceId, undefined, 1);
    return suggestions.length > 0 ? "suggestions_review" : 0;
  }

  const suggestions = await discoverProspects(workspaceId, undefined, 1);
  if (suggestions.length === 0) return 0;
  // DISC-DATA-P0-04.1: queues the company's free lookup of its missing details, as every
  // other approval does.
  const { added } = await approveSuggestionsAndQueueEnrichment(workspaceId, suggestions.map((s) => s.id));

  if (added > 0) {
    const prospect = await getMostRecentProspect(workspaceId);
    if (prospect) {
      try {
        await researchProspect(prospect.id);
        await scoreProspect(prospect.id);
        const strategy = await generateOutreachStrategy(prospect.id, null);
        await approveOutreachStrategy(strategy.id);
        await generateOutreachMessage(strategy.id);
      } catch (err) {
        console.error("[ai-approval/auto-populate] research/score/strategy/message chain failed:", err);
      }
    }
  }
  return added;
}

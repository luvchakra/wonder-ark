import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";

/**
 * DISC-AUTO-P0-03.1: the business's "Send automatically" setting (owner-approved
 * 2026-11-22, opt-in, off by default). Read fails closed: if it can't be read, nothing is
 * sent on its own. Changing it needs `business.settings.manage`, checked here and by RLS;
 * the database trigger `business_settings_log_discovery_auto_send` audits every change.
 */
export const AUTO_SEND_PERMISSION = "business.settings.manage";

export async function getAutoSend(businessId: string): Promise<boolean> {
  try {
    const core = await createCoreClient({ schema: "core" });
    const { data, error } = await core.from("business_settings").select("discovery_auto_send").eq("business_id", businessId).maybeSingle();
    if (error) return false;
    return data?.discovery_auto_send === true;
  } catch {
    return false;
  }
}

export async function setAutoSend(businessId: string, on: boolean): Promise<void> {
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, AUTO_SEND_PERMISSION);
  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core.from("business_settings").update({ discovery_auto_send: on }).eq("business_id", businessId).select("business_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("This setting could not be saved for this business.");
}

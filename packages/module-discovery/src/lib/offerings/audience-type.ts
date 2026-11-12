import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { AUDIENCE_TYPES, type AudienceType } from "../icp/audience";

/**
 * DISC-CONS-P0-01.1: saves the answer to "Who buys this?" and records that a person
 * gave it. The value is checked against the closed list here and by the column's own
 * check; the business is read from the offering on the server, its Discovery licence is
 * required, and the write goes through the caller's RLS-bound client.
 */
export async function setAudienceType(productId: string, value: string): Promise<AudienceType> {
  if (!(AUDIENCE_TYPES as readonly string[]).includes(value)) {
    throw new Error("Choose who buys this offering.");
  }
  const supabase = await createClient();
  const { data: product, error: readError } = await supabase
    .from("products")
    .select("id, business_id")
    .eq("id", productId)
    .maybeSingle();
  if (readError) throw readError;
  if (!product) throw new Error("Offering not found.");
  await requireModule(product.business_id as string, "discovery");

  const { error } = await supabase
    .from("products")
    .update({ audience_type: value, audience_confirmed_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw error;
  return value as AudienceType;
}

import type { ProductProfile } from "../ai/schemas";
import type { RediscoveryInterval } from "./rediscovery";

export type Account = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type AccountRole = "owner" | "admin" | "member";

export type Business = {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  /** PLATFORM-P1-12.2: contact details a customer reply may quote; null when not recorded. */
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  opening_hours: string | null;
  /** Public URL in the `business-logos` storage bucket; null until one is uploaded. */
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
};

/** DISC-OFFER-P0-01.1: the primary unit of Discovery is moving from Product to Business
 * Offering -- see `lib/offerings/types.ts` for the "Offering" vocabulary this same row
 * is exposed under going forward. Kept as a flat union (not an enum table) since it's a
 * fixed, small, rarely-changing vocabulary -- the same reasoning `AssessmentRequirement`
 * etc. use elsewhere in this codebase. */
export type OfferingType =
  | "product"
  | "service"
  | "subscription"
  | "consulting"
  | "professional_service"
  | "maintenance"
  | "training"
  | "package"
  | "solution"
  | "other";

export type Product = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  website: string | null;
  /** DISC-OFFER-P0-01.1 widens this from a binary active/archived to a real third
   * "inactive" state -- `disableProduct()`/`enableProduct()` still only ever write
   * active/archived (unchanged by this story); DISC-OFFER-P0-01.3's own CRUD UI is what
   * introduces a real deactivate action that writes 'inactive'. */
  status: "active" | "inactive" | "archived";
  /** core.items row this product mirrors to/from (supabase/migrations/
   * 20260910090000_discovery_products_inventory_item_link.sql) -- null until Inventory
   * is licensed and the mirror succeeds, or for a product created before this existed. */
  linked_item_id: string | null;
  product_profile: ProductProfile | null;
  product_profile_generated_at: string | null;
  /** DISC-OFFER-P0-01.1's new Offering fields -- all nullable, all additive. Existing
   * rows (and every pre-existing caller that doesn't know about them) are unaffected. */
  category: string | null;
  offering_type: OfferingType | null;
  value_proposition: string | null;
  primary_problem: string | null;
  target_market: string | null;
  detailed_description: string | null;
  /** DISC-DATA-P0-01.1 / DISC-CONS-P0-01.1: who buys it ('business' | 'consumer' |
   * 'both'), and when a person last confirmed that answer (null: never). Optional for a
   * row read before the columns existed; read through `audienceTypeOf`. */
  audience_type?: string;
  audience_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Workspace = {
  id: string;
  product_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  /** DISC-OFFER-P1-01.1's own "Scheduled Offering Re-Discovery" -- see
   * `lib/tenancy/rediscovery.ts` for the vocabulary and the deterministic date math over
   * these two fields. `next_discovery_at` is null both when scheduling is off and, once
   * a run actually completes, kept rolling forward from that completion time (see
   * `completePipelineRun`) -- it is never a one-time value that silently goes stale. */
  rediscovery_interval: RediscoveryInterval;
  next_discovery_at: string | null;
  /** DISC-OFFER-P1 §7-01.1 "Saved Offering Discovery" -- the criteria bundle that
   * narrows which discovery results actually matter for this offering. See
   * `lib/tenancy/discovery-criteria.ts` for the pure matching logic; empty arrays and a
   * `null` score floor both mean "no filter set," never "matches nothing." */
  discovery_min_score: number | null;
  discovery_geography_filter: string[];
  discovery_industries_filter: string[];
  discovery_buyer_roles_filter: string[];
  discovery_exclusions: string[];
};

/** Shared by every rename action (business, product) and the EditableName component
 * that submits to them. */
export type RenameActionState = { error: string } | { success: true } | null;

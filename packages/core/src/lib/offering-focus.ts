/**
 * DISC-OFFER-P0-03.1 "Offering Context Selector": which offering each business was last
 * worked in, so the rail's Acquisition section stays on it while the founder is
 * on a page that names no offering (see `buildDiscoveryNav`'s `rememberedOfferingId`).
 *
 * Client-only storage, the rail's established pattern (`nav-group-folds.ts`): a per-viewer
 * convenience, never a source of truth -- the URL always wins, and an unreadable or stale
 * value just falls back to the first offering.
 */
export const OFFERING_FOCUS_STORAGE_KEY = "cofounderai:discovery-offering-focus";

export type OfferingFocus = Record<string, string>;

export function parseOfferingFocus(value: unknown): OfferingFocus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: OfferingFocus = {};
  for (const [businessId, offeringId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof offeringId === "string" && offeringId) out[businessId] = offeringId;
  }
  return out;
}

export function readOfferingFocus(): OfferingFocus {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OFFERING_FOCUS_STORAGE_KEY);
    return raw ? parseOfferingFocus(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeOfferingFocus(focus: OfferingFocus): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OFFERING_FOCUS_STORAGE_KEY, JSON.stringify(focus));
  } catch {
    // Storage unavailable (private mode, quota) -- the rail just falls back to the first
    // offering, as for a first-time visitor.
  }
}

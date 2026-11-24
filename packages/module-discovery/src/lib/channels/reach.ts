/**
 * DISC-REACH-P0-01.1: how a prospect can actually be reached, worked out from what is
 * stored, never guessed. A message with nowhere to go is not "ready to send": To do says
 * what is missing instead (owner, 2026-11-23, after an email draft for an Instagram channel
 * that had no address).
 *
 *  - an unsent direct-message draft: that platform (the person sends it there themselves);
 *  - an unsent email draft and a contact with an email: email;
 *  - an unsent email draft and no address: "needs_email".
 *
 * Pure, so the list, To do, the preparation queue and the tests share it.
 */
export const DM_PLATFORMS = ["instagram", "facebook", "linkedin"] as const;
export type DmPlatform = (typeof DM_PLATFORMS)[number];

export const DM_LABEL: Record<DmPlatform | "whatsapp", string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

const HOSTS: [RegExp, DmPlatform][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook|fb)\.com$/, "facebook"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
];

/** The platform a profile link belongs to, when it is one a person can message on. */
export function dmPlatformOf(link: string | null | undefined): DmPlatform | null {
  if (!link) return null;
  let host: string;
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  return HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

export type Reach = "email" | "needs_email" | DmPlatform | "whatsapp";

export function reachOf(input: { unsent: { channel: string }[]; hasContactEmail: boolean }): Reach | null {
  if (input.unsent.length === 0) return null;
  const direct = input.unsent.find((m) => m.channel !== "email");
  if (direct) return direct.channel as Reach;
  return input.hasContactEmail ? "email" : "needs_email";
}

import { emailHash } from "@cofounderai/core/privacy/unsubscribe-token";
import type { Contact } from "../contacts/types";
import type { Prospect } from "../prospects/types";
import { GENERAL_SEGMENT, MAX_SEGMENTS, type CampaignAudience, type LeftOutReason } from "./types";

/**
 * DISC-CAMP-P0-02.1: who a campaign enrols. Pure and deterministic: given the
 * workspace's own prospects and contacts, it returns who is enrolled, at which address,
 * and, for everyone else, why not. No model decides any of it, and nobody is dropped
 * without a counted reason.
 *
 * Who is enrolled: a company (not a channel) marked qualified (or, when the campaign
 * says so, any company not marked disqualified), still open (not won or lost), not already in a campaign of this workspace, inside the campaign's own filter
 * (lines of work, minimum fit score), with an address that may be written to:
 *  - a contact a person typed in, unless its address was marked invalid, or marked risky
 *    or unverified while the campaign does not include those;
 *  - a contact a lookup found only when its address is an organisation's mailbox
 *    (info@, sales@ ...). A named person found by a lookup is never written to
 *    automatically; a person can still write to them one at a time;
 *  - otherwise the prospect's general company email;
 *  - never an address on the business's opt-out list.
 */

export type AudienceProspect = Pick<Prospect, "id" | "kind" | "status" | "outcome" | "fit_score" | "industry" | "company_email">;
export type AudienceContact = Pick<Contact, "id" | "prospect_id" | "email" | "status" | "email_status" | "source">;

export type Enrolee = {
  prospectId: string;
  contactId: string | null;
  recipient: "contact" | "company_email";
  /** The prospect's own line of work, normalised; which text it gets is decided later. */
  lineOfWork: string;
};

/** A prospect's line of work as a key: its `industry`, trimmed and lower-cased. A
 * prospect with none is in the general segment. */
export function lineOfWorkOf(industry: string | null | undefined): string {
  const key = (industry ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 200);
  return key || GENERAL_SEGMENT;
}

const ROLE_MAILBOXES = new Set([
  "info", "contact", "contactus", "hello", "hi", "sales", "enquiries", "enquiry", "inquiries", "inquiry", "office", "admin",
  "support", "help", "team", "mail", "marketing", "business", "bookings", "booking", "service", "services", "care", "reception",
  "accounts", "billing", "orders", "partnerships", "partners",
]);

/** Whether an address is an organisation's shared mailbox rather than a named person's. */
export function isOrganisationMailbox(email: string): boolean {
  const local = email.split("@")[0]?.trim().toLowerCase() ?? "";
  return ROLE_MAILBOXES.has(local.replace(/[._+-].*$/, "")) || ROLE_MAILBOXES.has(local);
}

type AddressVerdict = { ok: true } | { ok: false; reason: Extract<LeftOutReason, "invalid_email" | "unverified_email" | "sourced_person" | "suppressed"> };

function judgeContact(contact: AudienceContact, includeUnverified: boolean, suppressed: ReadonlySet<string>): AddressVerdict {
  const email = contact.email!.trim();
  if (suppressed.has(emailHash(email))) return { ok: false, reason: "suppressed" };
  if (contact.email_status === "invalid") return { ok: false, reason: "invalid_email" };
  if ((contact.email_status === "risky" || contact.email_status === "unverified") && !includeUnverified) {
    return { ok: false, reason: "unverified_email" };
  }
  if (contact.source && !isOrganisationMailbox(email)) return { ok: false, reason: "sourced_person" };
  return { ok: true };
}

/** The most specific reason wins when every address of a prospect was turned away. */
const REASON_RANK: LeftOutReason[] = ["suppressed", "invalid_email", "unverified_email", "sourced_person", "no_email"];

export function selectAudience(input: {
  prospects: AudienceProspect[];
  contacts: AudienceContact[];
  /** Prospects with an enrollment in any campaign of this workspace. */
  alreadyEnrolled: ReadonlySet<string>;
  /** `core.email_hash` values on the business's opt-out list. */
  suppressed: ReadonlySet<string>;
  audience: CampaignAudience;
  includeUnverified: boolean;
}): { enrol: Enrolee[]; leftOut: Partial<Record<LeftOutReason, number>> } {
  const leftOut: Partial<Record<LeftOutReason, number>> = {};
  const leave = (reason: LeftOutReason) => void (leftOut[reason] = (leftOut[reason] ?? 0) + 1);
  const contactsByProspect = new Map<string, AudienceContact[]>();
  for (const contact of input.contacts) {
    if (!contact.email?.trim() || contact.status === "inactive") continue;
    const list = contactsByProspect.get(contact.prospect_id) ?? [];
    list.push(contact);
    contactsByProspect.set(contact.prospect_id, list);
  }
  const lines = new Set((input.audience.linesOfWork ?? []).map(lineOfWorkOf));
  const onlyQualified = input.audience.onlyQualified !== false;
  const minFit = typeof input.audience.minFitScore === "number" ? input.audience.minFitScore : null;

  const enrol: Enrolee[] = [];
  for (const prospect of input.prospects) {
    if ((prospect.kind ?? "company") !== "company") { leave("channel"); continue; }
    if (prospect.outcome !== "open") { leave("closed"); continue; }
    if (prospect.status === "disqualified") { leave("disqualified"); continue; }
    if (onlyQualified && prospect.status !== "qualified") { leave("not_qualified"); continue; }
    if (input.alreadyEnrolled.has(prospect.id)) { leave("already_in_a_campaign"); continue; }
    const lineOfWork = lineOfWorkOf(prospect.industry);
    if (lines.size > 0 && !lines.has(lineOfWork)) { leave("other_line_of_work"); continue; }
    if (minFit !== null && (prospect.fit_score ?? -1) < minFit) { leave("below_fit_score"); continue; }

    const reasons = new Set<LeftOutReason>();
    let chosen: Enrolee | null = null;
    for (const contact of contactsByProspect.get(prospect.id) ?? []) {
      const verdict = judgeContact(contact, input.includeUnverified, input.suppressed);
      if (verdict.ok) {
        chosen = { prospectId: prospect.id, contactId: contact.id, recipient: "contact", lineOfWork };
        break;
      }
      reasons.add(verdict.reason);
    }
    const general = prospect.company_email?.trim();
    if (!chosen && general) {
      if (input.suppressed.has(emailHash(general))) reasons.add("suppressed");
      else chosen = { prospectId: prospect.id, contactId: null, recipient: "company_email", lineOfWork };
    }
    if (chosen) enrol.push(chosen);
    else leave(REASON_RANK.find((reason) => reasons.has(reason)) ?? "no_email");
  }
  return { enrol, leftOut };
}

/**
 * The lines of work that get their own text: the most common among those enrolled, up
 * to twelve, most common first (ties by name, so the answer is stable). Everyone else,
 * and anyone with no line of work, shares the general text.
 */
export function segmentsFor(enrolees: Pick<Enrolee, "lineOfWork">[]): { segment: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { lineOfWork } of enrolees) {
    if (lineOfWork !== GENERAL_SEGMENT) counts.set(lineOfWork, (counts.get(lineOfWork) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SEGMENTS)
    .map(([segment, count]) => ({ segment, count }));
}

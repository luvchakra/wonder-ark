import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { DiscoveryInProgressError, acquireDiscoveryLock, releaseDiscoveryLock } from "../ai/discovery-lock";
import { createContact, deleteContact } from "../contacts/mutations";
import { listContacts } from "../contacts/queries";
import type { Contact, ContactEmailStatus } from "../contacts/types";
import { getIcpProfile } from "../icp/queries";
import { extractDomain } from "../prospects/mutations";
import type { Prospect, ProspectFieldSource } from "../prospects/types";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { assertWithinUsageLimit } from "../usage/limits";
import { findDataSourceRun, recordDataSourceRun } from "./runs";
import { cleanText, safeHttpUrl } from "./suggestions";
import { gatewayFailureMessage } from "./types";
import {
  findContacts,
  providerIssuesOf,
  suppress,
  type ContactsResponse,
  type GatewayFailure,
} from "./workslake-client";

/**
 * DISC-DATA-P0-04.2/04.3: finding people to write to at a prospect, and passing on a
 * person's request not to be contacted.
 *
 * Both happen only on a person's click; nothing here is queued, scheduled or run by a
 * model. A contact lookup always spends the business's paid lookups, so:
 *  - it is refused before anything is sent when it cannot be asked properly (no domain,
 *    no approved ideal customer with roles): roles come from what the business approved,
 *    never from a default;
 *  - it carries the key of the one click that asked for it. A second request with the
 *    same key finds the first in the run ledger and asks nothing, and the workspace's
 *    lookup lock keeps two requests from being in flight at once, so a double click
 *    spends units once;
 *  - what comes back is untrusted text: tidied, length-capped and stored as data, each
 *    person with the status of their address and the source that found them.
 *
 * The gateway never stores these people; they are written only into this workspace.
 */

/** "Up to three people" (docs/plan/17, B4.3). */
export const CONTACT_LOOKUP_LIMIT = 3;
/** Roles sent with one lookup, at most. */
const MAX_ROLES = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailOf(value: string | null | undefined): string | null {
  const email = cleanText(value, 254);
  return email && EMAIL.test(email) ? email : null;
}

function isoOr(value: string | null | undefined, fallback: string): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

export type FoundContact = {
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  linkedinUrl: string | null;
  emailStatus: ContactEmailStatus | null;
  source: string;
  retrievedAt: string;
};

/**
 * The people in a contacts response that can be stored, at most `CONTACT_LOOKUP_LIMIT`,
 * leaving out anyone already on the prospect (matched by address) and anyone the answer
 * names twice. A person with no usable address and no profile link gives nothing to
 * write to, and one whose source is unnamed cannot be shown with it; neither is kept.
 * Pure.
 */
export function readFoundContacts(
  response: Pick<ContactsResponse, "contacts">,
  existing: Pick<Contact, "email">[],
  now: string,
): { contacts: FoundContact[]; alreadyHere: number } {
  const taken = new Set(existing.map((contact) => contact.email?.trim().toLowerCase()).filter(Boolean));
  const contacts: FoundContact[] = [];
  let alreadyHere = 0;
  for (const person of response.contacts) {
    if (contacts.length >= CONTACT_LOOKUP_LIMIT) break;
    const email = emailOf(person.email);
    const linkedinUrl = safeHttpUrl(person.linkedinUrl);
    const source = cleanText(person.source.name, 300);
    if ((!email && !linkedinUrl) || !source) continue;
    if (email) {
      const key = email.toLowerCase();
      if (taken.has(key)) {
        alreadyHere += 1;
        continue;
      }
      taken.add(key);
    }
    contacts.push({
      firstName: cleanText(person.firstName, 100),
      lastName: cleanText(person.lastName, 100),
      jobTitle: cleanText(person.title, 200),
      email,
      linkedinUrl,
      // The status describes the address; without one there is nothing it describes.
      emailStatus: email ? person.emailStatus : null,
      source,
      retrievedAt: isoOr(person.source.retrievedAt, now),
    });
  }
  return { contacts, alreadyHere };
}

/** The first generic mailbox that may fill the prospect's general email: a real
 * address, not one its check called invalid, from a source that has a name. Pure. */
export function readGenericMailbox(
  response: Pick<ContactsResponse, "generic">,
  now: string,
): { email: string; source: ProspectFieldSource } | null {
  for (const mailbox of response.generic) {
    const email = emailOf(mailbox.email);
    const provider = cleanText(mailbox.source.provider, 100);
    const name = cleanText(mailbox.source.name, 300);
    if (!email || mailbox.emailStatus === "invalid" || !provider || !name) continue;
    return { email, source: { provider, name, url: safeHttpUrl(mailbox.source.url), observedAt: now } };
  }
  return null;
}

export type ContactLookupOutcome =
  | {
      status: "completed";
      /** People added to the prospect's contacts. */
      added: number;
      /** People returned who were already contacts of this prospect. */
      alreadyHere: number;
      /** The general mailbox written to the prospect, when its general email was empty. */
      generalEmail: string | null;
      unitsSpent: number;
      paidRemaining: number;
      /** No person came back and at least one contact provider is not set up. */
      providersNeedSetup: boolean;
    }
  /** The same click was already answered. Nothing was asked again. */
  | { status: "already_done" }
  | {
      status: "failed";
      reason: "needs_setup" | "unavailable" | "quota" | "busy" | "invalid" | "not_found" | "save_failed";
      message: string;
    };

function failed(reason: Extract<ContactLookupOutcome, { status: "failed" }>["reason"], message: string): ContactLookupOutcome {
  return { status: "failed", reason, message };
}

function fromGatewayFailure(failure: GatewayFailure): ContactLookupOutcome {
  if (failure.failure === "quota") return failed("quota", gatewayFailureMessage("quota", failure.resetAt));
  if (failure.failure === "needs_setup" || failure.failure === "forbidden") {
    return failed("needs_setup", gatewayFailureMessage("needs_setup", null));
  }
  return failed("unavailable", "Unavailable: WorksLake didn't answer. No contacts were added. Try again in a few minutes.");
}

async function readProspect(prospectId: string): Promise<Prospect | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("prospects").select("*").eq("id", prospectId).maybeSingle();
  if (error) throw error;
  return data as Prospect | null;
}

/**
 * "Find contacts" for one prospect: up to three people in the approved ideal customer's
 * roles, each address checked (`verify: true`). `requestKey` is the key of the click.
 */
export async function findContactsForProspect(prospectId: string, requestKey: string): Promise<ContactLookupOutcome> {
  if (!requestKey) throw new Error("A contact lookup needs the key of the click that asked for it.");
  const prospect = await readProspect(prospectId);
  if (!prospect) return failed("not_found", "This prospect no longer exists.");
  const workspaceId = prospect.workspace_id;
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) return failed("not_found", "This prospect no longer exists.");
  await requireModule(businessId, "discovery");

  const domain = prospect.domain ?? (prospect.website ? extractDomain(prospect.website) : null);
  if (!domain) {
    return failed("invalid", "Add this company's website first: contacts are looked up by its web address.");
  }
  const icp = await getIcpProfile(workspaceId);
  const roles = (icp?.status === "approved" ? icp.roles : [])
    .map((role) => cleanText(role, 120))
    .filter((role): role is string => role !== null)
    .slice(0, MAX_ROLES);
  if (roles.length === 0) {
    return failed(
      "invalid",
      "Approve your ideal customer, with at least one role, first: contacts are looked up by its roles.",
    );
  }

  const key = { lookup: "contacts", prospectId, requestKey };
  if (await findDataSourceRun(workspaceId, "gateway_contacts", key)) return { status: "already_done" };

  await assertWithinUsageLimit(workspaceId);

  try {
    await acquireDiscoveryLock(workspaceId);
  } catch (lockError) {
    if (lockError instanceof DiscoveryInProgressError) {
      return failed("busy", "Another search or lookup is running for this offering. Nothing was spent. Try again in a moment.");
    }
    throw lockError;
  }
  try {
    // Checked again under the lock: the first of two clicks may have finished meanwhile.
    if (await findDataSourceRun(workspaceId, "gateway_contacts", key)) return { status: "already_done" };

    const startedAt = Date.now();
    const result = await findContacts(
      { tenantId: businessId },
      { domain, roles, limit: CONTACT_LOOKUP_LIMIT, verify: true },
    );
    const record = (run: { status: "succeeded" | "failed"; resultCount?: number; unitsSpent?: number | null; errorCode?: string }) =>
      recordDataSourceRun({
        workspaceId,
        operation: "gateway_contacts",
        source: "contacts",
        request: key,
        durationMs: Date.now() - startedAt,
        ...run,
      });

    if (!result.ok) {
      // Nothing is recorded for a request that never left this server.
      if (result.called) await record({ status: "failed", errorCode: result.code });
      return fromGatewayFailure(result);
    }

    const { unitsSpent, tenantRemaining } = result.data.usage;
    const now = new Date().toISOString();
    let added = 0;
    let alreadyHere = 0;
    let generalEmail: string | null = null;
    try {
      const found = readFoundContacts(result.data, await listContacts(prospectId), now);
      alreadyHere = found.alreadyHere;
      for (const person of found.contacts) {
        await createContact(
          workspaceId,
          prospectId,
          {
            firstName: person.firstName ?? undefined,
            lastName: person.lastName ?? undefined,
            jobTitle: person.jobTitle ?? undefined,
            email: person.email ?? undefined,
            linkedinUrl: person.linkedinUrl ?? undefined,
          },
          { emailStatus: person.emailStatus, source: person.source, retrievedAt: person.retrievedAt },
        );
        added += 1;
      }
      generalEmail = await fillGeneralEmail(prospect, readGenericMailbox(result.data, now));
    } catch (writeError) {
      console.error("Found contacts could not be saved:", writeError instanceof Error ? writeError.message : writeError);
      await record({ status: "failed", resultCount: added, unitsSpent, errorCode: "SAVE_FAILED" });
      const spent = `The lookup ran and used ${unitsSpent} paid lookup${unitsSpent === 1 ? "" : "s"}`;
      return failed(
        "save_failed",
        added > 0
          ? `${spent}. ${added} contact${added === 1 ? " was" : "s were"} added, but the rest of what it found couldn't be saved.`
          : `${spent}, but what it found couldn't be saved.`,
      );
    }

    await record({ status: "succeeded", resultCount: added, unitsSpent });
    return {
      status: "completed",
      added,
      alreadyHere,
      generalEmail,
      unitsSpent,
      paidRemaining: tenantRemaining.paid,
      providersNeedSetup:
        result.data.contacts.length === 0 &&
        providerIssuesOf(result.data.metadata).some((issue) => issue.status === "needs_setup"),
    };
  } finally {
    await releaseDiscoveryLock(workspaceId);
  }
}

/** Writes a generic mailbox as the prospect's general email only if that is still empty,
 * and notes where it came from. Returns the address when it was written. */
async function fillGeneralEmail(
  prospect: Prospect,
  mailbox: ReturnType<typeof readGenericMailbox>,
): Promise<string | null> {
  if (!mailbox) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .update({ company_email: mailbox.email })
    .eq("id", prospect.id)
    // A general email a person typed is never replaced.
    .is("company_email", null)
    .select("field_sources");
  if (error) throw error;
  const row = (data ?? [])[0] as { field_sources?: Record<string, unknown> } | undefined;
  if (!row) return null;

  const { error: sourcesError } = await supabase
    .from("prospects")
    .update({ field_sources: { ...(row.field_sources ?? {}), company_email: mailbox.source } })
    .eq("id", prospect.id);
  if (sourcesError) throw sourcesError;
  return mailbox.email;
}

/** The line shown after "Find contacts". Fixed wording; the one value echoed is the
 * mailbox this code validated as an address. */
export function contactLookupMessage(outcome: ContactLookupOutcome): string {
  if (outcome.status === "failed") return outcome.message;
  if (outcome.status === "already_done") return "This lookup already ran. Nothing more was spent.";

  const parts: string[] = [];
  if (outcome.added > 0) parts.push(`Added ${outcome.added} contact${outcome.added === 1 ? "" : "s"}.`);
  else if (outcome.providersNeedSetup) parts.push("No named contacts: the contact providers need setup.");
  else if (outcome.alreadyHere === 0) parts.push("No named contacts were found.");
  if (outcome.alreadyHere > 0) {
    parts.push(`${outcome.alreadyHere} ${outcome.alreadyHere === 1 ? "was" : "were"} already on this prospect.`);
  }
  if (outcome.generalEmail) parts.push(`Added ${outcome.generalEmail} as the general company email.`);
  parts.push(
    outcome.unitsSpent === 0
      ? `No paid lookups were used; ${outcome.paidRemaining} left.`
      : `Used ${outcome.unitsSpent} paid lookup${outcome.unitsSpent === 1 ? "" : "s"}; ${outcome.paidRemaining} left.`,
  );
  return parts.join(" ");
}

export type ContactRemovalOutcome =
  | { status: "removed"; passedOn: boolean }
  | { status: "failed"; reason: "needs_setup" | "unavailable" | "not_found"; message: string };

/**
 * DISC-DATA-P0-04.3: deleting a contact because the person asked not to be contacted.
 * Their address is first passed to the gateway's removal list, so no later lookup, for
 * any business, returns them; only when the gateway has accepted it is the contact
 * deleted here. If the request cannot be passed on, the contact is kept and the person
 * is told, so the request is not lost. A contact with no address has nothing to pass on
 * and is simply deleted.
 *
 * The audit log records that the request was made and passed on, never the address.
 */
export async function removeContactOnRequest(contactId: string): Promise<ContactRemovalOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, workspace_id, email")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: "failed", reason: "not_found", message: "This contact no longer exists." };
  const businessId = await getBusinessIdForWorkspace(data.workspace_id);
  if (!businessId) return { status: "failed", reason: "not_found", message: "This contact no longer exists." };
  await requireModule(businessId, "discovery");

  const email = emailOf(data.email);
  if (email) {
    const result = await suppress({ tenantId: businessId }, { emails: [email], domains: [] });
    if (!result.ok) {
      const needsSetup = result.failure === "needs_setup" || result.failure === "forbidden";
      return {
        status: "failed",
        reason: needsSetup ? "needs_setup" : "unavailable",
        message: needsSetup
          ? "Needs setup: the WorksLake connection isn't set up, so the request couldn't be passed on. The contact was not deleted."
          : "Unavailable: the request couldn't be passed on to WorksLake. The contact was not deleted. Try again in a few minutes.",
      };
    }
  }

  await deleteContact(contactId);
  try {
    await writeAuditLog({
      businessId,
      action: "discovery.contact.removed_on_request",
      entityType: "discovery_contact",
      entityId: contactId,
      after: { passed_to_gateway: email !== null },
    });
  } catch (auditError) {
    console.error("Could not record a contact removal:", auditError instanceof Error ? auditError.message : auditError);
  }
  return { status: "removed", passedOn: email !== null };
}

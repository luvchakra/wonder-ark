import { addPartyContact } from "@cofounderai/core/parties/mutations";
import { createClient } from "../../db/server";
import { ensureProspectParty } from "../prospects/party-sync";
import { getProspect } from "../prospects/queries";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import type { Contact, ContactProvenance } from "./types";

export async function createContact(
  workspaceId: string,
  prospectId: string,
  input: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    linkedinUrl?: string;
    phone?: string;
  },
  /** DISC-DATA-P0-04.2: given only for a contact a lookup found, never for one a person
   * typed, whose three provenance columns stay null. */
  found?: ContactProvenance,
): Promise<Contact> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      prospect_id: prospectId,
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      email: input.email?.trim() || null,
      linkedin_url: input.linkedinUrl?.trim() || null,
      phone: input.phone?.trim() || null,
      ...(found
        ? { email_status: found.emailStatus, source: found.source, source_retrieved_at: found.retrievedAt }
        : {}),
    })
    .select()
    .single();
  if (error) throw error;

  // Mirror this contact into core.party_contacts under the prospect's party (D-3) --
  // updates/deletes to this discovery.contacts row are not propagated (no stored link
  // back to the party_contacts row to find it by); this is a one-way snapshot at
  // creation time, which is all any current consumer of core.party_contacts needs.
  const prospect = await getProspect(prospectId);
  const businessId = prospect ? await getBusinessIdForWorkspace(workspaceId) : null;
  if (prospect && businessId) {
    const partyId = await ensureProspectParty(workspaceId, prospect.party_id, {
      name: prospect.company_name,
      email: prospect.company_email,
    });
    await addPartyContact({
      businessId,
      partyId,
      firstName: input.firstName,
      lastName: input.lastName,
      jobTitle: input.jobTitle,
      email: input.email,
      phone: input.phone,
      linkedinUrl: input.linkedinUrl,
    });
  }

  return data;
}

export async function updateContact(
  contactId: string,
  input: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    linkedinUrl?: string;
    phone?: string;
  },
): Promise<Contact> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      email: input.email?.trim() || null,
      linkedin_url: input.linkedinUrl?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .eq("id", contactId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * DISC-DATA-P0-04.2: a person's edit of a contact. It is `updateContact`, plus one rule:
 * when the address changes on a contact a lookup found, what the lookup said about the
 * old address (`email_status`) is cleared, because nothing has checked the new one. The
 * source and its date stay: they still say where the person came from.
 */
export async function editContact(
  contactId: string,
  input: Parameters<typeof updateContact>[1],
): Promise<Contact> {
  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("contacts")
    .select("email, email_status")
    .eq("id", contactId)
    .maybeSingle();
  if (readError) throw readError;

  const updated = await updateContact(contactId, input);

  const sameAddress = (before?.email ?? "").trim().toLowerCase() === (input.email ?? "").trim().toLowerCase();
  if (!before?.email_status || sameAddress) return updated;
  const { data, error } = await supabase
    .from("contacts")
    .update({ email_status: null })
    .eq("id", contactId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContact(contactId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) throw error;
}

export type ContactStatus = "active" | "inactive";

export type Contact = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
  /** DISC-DATA-P0-01.3/04.2: set only on a contact a lookup found. `email_status` is
   * what the source's check of the address said, `source` the attribution text the
   * gateway gave for the source, `source_retrieved_at` when it was looked up. All three
   * are null (or absent, on a value built before the columns existed) for a contact a
   * person typed, and are cleared when a person changes the address. */
  email_status?: ContactEmailStatus | null;
  source?: string | null;
  source_retrieved_at?: string | null;
};

export type ContactEmailStatus = "verified" | "risky" | "invalid" | "unverified";

/** Where a looked-up contact came from, written with it. */
export type ContactProvenance = {
  emailStatus: ContactEmailStatus | null;
  source: string;
  retrievedAt: string;
};

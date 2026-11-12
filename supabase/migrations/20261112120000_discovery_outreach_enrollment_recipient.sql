-- DISC-CAMP-P0-02.1: who an enrollment writes to
-- (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md, "Suppression and validity").
--
-- An enrollment writes either to a contact on the prospect or to the prospect's general
-- company email (`prospects.company_email`), which has no contact row. Without this
-- column a null contact_id meant both "the general mailbox" and "the contact was
-- deleted", and the second must stop the enrollment.
--
--   contact        contact_id names who is written to; if the contact is deleted the
--                  enrollment has no one to write to and is stopped.
--   company_email  the prospect's general company email is written to; contact_id is null.
--
-- Additive: every existing row is 'contact', which is what it meant.
-- (20261112100000 is applied and frozen, so this is its own file.)
alter table discovery.outreach_enrollments
  add column recipient text not null default 'contact' check (recipient in ('contact', 'company_email')),
  add constraint outreach_enrollments_company_email_has_no_contact
    check (recipient = 'contact' or contact_id is null);

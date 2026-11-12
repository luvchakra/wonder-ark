-- DISC-CAMP-P0-02.3: one send per message, however many clicks or retries ask for it
-- (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md, "Claim before send").
--
-- Until now sendMessage read a message, called the mail provider and then wrote the
-- outcome, so two clicks close together could both send. A send now first claims the
-- message with a compare-and-set on these columns, and only the request that got the
-- claim calls the provider.
--
--   send_claimed_at  set while a send is in flight; cleared when it definitely failed
--                    (so the person can try again); left set once sent.
--   send_attempt     counts definite failures. It is part of the provider idempotency
--                    key, so a repeat of the same attempt is recognised by the provider
--                    and a deliberate retry after a failure is a new one.
--
-- Additive: both default to "never claimed", which is true of every existing row.
alter table discovery.messages
  add column send_claimed_at timestamptz,
  add column send_attempt integer not null default 0 check (send_attempt >= 0);

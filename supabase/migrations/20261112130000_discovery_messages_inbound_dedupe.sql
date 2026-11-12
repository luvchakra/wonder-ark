-- DISC-CAMP-P0-04.2: a reply that is delivered twice is stored once
-- (docs/plan/19-DISCOVERY-OUTREACH-CAMPAIGNS.md, "Replies").
--
-- The inbound email webhook, and the mailbox reader, may hand over the same reply more
-- than once (a provider retry, an overlapping read). An inbound message now carries a
-- key in provider_message_id: the email's own Message-ID when there is one, otherwise a
-- hash of the sender, the text and the day. This index makes the second insert of the
-- same key fail, and the ingest then returns the row that is already there.
--
-- Partial: outbound rows keep provider_message_id as the mail provider's id and are not
-- constrained, and every inbound row that exists today has it null, so no existing row
-- can violate the index.
create unique index messages_inbound_provider_message_id_key
  on discovery.messages (workspace_id, provider_message_id)
  where direction = 'inbound' and provider_message_id is not null;

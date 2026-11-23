-- DISC-REACH-P0-01.1: direct messages to channels found on Instagram and Facebook (owner,
-- 2026-11-23). A channel with no published enquiry address gets a short direct-message
-- draft instead of an email that can't be sent. WonderArk never sends on these platforms:
-- the person copies the draft, sends it there themselves and marks it sent, as for
-- LinkedIn and WhatsApp. So the two tables that record a message and its conversation
-- accept the two more channels; nothing else changes.

alter table discovery.messages drop constraint messages_channel_check;
alter table discovery.messages
  add constraint messages_channel_check
    check (channel in ('email', 'linkedin', 'whatsapp', 'instagram', 'facebook'));

alter table discovery.conversations drop constraint conversations_channel_check;
alter table discovery.conversations
  add constraint conversations_channel_check
    check (channel in ('email', 'linkedin', 'whatsapp', 'instagram', 'facebook'));

-- 95 · An outbound message can be ABOUT several things
--
-- Migration 94 gave `outbound_messages` a single `entity_id`, copying
-- notification_log's shape. That shape was only right because notification_log
-- wrote one row per entity: the overdue-invoice digest sends ONE email
-- covering N invoices and then logged N rows, so the cron could ask "was this
-- invoice ever included?".
--
-- One row per message is the whole point of the new table (it holds the body),
-- so the set moves onto the row: `entity_ids` is every entity the message was
-- about, and the cron's idempotency question becomes an array overlap. Written
-- minutes after 94, whose only rows were the copied notification log.
alter table outbound_messages
  add column if not exists entity_ids uuid[] not null default '{}';

update outbound_messages
  set entity_ids = array[entity_id]
  where entity_id is not null and entity_ids = '{}';

alter table outbound_messages drop column if exists entity_id;

drop index if exists outbound_messages_event_entity_idx;

-- "Was this event already sent for any of these entities?" — one overlap query.
create index if not exists outbound_messages_entity_ids_idx
  on outbound_messages using gin (entity_ids);
create index if not exists outbound_messages_event_key_idx
  on outbound_messages (event_key)
  where event_key is not null;

comment on column outbound_messages.entity_ids is
  'Every entity this message was about — a digest covers several. Cron idempotency asks `entity_ids && array[...]` with the event_key.';

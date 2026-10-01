-- 118 · The calendar holds more than visits (owner, 2026-10-01): every entry
-- the system creates has a KIND — visits and reminders to start; the list
-- lives in code (src/lib/calendar/kinds.ts), and this check mirrors it, so a
-- new kind is a code entry plus a line here. Events Finn makes in Google have
-- no row and read as "other".

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'visit';
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_kind_check;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_kind_check
  CHECK (kind IN ('visit', 'reminder'));

-- The visit suggestion became a calendar ENTRY with a kind. `draft_visit`
-- stays allowed: a plan drafted before this reads as a visit, and its ledger
-- rows keep their type.
ALTER TABLE command_actions DROP CONSTRAINT IF EXISTS command_actions_action_type_check;
ALTER TABLE command_actions ADD CONSTRAINT command_actions_action_type_check
  CHECK (action_type IN (
    'draft_customer', 'draft_offer', 'draft_sales_order', 'draft_ticket',
    'draft_visit', 'draft_event', 'draft_purchase_order'
  ));

insert into public.schema_migrations (version, name)
  values (118, '118_calendar_kinds') on conflict (version) do nothing;

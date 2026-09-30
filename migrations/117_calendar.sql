-- 117 · Service visits in a Google calendar (owner, 2026-09-30;
-- docs/plan-service-calendar.md). Google is where the times live; the system
-- keeps only the settings to reach it and a thin link from each event it
-- created to the call (and ticket, customer) it came from.

-- Operational config, not secret (three-tier doctrine): which calendar
-- provider, and which calendar. The key stays in env
-- (GOOGLE_SERVICE_ACCOUNT_KEY); the service account's address is read from it.
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS calendar_provider TEXT,
  ADD COLUMN IF NOT EXISTS calendar_id TEXT;

-- One row per event the SYSTEM created. Events Finn adds in Google have no
-- row, and need none: the visits list reads Google, and this only says where
-- an event came from. Times are a copy at creation — Google's are the truth.
CREATE TABLE IF NOT EXISTS calendar_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider          TEXT NOT NULL,
    calendar_id       TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    message_id        UUID REFERENCES inbound_messages(id) ON DELETE SET NULL,
    ticket_id         UUID REFERENCES maintenance_tickets(id) ON DELETE SET NULL,
    organization_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
    title             TEXT,
    starts_at         TIMESTAMPTZ,
    ends_at           TIMESTAMPTZ,
    created_by        UUID REFERENCES people(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, calendar_id, external_event_id)
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON calendar_events;
CREATE POLICY anon_all ON calendar_events FOR ALL USING (true) WITH CHECK (true);

-- A requested visit is a fourth thing a call can suggest.
ALTER TABLE command_actions DROP CONSTRAINT IF EXISTS command_actions_action_type_check;
ALTER TABLE command_actions ADD CONSTRAINT command_actions_action_type_check
  CHECK (action_type IN (
    'draft_customer', 'draft_offer', 'draft_sales_order', 'draft_ticket',
    'draft_visit', 'draft_purchase_order'
  ));

insert into public.schema_migrations (version, name)
  values (117, '117_calendar') on conflict (version) do nothing;

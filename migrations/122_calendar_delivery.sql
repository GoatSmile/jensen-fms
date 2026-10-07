-- 122 · Deliveries go in the calendar; reminders are parked (owner,
-- 2026-10-07: "new kind; no reminders for now, just calendar events
-- everywhere"). The kinds list lives in code (src/lib/calendar/kinds.ts) and
-- this check mirrors it. Production holds no reminder (checked 2026-10-07);
-- a test one on a local copy is re-filed as a visit so the check can tighten.
UPDATE calendar_events SET kind = 'visit' WHERE kind = 'reminder';
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_kind_check;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_kind_check
  CHECK (kind IN ('visit', 'delivery'));

-- A delivery belongs to an order. A call drafts it against the OFFER (nothing
-- is sold yet); the sales order's own button writes it against the ORDER. The
-- order page treats an entry on the offer it was converted from as its own,
-- so the same delivery is never put in twice.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS calendar_events_sales_order_idx
  ON calendar_events (sales_order_id) WHERE sales_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendar_events_offer_idx
  ON calendar_events (offer_id) WHERE offer_id IS NOT NULL;

insert into public.schema_migrations (version, name)
  values (122, '122_calendar_delivery') on conflict (version) do nothing;

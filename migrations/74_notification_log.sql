-- ============================================================================
-- 74 — Notification log (people & roles P4)
-- ============================================================================
-- One row per delivered (or test-rerouted) notification. Two jobs:
--   1. Idempotency for state-scan events — the overdue-invoices cron asks
--      "was invoice X ever notified?" before including it in a digest.
--      Action-fired events (ticket.created, wo.assigned) fire once by
--      construction and use the log only as an audit trail.
--   2. Debugging/audit: who was told what, when, and whether test mode
--      rerouted it.
-- Delivery config stays where it lives: subscriptions in role_notifications
-- (mig 73), channel flags on people, sender/test-mode in app_settings
-- (mig 55). Event keys come from the code registry
-- (src/lib/people/notifications.ts) — never free-form.

CREATE TABLE notification_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key  TEXT NOT NULL,
    -- The subject entity (ticket / work order / invoice id). No FK — events
    -- span tables, and the log must outlive its entities.
    entity_id  UUID,
    person_id  UUID REFERENCES people(id) ON DELETE SET NULL,
    channel    TEXT NOT NULL DEFAULT 'email',
    -- The INTENDED address (pre test-mode reroute) — the reroute itself is
    -- recorded in test_mode.
    recipient  TEXT,
    test_mode  BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_log_event_entity
    ON notification_log(event_key, entity_id);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON notification_log
    FOR ALL TO anon USING (true) WITH CHECK (true);

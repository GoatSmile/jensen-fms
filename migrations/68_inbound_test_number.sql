-- ============================================================================
-- 68 — Inbound telephony: test number alongside the production number
-- ============================================================================
-- The Twilio trial number (US, verified-callers-only) is for smoke-testing
-- the webhook/recording flow; the real Danish +45 number arrives with the
-- regulatory bundle. Both are operational config (tier 2 of the config
-- doctrine), so both live here and are edited at /admin/settings:
--   inbound_phone_number       → the PRODUCTION number (+45; announcements,
--                                SMS sender identity, printed material)
--   inbound_phone_number_test  → the TEST number (Slice F's webhook accepts
--                                calls on either; test-number calls are for
--                                verification only)

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS inbound_phone_number_test TEXT;

-- Seed with the Twilio trial number already provisioned (2026-07-15).
UPDATE app_settings
SET inbound_phone_number_test = '+17625000850'
WHERE id = 1 AND inbound_phone_number_test IS NULL;

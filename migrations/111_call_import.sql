-- ============================================================================
-- 111 — Inbound: import calls from the shop's own phone system (Relatel)
-- ============================================================================
-- Twilio's path is PUSH: a number we rent calls our webhooks. Relatel is the
-- shop's own switchboard and mobiles, with no webhooks on its plan, so its
-- path is PULL: a scheduled job lists the calls the API token can see and
-- imports each recorded one into the same inbound_messages row shape. The
-- pipeline (transcribe → extract → match) and the /inbox review stay as they
-- are.
--
-- Config doctrine: the token is a SECRET (env, RELATEL_TOKEN); everything
-- else is operational config here, edited at /admin/settings → Phone:
--   inbound_call_import_provider     which built adapter pulls calls (NULL = off)
--   inbound_call_import_endpoints    whose calls: the provider's endpoint ids
--                                    (Relatel "Employee#74326"), picked from
--                                    the provider's live list — never typed
--   inbound_call_import_voicemails   also import voicemails
--   inbound_call_import_lookback_hours  how far back each run looks; recordings
--                                    can appear late, and a re-seen call is
--                                    skipped by the key below
--
-- Idempotency: every imported row carries channel_meta.external_id
-- ("relatel:call:<uuid>", "relatel:voicemail:<id>"), unique — so a run can
-- overlap the last one, and *Run now* can be pressed twice, without doubles.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS inbound_call_import_provider TEXT,
  ADD COLUMN IF NOT EXISTS inbound_call_import_endpoints TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inbound_call_import_voicemails BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS inbound_call_import_lookback_hours INTEGER NOT NULL DEFAULT 48
    CHECK (inbound_call_import_lookback_hours BETWEEN 1 AND 336);

COMMENT ON COLUMN app_settings.inbound_call_import_provider IS
  'Adapter that pulls calls from the shop''s own phone system into the inbox (NULL = off). Validated against CALL_IMPORT_PROVIDERS in src/lib/inbound/settings.ts.';
COMMENT ON COLUMN app_settings.inbound_call_import_endpoints IS
  'Whose calls are imported: the provider''s endpoint ids (Relatel: Employee#<id>). Empty = none.';

CREATE UNIQUE INDEX IF NOT EXISTS inbound_messages_external_id_key
  ON inbound_messages ((channel_meta->>'external_id'))
  WHERE channel_meta->>'external_id' IS NOT NULL;

insert into public.schema_migrations (version, name)
  values (111, '111_call_import') on conflict (version) do nothing;

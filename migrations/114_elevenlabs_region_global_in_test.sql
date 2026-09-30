-- ============================================================================
-- 114 — ElevenLabs host defaults to `global` while the system is in test
-- ============================================================================
-- Owner, 2026-09-30: "Let's default to global for now. We are in test."
-- The only key available is a standard one, and the EU residency host refuses
-- it (verified the same day: `invalid_api_key` on api.eu.residency, 200 on
-- api.elevenlabs.io). `global` is NOT EU residency — customer call audio is
-- processed outside the EU for the test period. Before go-live: an EU
-- (enterprise) ElevenLabs key and the setting back to `eu` (DECISIONS
-- 2026-09-30). 113 stays as applied; this changes the default and the row.

ALTER TABLE app_settings ALTER COLUMN inbound_elevenlabs_region SET DEFAULT 'global';
UPDATE app_settings SET inbound_elevenlabs_region = 'global' WHERE id = 1;

insert into public.schema_migrations (version, name)
  values (114, '114_elevenlabs_region_global_in_test') on conflict (version) do nothing;

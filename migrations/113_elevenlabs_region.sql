-- ============================================================================
-- 113 — Transcription: ElevenLabs Scribe, and WHERE it processes audio
-- ============================================================================
-- ElevenLabs Scribe v2 joins the transcription registry (DECISIONS
-- 2026-09-30) for dictation and calls. It runs on three hosts, and the host
-- is the data-residency decision: `eu` keeps audio in the EU but accepts only
-- keys from an EU (enterprise) workspace; `global` accepts any key and is
-- NOT EU residency. Operational config (tier 2), so it lives here and is
-- chosen at /admin/settings → Phone & inbox; the default is `eu`, so moving
-- customer audio out of the EU is always a deliberate choice, never a default.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS inbound_elevenlabs_region TEXT NOT NULL DEFAULT 'eu'
    CHECK (inbound_elevenlabs_region IN ('eu', 'global', 'us'));

COMMENT ON COLUMN app_settings.inbound_elevenlabs_region IS
  'ElevenLabs host for transcription: eu (EU residency, enterprise keys only), global (any key, not EU), us.';

insert into public.schema_migrations (version, name)
  values (113, '113_elevenlabs_region') on conflict (version) do nothing;

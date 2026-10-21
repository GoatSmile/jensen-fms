-- 131 · Which service speaks the secretary's answers
--
-- Owner, 2026-10-21: "check what speaking service we use in Munin; add it as
-- an option for us as well." Munin speaks through Google Cloud Text-to-Speech;
-- Jensen started on ElevenLabs. The choice is operational config (the
-- provider registry, CLAUDE.md), set at /admin/settings → Phone & inbox; the
-- keys stay in env. `elevenlabs` stays the default — it is the one verified.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS speech_provider text NOT NULL DEFAULT 'elevenlabs';
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_speech_provider_check;
ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_speech_provider_check CHECK (speech_provider IN ('elevenlabs', 'google'));

insert into public.schema_migrations (version, name)
  values (131, '131_speech_provider') on conflict (version) do nothing;

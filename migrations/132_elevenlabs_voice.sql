-- 132 · Which ElevenLabs voice and model speak the secretary's answers
--
-- Owner, 2026-10-21: a native Danish voice from the library, and the model
-- picked by ear from samples. A voice per LANGUAGE — a Danish voice reading
-- English (or the English "George" reading Danish, the start) carries an
-- accent. NULL = the built-in default voice. Set at /admin/settings → Phone &
-- inbox → Speech; voice ids are not secrets, the key stays in env.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS speech_elevenlabs_model text NOT NULL DEFAULT 'eleven_flash_v2_5',
  ADD COLUMN IF NOT EXISTS speech_elevenlabs_voice_da text,
  ADD COLUMN IF NOT EXISTS speech_elevenlabs_voice_en text;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_speech_elevenlabs_model_check;
ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_speech_elevenlabs_model_check
  CHECK (speech_elevenlabs_model IN ('eleven_flash_v2_5', 'eleven_multilingual_v2', 'eleven_v3'));
-- An ElevenLabs voice id is 20 letters and digits; nothing else is stored.
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_speech_elevenlabs_voice_check;
ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_speech_elevenlabs_voice_check CHECK (
    (speech_elevenlabs_voice_da IS NULL OR speech_elevenlabs_voice_da ~ '^[A-Za-z0-9]{10,40}$') AND
    (speech_elevenlabs_voice_en IS NULL OR speech_elevenlabs_voice_en ~ '^[A-Za-z0-9]{10,40}$')
  );

insert into public.schema_migrations (version, name)
  values (132, '132_elevenlabs_voice') on conflict (version) do nothing;

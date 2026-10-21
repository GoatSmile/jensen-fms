-- 128 · A fourth button mode: one press asks a spoken QUESTION
--
-- Owner, 2026-10-21: "press the button, dictate, and receive answers from the
-- system like a secretary." `ask_voice` records on a press, stops on a pause
-- (or a second press), transcribes, and puts the question to the assistant
-- straight away — the panel opens on the answer, with what was heard shown
-- above it. Mirrors ASSISTANT_MODES in src/lib/notes/mode.ts.

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_assistant_mode_check;
ALTER TABLE people
  ADD CONSTRAINT people_assistant_mode_check
  CHECK (assistant_mode IN ('ask', 'ask_voice', 'note_toggle', 'note_vad'));

insert into public.schema_migrations (version, name)
  values (128, '128_assistant_voice_mode') on conflict (version) do nothing;

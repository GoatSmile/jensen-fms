-- 130 · The button is the SECRETARY, not a note-taker
--
-- Owner, 2026-10-21: "The note button is no longer a note-taking
-- functionality. It's an engage-the-secretary powerful functionality. If we
-- want a note, I will tell it that I want a note." So:
--   * the secretary — `ask_voice` (press, speak, hear the answer; safe
--     things carried out) — is the new default, and whoever was on a note
--     mode is moved to it; the note modes stay as choices for now ("keep it
--     as an option, and we can remove it later"), as does `ask`;
--   * a note is an ACTION the secretary takes when asked: `save_note`.
-- Mirrors ASSISTANT_MODES (src/lib/notes/mode.ts) and the action list in
-- src/lib/inbound/command/plan.ts.

UPDATE people SET assistant_mode = 'ask_voice' WHERE assistant_mode IN ('note_toggle', 'note_vad');

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_assistant_mode_check;
ALTER TABLE people ALTER COLUMN assistant_mode SET DEFAULT 'ask_voice';
ALTER TABLE people
  ADD CONSTRAINT people_assistant_mode_check
  CHECK (assistant_mode IN ('ask', 'ask_voice', 'note_toggle', 'note_vad'));

ALTER TABLE command_actions DROP CONSTRAINT IF EXISTS command_actions_action_type_check;
ALTER TABLE command_actions ADD CONSTRAINT command_actions_action_type_check
  CHECK (action_type IN (
    'draft_customer', 'draft_offer', 'draft_sales_order', 'draft_ticket',
    'draft_visit', 'draft_event', 'draft_purchase_order',
    'attach_note', 'save_contact', 'move_event', 'delete_event', 'save_note'
  ));

insert into public.schema_migrations (version, name)
  values (130, '130_secretary_button') on conflict (version) do nothing;

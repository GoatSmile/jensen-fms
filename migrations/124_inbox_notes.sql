-- 124 · Spoken notes: the inbound trunk's next channel (plan-inbox-notes.md)
--
-- Finn says something to the app and it is KEPT, not answered: a note is an
-- inbound message like a call — transcribed, later read, matched and given
-- suggestions — so it reuses the trunk instead of a table of its own. The
-- speaker rides on `handled_by_person_id` (whose it is, as for a call) and on
-- `commanded_by` (who said it). Slice 1 uses the channel, the kind, the
-- context and the person's button mode; the rest (addressee, reminder day,
-- Done, auto-apply) is added now so the Inbox slices need no second migration.

ALTER TYPE inbound_channel ADD VALUE IF NOT EXISTS 'note';

ALTER TABLE inbound_messages DROP CONSTRAINT IF EXISTS inbound_messages_kind_check;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_kind_check CHECK (kind IN ('customer', 'command', 'note'));

ALTER TABLE inbound_messages
  -- Who the note is FOR; NULL = the speaker ("we need to invoice" → Dennis).
  ADD COLUMN IF NOT EXISTS addressed_to_person_id uuid REFERENCES people(id),
  -- What was known at the press: the page, the record on it, the time.
  ADD COLUMN IF NOT EXISTS note_context jsonb,
  -- A reminder's day, when one was said.
  ADD COLUMN IF NOT EXISTS due_date date,
  -- Done (notes): who closed it, when, and which suggestions were left.
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES people(id),
  ADD COLUMN IF NOT EXISTS dropped_actions text[];

CREATE INDEX IF NOT EXISTS inbound_messages_note_owner_idx
  ON inbound_messages (handled_by_person_id, received_at DESC) WHERE kind = 'note';
CREATE INDEX IF NOT EXISTS inbound_messages_addressed_idx
  ON inbound_messages (addressed_to_person_id) WHERE addressed_to_person_id IS NOT NULL;

-- An action applied by the system on the speaker's behalf (act right away).
ALTER TABLE command_actions
  ADD COLUMN IF NOT EXISTS auto_applied boolean NOT NULL DEFAULT false;

-- What a press of the floating button does, chosen by the person; and whether
-- safe actions from their notes may run without a press (set by people admin).
-- Columns, not ui_preferences: a background job reads the second.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS assistant_mode text NOT NULL DEFAULT 'ask',
  ADD COLUMN IF NOT EXISTS assistant_auto_apply boolean NOT NULL DEFAULT false;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_assistant_mode_check;
ALTER TABLE people
  ADD CONSTRAINT people_assistant_mode_check
  CHECK (assistant_mode IN ('ask', 'note_toggle', 'note_vad'));

insert into public.schema_migrations (version, name)
  values (124, '124_inbox_notes') on conflict (version) do nothing;

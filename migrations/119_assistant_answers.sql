-- 119 · The assistant answers, not only drafts (owner, 2026-10-01: "a
-- secretary … 'What is my next appointment?' or 'Show me bike number 55'").
-- A request stays a kind='command' row; what it answered — the words, the
-- record to open, the choices when several matched — is kept here beside the
-- drafted actions (`command_plan`), so the history shows what was asked AND
-- what came back. Shape: src/lib/assistant/answer.ts.

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS assistant_answer JSONB;

insert into public.schema_migrations (version, name)
  values (119, '119_assistant_answers') on conflict (version) do nothing;

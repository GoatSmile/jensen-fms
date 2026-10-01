-- 120 · The assistant has its OWN model (owner, 2026-10-01: "use Haiku 4.5
-- for the assistant, make this configurable"). Speed matters for a
-- secretary asked from the floor; the call reader keeps its own, stronger
-- model (`inbound_extraction_model`). Same provider and key; set at
-- /admin/settings → Phone & inbox, and a changed value is saved only after
-- the assistant's own Test passes (src/lib/inbound/models.ts).

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS inbound_assistant_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001';

insert into public.schema_migrations (version, name)
  values (120, '120_assistant_model') on conflict (version) do nothing;

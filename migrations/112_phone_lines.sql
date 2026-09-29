-- ============================================================================
-- 112 — Phone lines: whose phone a call was on, and the Calls page
-- ============================================================================
-- Migration 111 imported calls for a bare list of provider endpoint ids
-- (app_settings.inbound_call_import_endpoints). A call must now belong to a
-- PERSON — Finn sees his calls, Mathilde hers, the office everyone's — so the
-- list becomes a table of phone lines, each mapped to a person (or to nobody,
-- for a shared line like the main number).
--
--   phone_lines.token_env  Relatel lets only a number's OWN user hear its
--       recordings, so every line names the env var holding ITS token
--       (config doctrine tier 1: the value never leaves env). The name is
--       restricted to RELATEL_TOKEN or RELATEL_TOKEN_<SUFFIX>: an admin must
--       not be able to point a line at SUPABASE_SECRET_KEY and have the app
--       send it to Relatel as a bearer token.
--   phone_lines.line_number  the line's own number, from the provider's
--       employee list — how a call between two of our own lines is known to
--       be INTERNAL (no action) rather than a customer.
--
-- inbound_messages gains phone_line_id + handled_by_person_id, STAMPED at
-- import and never re-derived: re-mapping a line later (Finn leaves, the
-- number goes to someone else) must not move his history to them — the same
-- snapshot rule as frozen PO prices.
--
-- The Calls page's groups (to do / check / no action / done) are DERIVED from
-- extraction + match + ticket + disposition (src/lib/calls/triage.ts), never
-- stored. The human's override is the existing `disposition`, which gains
-- 'needs_action' — "the system greyed this out, but it does need doing".
--
-- Capability `calls_own` (registered in src/lib/people/capabilities.ts):
-- the Calls page, limited to the person's own lines. `inbox` keeps its grants
-- and now means ALL lines.

CREATE TABLE IF NOT EXISTS phone_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT NOT NULL,
    endpoint        TEXT NOT NULL,
    endpoint_name   TEXT,
    line_number     TEXT,
    person_id       UUID REFERENCES people(id),
    label           TEXT,
    token_env       TEXT NOT NULL DEFAULT 'RELATEL_TOKEN',
    import_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    last_actor_id   UUID REFERENCES people(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, endpoint),
    CONSTRAINT phone_lines_token_env_shape CHECK (
        provider <> 'relatel' OR token_env ~ '^RELATEL_TOKEN(_[A-Z0-9]{1,32})?$'
    ),
    -- A line with nobody behind it must say what it is ("Main number").
    CONSTRAINT phone_lines_named CHECK (person_id IS NOT NULL OR nullif(trim(label), '') IS NOT NULL)
);

COMMENT ON TABLE phone_lines IS
  'Phone lines whose recorded calls are imported (migration 112). person_id = whose calls they are (NULL = shared line, label says which). token_env names the env var with that line''s token — never the value.';

ALTER TABLE phone_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON phone_lines;
CREATE POLICY anon_all ON phone_lines FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS phone_line_id UUID REFERENCES phone_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handled_by_person_id UUID REFERENCES people(id);

CREATE INDEX IF NOT EXISTS inbound_messages_person_received_idx
  ON inbound_messages (handled_by_person_id, received_at DESC);
CREATE INDEX IF NOT EXISTS inbound_messages_line_received_idx
  ON inbound_messages (phone_line_id, received_at DESC);

ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_disposition_check;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_disposition_check
  CHECK (disposition IN ('pending', 'spam', 'not_spam', 'handled', 'needs_action'));

-- Carry 111's selection over: each endpoint becomes a line on the default
-- token. The person is found by the provider's own name for the line, and only
-- when exactly one active person has that name — otherwise the line lands as a
-- labelled shared line for an admin to map, never guessed.
INSERT INTO phone_lines (provider, endpoint, endpoint_name, person_id, label, token_env)
SELECT
    'relatel',
    e.endpoint,
    m.endpoint_name,
    p.id,
    CASE WHEN p.id IS NULL THEN coalesce(m.endpoint_name, e.endpoint) END,
    'RELATEL_TOKEN'
FROM app_settings s
CROSS JOIN LATERAL unnest(s.inbound_call_import_endpoints) AS e(endpoint)
LEFT JOIN LATERAL (
    SELECT channel_meta->>'call_endpoint_name' AS endpoint_name
    FROM inbound_messages
    WHERE channel_meta->>'call_endpoint' = e.endpoint
      AND channel_meta->>'call_endpoint_name' IS NOT NULL
    ORDER BY received_at DESC
    LIMIT 1
) m ON TRUE
LEFT JOIN LATERAL (
    SELECT (array_agg(pp.id))[1] AS id
    FROM people pp
    WHERE pp.is_active AND NOT pp.is_system AND pp.full_name = m.endpoint_name
    HAVING count(*) = 1
) p ON TRUE
WHERE s.id = 1
ON CONFLICT (provider, endpoint) DO NOTHING;

-- Stamp the calls already imported with their line and its person.
UPDATE inbound_messages im
SET phone_line_id = pl.id,
    handled_by_person_id = pl.person_id
FROM phone_lines pl
WHERE im.channel_meta->>'source' = pl.provider
  AND im.channel_meta->>'call_endpoint' = pl.endpoint
  AND im.phone_line_id IS NULL;

COMMENT ON COLUMN app_settings.inbound_call_import_endpoints IS
  'SUPERSEDED by phone_lines (migration 112) — copied there, no longer read. Kept so 112 is reversible.';

-- Workshop technicians see their OWN calls.
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'calls_own' FROM roles r WHERE r.key = 'workshop'
ON CONFLICT DO NOTHING;

insert into public.schema_migrations (version, name)
  values (112, '112_phone_lines') on conflict (version) do nothing;

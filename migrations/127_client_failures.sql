-- 127 · Failures the BROWSER sees, kept where they can be read
--
-- A spoken note that fails before its upload lands leaves no trace on the
-- server: the reason went to that browser's console only, so "the note wasn't
-- saved" could not be diagnosed afterwards (2026-10-21). The note button now
-- reports each failure here — which stage broke and why — and also each
-- recording the pause detector dropped as "nothing heard", with the loudness
-- it measured, so the speech threshold can be tuned from data rather than by ear.
--
-- Best-effort by design: a report that cannot reach the server (the network
-- was the failure) is simply lost. Read with SQL; no UI.

CREATE TABLE IF NOT EXISTS client_failures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    person_id   UUID REFERENCES people(id) ON DELETE SET NULL,
    surface     TEXT NOT NULL CHECK (surface IN ('note')),
    stage       TEXT NOT NULL,
    detail      TEXT,
    context     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS client_failures_created_idx ON client_failures (created_at DESC);

ALTER TABLE client_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON client_failures;
CREATE POLICY anon_all ON client_failures FOR ALL USING (true) WITH CHECK (true);

insert into public.schema_migrations (version, name)
  values (127, '127_client_failures') on conflict (version) do nothing;

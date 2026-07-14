-- ============================================================================
-- 65 — Inbound messages: generic inbound trunk (voicemail = first channel)
-- ============================================================================
-- Phone→ticket pipeline v1, built GENERIC per the 2026-07-14 decision
-- (docs/plan-july9-vacation-month.md → "generic inbound trunk"): every
-- future channel (email, WhatsApp Business, agent/API ingress, web forms)
-- shares this one table + pipeline; what varies per channel is a thin
-- adapter. Channel-shaped data lives in `channel_meta` jsonb — the table
-- carries NO speculative per-channel columns. Extraction + matching read
-- ONLY the normalized fields (`from_identity`, `body_text`), never the
-- channel payload — that rule is what keeps them channel-blind.
--
-- Also seeds the `fleet_number` bike identifier type (customers' own fleet
-- numbering — "bike 25"; big match-rate win for municipalities) and relaxes
-- the blanket UNIQUE(identifier_type_id, identifier_value) so the existing
-- `is_globally_unique = FALSE` flag is actually honoured for it: fleet
-- numbers legitimately repeat across organizations. Matching treats them as
-- candidate generators, not unique keys.
--
-- Storage: private `inbound` bucket. Uploads and reads both go through the
-- service client (secret key bypasses storage policies; reads use signed
-- URLs), so NO storage.objects policies are needed — unlike the public
-- image buckets (05/11). Voicemail audio is personal data (GDPR): the
-- ~90-day media retention cron lands with the Twilio slice (F), when real
-- customer audio starts arriving.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Only channels that exist are seeded; Postgres enums extend with one
-- `ALTER TYPE inbound_channel ADD VALUE 'email';` when a channel is real.
CREATE TYPE inbound_channel AS ENUM ('voicemail');

CREATE TYPE inbound_status AS ENUM (
    'received',    -- raw stored; nothing processed yet
    'understood',  -- normalized to body_text (voicemail: transcribed)
    'extracted',   -- who/what/intent payload present
    'matched',     -- org/contact/bike resolution attempted
    'actioned',    -- routed to an action (v1: maintenance ticket)
    'failed'       -- a stage errored; `error` has the detail
);

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE inbound_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel         inbound_channel NOT NULL,
    status          inbound_status NOT NULL DEFAULT 'received',

    -- Channel-primitive sender identity: caller number / email address /
    -- WhatsApp number. Matching's first probe (contacts.phone / .email).
    from_identity   TEXT,
    -- When the message arrived at the channel (voicemail left at) —
    -- distinct from created_at (row insert; harness uploads are later).
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Media in the private `inbound` bucket (voicemail audio today; email
    -- attachments later — retention is designed against this column).
    media_path      TEXT,
    media_mime_type TEXT,

    -- The canonical "what they said": transcript / email body / message
    -- text. THE normalized artifact every downstream stage consumes.
    body_text       TEXT,
    language        TEXT,             -- detected ('da' / 'en' / …)

    -- Stage outputs, one column per stage — inspectable and replayable.
    understanding    JSONB,           -- voicemail: transcript w/ timestamps
    extraction       JSONB,           -- who/what/intent payload (Claude)
    match_candidates JSONB,           -- candidate lists when not exactly-one

    -- Exactly-one match survivors (else NULL + match_candidates carries it).
    matched_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    matched_contact_id      UUID REFERENCES contacts(id)      ON DELETE SET NULL,
    matched_bike_id         UUID REFERENCES bikes(id)         ON DELETE SET NULL,

    -- v1 action: a maintenance ticket. Plain column BY DESIGN — no
    -- polymorphic action framework until a second action type is real.
    ticket_id       UUID REFERENCES maintenance_tickets(id) ON DELETE SET NULL,

    -- Channel-shaped data: audio duration, provider SIDs, original
    -- filename, email headers… No second-guessing shapes in columns.
    channel_meta    JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Raw provider payload, verbatim, for replay/debugging.
    raw_payload     JSONB,

    error           TEXT,             -- failure detail when status='failed'
    processed_at    TIMESTAMPTZ,      -- last pipeline run over this row
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inbound_messages_status   ON inbound_messages(status);
CREATE INDEX idx_inbound_messages_received ON inbound_messages(received_at DESC);
CREATE INDEX idx_inbound_messages_ticket   ON inbound_messages(ticket_id)
    WHERE ticket_id IS NOT NULL;

CREATE TRIGGER trg_inbound_messages_updated_at
    BEFORE UPDATE ON inbound_messages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: migration-50 pattern — permissive anon until M1 auth lands.
ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON inbound_messages
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Private storage bucket for inbound media
-- ---------------------------------------------------------------------------
-- public=false: audio is personal data; the app reads via short-lived
-- signed URLs from the service client. allowed_mime_types is NULL because
-- audio container MIME reporting is unreliable across browsers/phones
-- (m4a shows up as audio/mp4, audio/x-m4a, even video/mp4) — the upload
-- action validates instead. 25 MB cap ≈ a very long voicemail.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inbound', 'inbound', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- fleet_number identifier type + honouring is_globally_unique
-- ---------------------------------------------------------------------------
-- Fixed UUID so the partial unique index below can reference it in an
-- immutable predicate (a subquery on slug is not allowed there).
INSERT INTO bike_identifier_types
    (id, slug, name_en, name_da, description_en, description_da,
     is_globally_unique, sort_order, is_active)
VALUES (
    'f1ee7000-0000-4000-8000-000000000001',
    'fleet_number',
    'Fleet number',
    'Flådenummer',
    'The customer''s own fleet numbering (e.g. "bike 25"). Values repeat across customers.',
    'Kundens egen flådenummerering (fx "cykel 25"). Værdier gentages på tværs af kunder.',
    FALSE, 140, TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- The blanket UNIQUE ignored is_globally_unique. Replace it with a partial
-- unique index that exempts fleet_number. If another non-unique type ever
-- appears, extend this predicate in a new migration (rare enough to accept
-- the hardcoded id; the seeded UUID above is fixed for exactly this reason).
ALTER TABLE bike_identifiers
    DROP CONSTRAINT bike_identifiers_identifier_type_id_identifier_value_key;

CREATE UNIQUE INDEX uq_bike_identifiers_type_value
    ON bike_identifiers(identifier_type_id, identifier_value)
    WHERE identifier_type_id <> 'f1ee7000-0000-4000-8000-000000000001';

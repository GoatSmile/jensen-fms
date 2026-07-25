-- ============================================================================
-- 78 — Live call bridging: routing config + media headroom
-- ============================================================================
-- docs/plan-live-call-recording.md. Adds the owner-facing switch that sends an
-- incoming call to a real phone (recording the conversation) instead of
-- straight to voicemail. Operational config → app_settings (tier 2 of the
-- config doctrine); no new secrets — the Twilio creds already live in env.

ALTER TABLE app_settings
    -- 'voicemail' = today's behaviour (announce → record a message → hang up).
    -- 'bridge'    = announce → ring inbound_bridge_number → record the
    --               conversation; voicemail remains the no-answer FALLBACK.
    ADD COLUMN IF NOT EXISTS inbound_call_mode TEXT NOT NULL DEFAULT 'voicemail'
        CHECK (inbound_call_mode IN ('voicemail', 'bridge')),
    -- The phone to ring in bridge mode (E.164). Deliberately NOT workshop_phone:
    -- migration 55 defines that as the number PRINTED ON DOCUMENTS, which is a
    -- different fact from "the mobile that should ring" (and changes hands).
    ADD COLUMN IF NOT EXISTS inbound_bridge_number TEXT,
    -- Seconds to ring before falling through to voicemail.
    ADD COLUMN IF NOT EXISTS inbound_bridge_timeout_seconds INTEGER NOT NULL DEFAULT 20
        CHECK (inbound_bridge_timeout_seconds BETWEEN 5 AND 120),
    -- Which transcription adapter handles CONVERSATIONS. Split from the
    -- voicemail provider on purpose: a dual-channel conversation wants
    -- per-channel (deterministic) attribution, which not every provider does —
    -- see the provider table in the plan. Defaults to the voicemail provider's
    -- value so nothing changes until it's set deliberately.
    ADD COLUMN IF NOT EXISTS inbound_call_transcription_provider TEXT;

COMMENT ON COLUMN app_settings.inbound_call_mode IS
    'How an incoming call is handled: voicemail (record a message) or bridge (ring inbound_bridge_number, record the conversation, voicemail on no-answer).';
COMMENT ON COLUMN app_settings.inbound_bridge_number IS
    'E.164 phone rung in bridge mode — the test phone today, the owner''s production number later. Not workshop_phone (that is the document-facing number).';
COMMENT ON COLUMN app_settings.inbound_call_transcription_provider IS
    'Transcription adapter for two-way CALL recordings (NULL = use inbound_transcription_provider). Azure supports deterministic per-channel attribution; Gladia only diarization.';

-- Media headroom: the 25 MB cap was sized for "a very long voicemail"
-- (migration 65). A dual-channel 20-minute conversation can exceed it, and the
-- upload would fail leaving a row with no audio. 100 MB ≈ a very long call.
UPDATE storage.buckets SET file_size_limit = 104857600 WHERE id = 'inbound';

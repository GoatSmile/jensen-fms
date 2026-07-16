-- ============================================================================
-- 69 — Inbound: capture every call event (triage layer 1)
-- ============================================================================
-- The voicemail pipeline only ever created a row when a caller LEFT a message
-- (the recording callback). Hang-ups at the greeting — a real signal (spam
-- robocallers, or a frustrated customer who called three times) — left no
-- trace. Twilio's call-STATUS callback fires on every call completion with
-- the duration + outcome, so we can now record every contact attempt.
--
-- Two callbacks now write for the same call: the status callback (every call)
-- and the recording callback (only when a message was left). They must
-- converge on ONE row, correlated by Twilio's CallSid — hence the partial
-- unique index. Uploaded harness voicemails have no CallSid (NULL), and
-- Postgres treats NULLs as distinct, so they're unaffected.
--
-- See docs/plan-inbound-triage.md (layer 1 · capture-everything).

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  -- 'message_left' | 'no_message' | 'busy' | 'no-answer' | 'failed' | 'canceled'
  ADD COLUMN IF NOT EXISTS call_outcome TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS inbound_messages_twilio_call_sid_key
  ON inbound_messages ((channel_meta->>'twilio_call_sid'))
  WHERE channel_meta->>'twilio_call_sid' IS NOT NULL;

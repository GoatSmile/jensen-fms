-- ============================================================================
-- 70 — Inbound: transcript clarity score (triage layer 2)
-- ============================================================================
-- "Some calls will be garbled or noisy." The transcription providers already
-- return an acoustic confidence (Gladia: per-utterance; Azure: per-phrase) —
-- we were discarding it. Aggregate it to a 0..1 transcript clarity score so
-- the review queue can flag garbled audio and prioritize a human ear, and so
-- (later) a low score can trigger a second-opinion re-transcription.
--
-- A first-class column (not channel_meta) because it's a triage signal to
-- filter/order by. NULL = not scored (older rows, or a provider that didn't
-- return confidence). See docs/plan-inbound-triage.md (layer 2).

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS transcript_confidence NUMERIC;

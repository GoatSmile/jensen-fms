-- ============================================================================
-- 71 — Inbound: spam triage & disposition (triage layer 5)
-- ============================================================================
-- "Handle spam calls — the system should be smart enough to figure this out."
-- Triage is queue ordering, NOT a gate: nothing is discarded, suspected spam
-- is PARKED in a collapsed fold and is reversible. Two new fields:
--
--   spam_signals  — the deterministic, explainable signals computed at capture
--                   (unknown_number, no_message, short_call, repeat_unknown,
--                   no_caller_id). Stored so the reviewer sees WHY something
--                   was flagged; recomputable, carries no human state.
--   disposition   — the human's decision, overriding the auto-suspicion:
--                   'pending' (untouched) | 'spam' (confirm-fold) |
--                   'not_spam' (force back to the active queue).
--
-- The fold is DERIVED (src/lib/inbound/triage.ts): a row folds as spam when
-- disposition='spam', OR (disposition≠'not_spam' AND no ticket AND the signals
-- look like spam). The trump card lives in the scorer: a number that matches a
-- contact is never spam. See docs/plan-inbound-triage.md (layer 5).

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS disposition TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS spam_signals JSONB;

ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_disposition_check;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_disposition_check
  CHECK (disposition IN ('pending', 'spam', 'not_spam'));

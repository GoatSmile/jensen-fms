-- ============================================================================
-- 72 — Inbound: 'handled' disposition for intent routing (triage layer 4)
-- ============================================================================
-- Routing the review action by intent: a repair_request becomes a maintenance
-- ticket, but an order_inquiry should NOT — its proper home is the offers/
-- quotes module (Tier 5, deferred). Interim, the inbox IS the lead tracker, so
-- the reviewer marks an order inquiry (or anything with no ticket to make)
-- 'handled' — reviewed, actioned outside the app — and it leaves the pending
-- queue. Reversible. See docs/plan-inbound-triage.md (layer 4).

ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_disposition_check;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_disposition_check
  CHECK (disposition IN ('pending', 'spam', 'not_spam', 'handled'));

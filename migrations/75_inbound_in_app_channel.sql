-- ============================================================================
-- 75 — Inbound trunk gains an 'in_app' channel (voice commands VC-1, Option A)
-- ============================================================================
-- The command slice ingests typed / browser-dictated TEXT in the app (no
-- audio), so a command row needs a channel that isn't 'voicemail'. This lives
-- in its own migration because Postgres forbids USING a freshly-added enum
-- value in the same transaction that adds it — keeping the ADD VALUE alone
-- guarantees it is committed before migration 76 / app code reference it.
ALTER TYPE inbound_channel ADD VALUE IF NOT EXISTS 'in_app';

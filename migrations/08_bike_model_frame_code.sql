-- ============================================================================
-- 08 — bike_models.frame_number_code
-- ============================================================================
-- Adds a short type-code per bike model that the build flow will eventually
-- use to suggest frame numbers like 'JP-2026-HSB-001'. Optional and
-- suggestion-only — no enforcement on the bike_identifier value, per Dennis.
--
-- 2-6 chars to keep generated frame numbers tidy. Uppercase is conventional
-- but not enforced; the UI will uppercase on input.
--
-- The actual `next_frame_number(...)` helper function lands when the build
-- flow needs it (Phase 2C). Defining it now without a caller is dead code.
-- ============================================================================

ALTER TABLE bike_models
  ADD COLUMN IF NOT EXISTS frame_number_code TEXT
    CHECK (
      frame_number_code IS NULL OR
      length(frame_number_code) BETWEEN 2 AND 6
    );

COMMENT ON COLUMN bike_models.frame_number_code IS
  'Short uppercase code (2-6 chars) used by the build flow to suggest frame numbers, e.g. HSB → JP-2026-HSB-001. Suggestion only; not enforced on bike_identifiers.';

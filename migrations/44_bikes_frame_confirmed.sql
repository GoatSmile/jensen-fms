-- Distinguish a *confirmed* real frame number from the provisional one a bike
-- is auto-created with. MO bikes are spawned in bulk with a sequential
-- placeholder frame (JP-{year}-{code}-{seq}, see src/lib/bikes/frame-number.ts)
-- that is ALSO written to bike_identifiers. Because bikes.frame_number is
-- NOT NULL UNIQUE, "a frame exists" is always true — so the old finish-build
-- check ("frame_number is non-empty") never actually gated anything.
--
-- Tier 2 deliberate build: a tech confirms the *real* physical frame number in
-- the build workbench before Finish. frame_number_confirmed flips TRUE only at
-- that deliberate step (confirmBikeFrame); finishBikeBuild and the bulk
-- "Mark N built" shortcut now refuse to consume inventory for an unconfirmed
-- bike. New bikes (manual add or bulk) start FALSE.
ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS frame_number_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: anything already past the build phase is treated as confirmed —
-- those bikes are built/shipped and we won't retroactively force a re-confirm.
-- (In production today even built bikes carry provisional JP- frames; this is
-- exactly the data-quality gap the deliberate build closes going forward.)
UPDATE bikes
   SET frame_number_confirmed = TRUE
 WHERE status NOT IN ('planning', 'building');

COMMENT ON COLUMN bikes.frame_number_confirmed IS
  'TRUE once a tech confirmed the real physical frame number in the build workbench (confirmBikeFrame). FALSE = still the provisional auto-generated placeholder. Gates finishBikeBuild + bulk Mark-built. Backfilled TRUE for bikes already past building.';

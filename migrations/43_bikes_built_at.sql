-- When a bike was built (assembled → in_stock), as a first-class timestamp.
--
-- The build moment was only recoverable from bike_state_log (the to_status =
-- 'in_stock' transition). Promoting it to bikes.built_at makes "built this year",
-- "built in a range", and "older than a year" cheap, indexable filters on the
-- bikes list. Stamped going forward in finishBikeBuild (the single code path
-- both the workbench Finish and the bulk Mark-built use). NULL = not yet built
-- (planning / building).
ALTER TABLE bikes ADD COLUMN IF NOT EXISTS built_at TIMESTAMPTZ;

-- Backfill from the state log for bikes already past the build, falling back to
-- created_at when a built-state bike has no logged transition (older/manual rows).
UPDATE bikes b
SET built_at = COALESCE(
  (SELECT min(sl.occurred_at)
     FROM bike_state_log sl
    WHERE sl.bike_id = b.id AND sl.to_status = 'in_stock'),
  b.created_at
)
WHERE b.built_at IS NULL
  AND b.status IN ('in_stock', 'assigned', 'in_service', 'in_maintenance',
                   'retired', 'lost_or_stolen');

CREATE INDEX IF NOT EXISTS idx_bikes_built_at ON bikes(built_at);

COMMENT ON COLUMN bikes.built_at IS
  'When the bike was assembled (first transition to in_stock). NULL while still planning/building. Stamped by finishBikeBuild; backfilled from bike_state_log.';

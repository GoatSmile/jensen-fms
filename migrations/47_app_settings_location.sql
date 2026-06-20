-- Single-location simplification (Dennis request 2026-06-20). The shop runs one
-- physical location (WH-MAIN); per-location stock breakdowns, the movements
-- location column, and the receive/adjust location pickers are noise at one
-- location. Two new app_settings columns:
--   * primary_location_id — the canonical location parts are consumed from /
--     received into when no explicit pick is made (replaces the implicit
--     "first active location by code" in finishBikeBuild / work-order parts) and
--     the target the receive/adjust pickers fall back to when locations are
--     hidden.
--   * hide_location_info — when true, all internal location UI is suppressed
--     app-wide: per-location stock collapses to a single total, the movements
--     ledger drops its location column, and the receive/adjust forms hide the
--     location picker and auto-target primary_location_id. Flip it back off from
--     /admin/settings once a second location is added (managed at /admin/locations).
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS primary_location_id uuid REFERENCES inventory_locations(id),
  ADD COLUMN IF NOT EXISTS hide_location_info boolean NOT NULL DEFAULT false;

-- Seed the singleton: primary = the current single active location (matches the
-- prior implicit "first active by code" default), and hide location info on,
-- since the shop has exactly one location today (the stated request).
UPDATE app_settings
SET primary_location_id = (
      SELECT id FROM inventory_locations WHERE is_active ORDER BY code LIMIT 1
    ),
    hide_location_info = true,
    updated_at = now()
WHERE id = 1;

COMMENT ON COLUMN app_settings.primary_location_id IS
  'Canonical inventory location for auto-consumption/receipt when no explicit pick is made; also the fallback target when hide_location_info hides the location pickers.';
COMMENT ON COLUMN app_settings.hide_location_info IS
  'When true, suppress all internal location UI app-wide (single-location shops): per-location stock collapses to a total, movements drop the location column, receive/adjust auto-target primary_location_id.';

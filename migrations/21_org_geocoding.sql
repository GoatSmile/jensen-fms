-- 21_org_geocoding.sql
--
-- Geographic coordinates on organizations so the new /organizations/map
-- can plot customers without re-geocoding on every page load. Populated
-- from the address fields via Nominatim (OSM); the geocoded_at column
-- lets the save-organization action skip re-geocoding when the address
-- hasn't changed, and lets us spot stale entries when address fields
-- are edited later.
--
-- All three columns nullable: customers without an address or whose
-- geocode failed simply don't appear on the map.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.latitude IS
  'Geocoded latitude in WGS84. Populated by the Nominatim (OSM) geocoder when an address is saved. NULL when the customer has no address or geocoding failed.';

COMMENT ON COLUMN organizations.longitude IS
  'Geocoded longitude in WGS84. Same lifecycle as latitude.';

COMMENT ON COLUMN organizations.geocoded_at IS
  'Timestamp of the last successful geocode. Compared against updated_at to detect addresses that have changed since their last geocode.';

CREATE INDEX IF NOT EXISTS idx_organizations_latlng
  ON organizations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

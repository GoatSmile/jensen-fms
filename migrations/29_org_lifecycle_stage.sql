-- 29_org_lifecycle_stage.sql
--
-- A "prospect" is just an organization not yet a customer, so prospects
-- reuse the whole org pipeline (address, geocoding, segment, map). One new
-- column tracks the lifecycle. Imported customers all default to 'customer'.
-- Drives the Prospects layer on the customer map.
ALTER TABLE organizations
  ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'customer'
  CHECK (lifecycle_stage IN ('prospect', 'customer'));

CREATE INDEX idx_organizations_lifecycle_stage
  ON organizations (lifecycle_stage) WHERE deleted_at IS NULL;

COMMENT ON COLUMN organizations.lifecycle_stage IS
  'prospect = not yet a customer (sales/prospecting target on the map); customer = active/known customer. Prospects reuse the org geocoding + map pipeline.';

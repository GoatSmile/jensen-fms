-- 30_service_agreement_unit.sql
-- Phase A of M3c: make service agreements unit-aware (a kommune bills via
-- units, e.g. Herlev Hjemmepleje vs Sundhed & Voksen — see migration 27).
-- An agreement still belongs to an organization; organization_unit_id
-- optionally narrows coverage to one unit. Coverage lookup prefers the
-- unit-scoped agreement, then falls back to an org-wide one (unit IS NULL).
ALTER TABLE service_agreements
  ADD COLUMN organization_unit_id UUID REFERENCES organization_units (id),
  ADD COLUMN has_gps BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_service_agreements_org_unit
  ON service_agreements (organization_id, organization_unit_id)
  WHERE status = 'active';

COMMENT ON COLUMN service_agreements.organization_unit_id IS
  'Optional: narrows the agreement to one org unit. NULL = covers the whole organization. Coverage prefers a unit-scoped match over an org-wide one.';
COMMENT ON COLUMN service_agreements.has_gps IS
  'GPS add-on (per contract, 3-year min binding). Flag only in Phase A.';

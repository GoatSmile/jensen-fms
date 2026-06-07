-- 26_customer_import_schema.sql
--
-- Prepares the customer module for importing the e-conomic "Kunder.xlsx"
-- export (659 customers). The module is greenfield today (3 seed orgs,
-- 0 units, 0 contacts), so this is pure additive prep — no backfill.
--
-- Three parts:
--   1. organizations.external_customer_no — the stable e-conomic customer
--      number (Kunder.xlsx "Nr."), the join key for the future 3E push.
--   2. organization_units billing identity — the "both" model: a kommune /
--      hospital is ONE parent org with N units, and each unit routes its
--      own invoices (the Herlev case proves it — "Herlev Hjemmepleje" and
--      "Herlev Kommune – Sundhed og Voksen" bill under different customer
--      numbers / EANs). EAN/CVR are stored INLINE on the unit, mirroring
--      how organizations actually store them (the organization_tax_-
--      identifiers table exists but is unused; inline is the live pattern).
--   3. Two new customer_segments to cover Gruppe values the existing vocab
--      doesn't: Ejendomsmæglere (99 rows) and Boligselskaber (24 rows).
--
-- NOTE on external_customer_no uniqueness: it is UNIQUE per-table on both
-- organizations and organization_units, but NOT globally enforced across
-- the two. e-conomic guarantees global uniqueness and the importer
-- respects it, so this is sufficient. If it ever bites (a number lands on
-- both an org and a unit), promote to a dedicated external_customer_map
-- table — same escalation pattern as the bike-owner overloading note.

-- 1. organizations: e-conomic customer number ------------------------------
ALTER TABLE organizations
  ADD COLUMN external_customer_no INTEGER;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_external_customer_no_key
  UNIQUE (external_customer_no);

COMMENT ON COLUMN organizations.external_customer_no IS
  'Stable e-conomic customer number (Kunder.xlsx "Nr."). Join key for the e-conomic push (3E). Globally unique in e-conomic; enforced UNIQUE per-table here.';

-- 2. organization_units: first-class billing targets -----------------------
ALTER TABLE organization_units
  ADD COLUMN external_customer_no INTEGER,
  ADD COLUMN ean_number   TEXT,
  ADD COLUMN cvr_number   TEXT,
  ADD COLUMN zip_code     TEXT,
  ADD COLUMN city         TEXT,
  ADD COLUMN country_code CHAR(2) DEFAULT 'DK',
  ADD COLUMN email        CITEXT,
  ADD COLUMN phone        TEXT,
  ADD COLUMN latitude     NUMERIC,
  ADD COLUMN longitude    NUMERIC,
  ADD COLUMN geocoded_at  TIMESTAMPTZ;

ALTER TABLE organization_units
  ADD CONSTRAINT organization_units_external_customer_no_key
  UNIQUE (external_customer_no);

COMMENT ON COLUMN organization_units.external_customer_no IS
  'Stable e-conomic customer number for this unit, when the unit bills separately from its parent org (e.g. kommune sub-departments).';
COMMENT ON COLUMN organization_units.ean_number IS
  'Per-unit EAN/GLN for electronic invoicing. Public-sector units bill via EAN; resolve invoice routing as COALESCE(unit.ean_number, org.ean_number).';

-- The existing free-text organization_units.address is treated as line 1;
-- zip_code/city are the structured Kunder.xlsx Postnr./By. Billing terms
-- (payment_terms_days, billing_currency, default_vat_code, preferred_-
-- language) are NOT duplicated onto units — resolve at invoice time with
-- COALESCE(unit, org). latitude/longitude/geocoded_at let units geocode
-- onto the existing customer map at their own distinct addresses.

-- 3. customer_segments: cover the two unmapped Gruppe values ---------------
-- Existing: hotel(10) hospital(20) municipality(30) facility_management(40)
--           b2b(50) b2c(60) rental_company(70) other(99).
-- Privat hjemmepleje folds into facility_management for now (revisit if
-- M3c wants to slice home-care). Udlands kunder is a country dimension,
-- not a segment — handled via country_code on import.
INSERT INTO customer_segments (slug, name_en, name_da, sort_order) VALUES
  ('housing_association', 'Housing Association', 'Boligselskab',   35),
  ('real_estate',         'Real Estate Agency', 'Ejendomsmægler',  55);

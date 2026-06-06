-- 23_anti_dumping.sql
--
-- EU anti-dumping duty on Chinese-origin bicycle parts. Discovered via
-- a real H1D customs declaration (CZET26032) where two of the 11 line
-- items attract an A30 "anti-dumping" tax of 48.50 % on top of the
-- 4.70 % base TARIC duty. Specifically, the 10-digit splits that are
-- NOT "for use in manufacture of bicycles" carry the anti-dumping
-- regime — historically targeted at Chinese imports of bicycle parts.
--
-- Without modelling this, landed cost on those parts is massively
-- under-reported (the 53.2 % effective customs rate becomes 4.7 % in
-- our books, ~10× too low).
--
-- v1 simplification: store the rate on hs_codes globally, snapshot
-- onto purchase_order_lines at insert. Anti-dumping is technically
-- origin-country-specific, but Jensen imports almost entirely from
-- China, so a per-HS-code rate captures reality.
--
-- Schema:
--   - hs_codes.anti_dumping_pct  numeric NULL  (decimal fraction; 0.4850 = 48.50 %)
--   - purchase_order_lines.anti_dumping_pct  numeric NULL  (snapshotted, frozen)
--
-- The generated landed-cost column has to be DROPPED and re-added with
-- the new formula — Postgres doesn't allow ALTER COLUMN on the
-- expression of a STORED generated column.

ALTER TABLE hs_codes
  ADD COLUMN IF NOT EXISTS anti_dumping_pct NUMERIC;

COMMENT ON COLUMN hs_codes.anti_dumping_pct IS
  'Optional EU anti-dumping duty applied on top of the base tariff_pct for imports from countries subject to anti-dumping measures (primarily China for bicycle parts). Decimal fraction (0.4850 = 48.50 %). When NULL, no anti-dumping applies. Snapshotted to purchase_order_lines.anti_dumping_pct at insert, same frozen-at-purchase rule as tariff_pct and fx_rate_to_dkk.';

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS anti_dumping_pct NUMERIC;

COMMENT ON COLUMN purchase_order_lines.anti_dumping_pct IS
  'Anti-dumping rate snapshotted at insert from the part''s HS code. NULL = no anti-dumping. Frozen at purchase, same rule as tariff_pct.';

-- Rebuild the GENERATED landed-cost column to include the new term.
ALTER TABLE purchase_order_lines
  DROP COLUMN landed_cost_dkk_per_unit;

ALTER TABLE purchase_order_lines
  ADD COLUMN landed_cost_dkk_per_unit NUMERIC
  GENERATED ALWAYS AS (
    unit_price * fx_rate_to_dkk
    * (1 + transport_pct + tariff_pct + COALESCE(anti_dumping_pct, 0))
  ) STORED;

COMMENT ON COLUMN purchase_order_lines.landed_cost_dkk_per_unit IS
  'Generated. base × (1 + transport + tariff + anti_dumping). Never write from app code.';

-- Backfill: codes confirmed to attract the 48.50 % anti-dumping on
-- Chinese-origin imports. 8714963090 is confirmed via the H1D
-- (CZET26032) line item 5; 8714991099 is the "other" handlebars
-- split and the H1D's 8714991089 ("with integrated stem") attracts
-- the same A30 rate, so the sibling split is treated equivalently.
UPDATE hs_codes
SET anti_dumping_pct = 0.4850
WHERE code IN ('8714963090', '8714991099');

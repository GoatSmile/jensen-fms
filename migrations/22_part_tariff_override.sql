-- 22_part_tariff_override.sql
--
-- Per-part tariff override. When set, this value wins over the part's
-- HS code's tariff_pct in `resolveTariffPctForPart` (the snapshotter
-- that stamps tariff_pct onto a new purchase_order_lines row).
--
-- Rare-use feature for products that are misclassified by HS but where
-- we don't want to add a brand-new HS code just to handle one outlier.
-- Examples: a temporary tariff exception, a customs ruling that the
-- standard rate doesn't apply, a part that's classified provisionally
-- under the wrong code pending verification.
--
-- Stored as the decimal-fraction same as hs_codes.tariff_pct (0.0470
-- = 4.7 %). NULL = no override; fall back to HS code.
--
-- Historical snapshots on purchase_order_lines.tariff_pct are NOT
-- changed by setting an override — frozen-at-purchase rule still
-- applies. Only new lines pick up the override.

ALTER TABLE parts
  ADD COLUMN IF NOT EXISTS tariff_pct_override NUMERIC;

COMMENT ON COLUMN parts.tariff_pct_override IS
  'Optional per-part tariff override. When set, takes precedence over the part''s HS code tariff_pct in new PO line snapshots. NULL = use HS code. Stored as decimal fraction (0.0470 = 4.7 %), same shape as hs_codes.tariff_pct.';

-- ============================================================================
-- 18 — currencies.sort_order
-- ============================================================================
-- Adds an ordering hint so DKK / EUR / USD lead every currency picker, with
-- the rest alphabetised behind them. Matches the convention other
-- controlled-vocab tables already use (colors, vat_codes, segments).
-- ============================================================================

ALTER TABLE currencies
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;

-- Pinned top three.
UPDATE currencies SET sort_order = 10 WHERE code = 'DKK';
UPDATE currencies SET sort_order = 20 WHERE code = 'EUR';
UPDATE currencies SET sort_order = 30 WHERE code = 'USD';

COMMENT ON COLUMN currencies.sort_order IS
  'Display order in pickers. DKK=10 / EUR=20 / USD=30 are pinned to the
   top; everything else defaults to 100 and falls back to code asc.';

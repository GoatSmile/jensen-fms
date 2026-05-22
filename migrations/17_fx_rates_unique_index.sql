-- ============================================================================
-- 17 — fx_rates: unique index for upsert + source default
-- ============================================================================
-- Adds a unique constraint on (from_currency, to_currency, rate_date) so the
-- daily refresh + on-demand fetch can use INSERT ... ON CONFLICT DO UPDATE
-- without race conditions, and so a single (currency, day) pair can only
-- ever resolve to one rate.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fx_rates_pair_date
  ON fx_rates (from_currency, to_currency, rate_date);

COMMENT ON INDEX uniq_fx_rates_pair_date IS
  'Allows upsert on (from, to, date). One rate per currency pair per day.';

-- ============================================================================
-- 15 — Clear stale default_purchase_price on supplier offerings
-- ============================================================================
-- The original Excel import (migration 03) populated
-- part_supplier_offerings.default_purchase_price from the spreadsheet's
-- `price` column. Per Dennis's reinterpretation, that column is the unit
-- price paid on a historical PO, NOT a supplier's forward-looking quote.
-- The two are conceptually different — quotes change between orders.
--
-- This migration NULLs out both default_purchase_price and
-- default_purchase_currency on every existing offering so the column
-- shows "—" in the UI until a quote is deliberately entered.
--
-- Offerings themselves are preserved (supplier ↔ part mapping is still
-- valid); only the dollar/euro/krone amount is cleared.
-- ============================================================================

UPDATE part_supplier_offerings
SET default_purchase_price    = NULL,
    default_purchase_currency = NULL,
    updated_at                = NOW();

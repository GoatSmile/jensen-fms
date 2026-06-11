-- 35_retail_backfill_and_last_cost_fix.sql
-- Two related changes:
--
-- 1. BUG FIX: v_part_last_cost predates migration 23 (anti-dumping) and
--    still computed unit_price × fx × (1 + transport + tariff) — silently
--    EXCLUDING anti-dumping on the 6 affected parts. Recreate it on top of
--    the GENERATED landed_cost_dkk_per_unit column so it can never drift
--    from the canonical landed-cost formula again.
--
-- 2. Retail backfill: every part gets a manually-overridable retail price,
--    seeded as landed cost × 1.12 (12% markup, owner's call 2026-06-11),
--    rounded to whole kroner. Only fills NULLs — hand-set prices are never
--    touched. Parts with no purchase history stay NULL.
CREATE OR REPLACE VIEW v_part_last_cost AS
SELECT DISTINCT ON (pol.part_id)
  pol.part_id,
  pol.landed_cost_dkk_per_unit AS last_cost_dkk,
  pol.quantity                 AS last_purchase_quantity,
  po.order_date                AS last_order_date
FROM purchase_order_lines pol
JOIN purchase_orders po ON po.id = pol.purchase_order_id
ORDER BY pol.part_id, po.order_date DESC, pol.created_at DESC;

UPDATE parts p
SET default_retail_price    = round(c.last_cost_dkk * 1.12),
    default_retail_currency = 'DKK'
FROM v_part_last_cost c
WHERE c.part_id = p.id
  AND p.default_retail_price IS NULL
  AND c.last_cost_dkk IS NOT NULL;

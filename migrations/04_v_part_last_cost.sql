-- ============================================================================
-- 04 — v_part_last_cost view
-- Run AFTER 03_migrate_excel_data.sql
-- ============================================================================
--
-- Adds a single-row-per-part view exposing the most recent landed purchase
-- cost in DKK, plus the qty of that purchase (used downstream to compute
-- the "low stock" badge threshold on the parts list).
--
-- Formula:           unit_price * fx_rate_to_dkk * transport_factor
-- "Most recent" by:  purchase_orders.order_date DESC, then pol.created_at DESC
--                    as a deterministic tiebreaker.
--
-- Note: purchase_order_lines already exposes a generated column
-- `landed_cost_dkk_per_unit` with the same formula. We spell it out here so
-- the view is self-documenting and decoupled from the generated column's
-- definition — if the cost formula ever changes, both definitions need to
-- be updated together.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_part_last_cost AS
SELECT DISTINCT ON (pol.part_id)
    pol.part_id,
    pol.unit_price * pol.fx_rate_to_dkk * pol.transport_factor AS last_cost_dkk,
    pol.quantity                                                AS last_purchase_quantity,
    pol.currency                                                AS last_purchase_currency,
    po.order_date                                               AS last_order_date,
    po.id                                                       AS last_purchase_order_id
FROM public.purchase_order_lines pol
JOIN public.purchase_orders      po  ON po.id = pol.purchase_order_id
ORDER BY pol.part_id, po.order_date DESC NULLS LAST, pol.created_at DESC;

COMMENT ON VIEW public.v_part_last_cost IS
    'One row per part with the most recent landed purchase cost (DKK) and qty. '
    'Used by the parts list to display "Last cost" and to compute the '
    'low-stock threshold (≤20% of last_purchase_quantity).';

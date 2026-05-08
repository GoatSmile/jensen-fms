-- ============================================================================
-- 06 — v_parts_dashboard
-- ============================================================================
-- One row per part with everything the /parts list needs: aggregated stock,
-- last landed cost, computed stock-status, supplier count, primary supplier.
--
-- Replaces the in-memory aggregation/filtering/pagination in the app code.
-- Querying via PostgREST is now `from('v_parts_dashboard').select('*',
-- { count: 'exact' })` with chained filters/order/range — one round trip,
-- consistent pagination, and shareable filtered URLs.
--
-- The `stock_status` heuristic mirrors `src/lib/parts/stock.ts` for v1: this
-- gets replaced by `parts.reorder_point` in migration 07.
-- ============================================================================

DROP VIEW IF EXISTS v_parts_dashboard;

CREATE VIEW v_parts_dashboard AS
SELECT
    p.id,
    p.internal_sku,
    p.name_en,
    p.name_da,
    p.description_en,
    p.description_da,
    p.category_id,
    p.deleted_at,
    cat.name_en          AS category_name,
    COALESCE(stock.qty, 0)::numeric  AS stock_on_hand,
    cost.last_cost_dkk,
    cost.last_purchase_quantity,
    cost.last_order_date,
    CASE
        WHEN COALESCE(stock.qty, 0) <= 0
            THEN 'out'
        WHEN cost.last_purchase_quantity > 0
             AND COALESCE(stock.qty, 0) <= cost.last_purchase_quantity * 0.2
            THEN 'low'
        ELSE 'ok'
    END                  AS stock_status,
    COALESCE(sup_count.n, 0)::integer AS supplier_count,
    primary_sup.name     AS primary_supplier_name
FROM parts p
LEFT JOIN part_categories cat ON cat.id = p.category_id
LEFT JOIN (
    SELECT part_id, SUM(quantity_on_hand) AS qty
    FROM v_current_stock
    GROUP BY part_id
) stock ON stock.part_id = p.id
LEFT JOIN v_part_last_cost cost ON cost.part_id = p.id
LEFT JOIN (
    SELECT part_id, COUNT(*) AS n
    FROM part_supplier_offerings
    GROUP BY part_id
) sup_count ON sup_count.part_id = p.id
LEFT JOIN LATERAL (
    SELECT s.name
    FROM part_supplier_offerings o
    JOIN suppliers s ON s.id = o.supplier_id
    WHERE o.part_id = p.id
    ORDER BY o.is_preferred DESC, s.name ASC
    LIMIT 1
) primary_sup ON true;

COMMENT ON VIEW v_parts_dashboard IS
  'One row per part with aggregated stock, last cost, computed stock_status, supplier count, and primary supplier name. Used by /parts.';

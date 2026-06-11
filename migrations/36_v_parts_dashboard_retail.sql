-- ============================================================================
-- 36 — v_parts_dashboard: expose default retail price
-- ============================================================================
-- The /parts list now shows the customer-facing retail price as its last
-- column (replacing "Last paid"), so the view needs the part's
-- default_retail_price/currency for display and SQL-side sorting.
-- Columns are appended, so CREATE OR REPLACE is enough — every existing
-- column keeps its position and type.
-- ============================================================================

CREATE OR REPLACE VIEW v_parts_dashboard AS
SELECT
    p.id,
    p.internal_sku,
    p.name_en,
    p.name_da,
    p.description_en,
    p.description_da,
    p.category_id,
    p.deleted_at,
    p.reorder_point,
    p.reorder_quantity,
    cat.name_en          AS category_name,
    COALESCE(stock.qty, 0)::numeric  AS stock_on_hand,
    cost.last_cost_dkk,
    cost.last_purchase_quantity,
    cost.last_order_date,
    CASE
        WHEN COALESCE(stock.qty, 0) <= 0
            THEN 'out'
        WHEN p.reorder_point IS NOT NULL
             AND COALESCE(stock.qty, 0) <= p.reorder_point
            THEN 'low'
        WHEN p.reorder_point IS NULL
             AND cost.last_purchase_quantity > 0
             AND COALESCE(stock.qty, 0) <= cost.last_purchase_quantity * 0.2
            THEN 'low'
        ELSE 'ok'
    END                  AS stock_status,
    COALESCE(sup_count.n, 0)::integer AS supplier_count,
    primary_sup.name     AS primary_supplier_name,
    p.default_retail_price,
    p.default_retail_currency
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
  'One row per part with aggregated stock, last cost (additive landed formula), computed stock_status, supplier count, primary supplier name, and default retail price. Used by /parts.';

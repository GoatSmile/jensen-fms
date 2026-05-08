-- ============================================================================
-- 07 — Reorder points
-- ============================================================================
-- Adds explicit reorder thresholds to parts and updates v_parts_dashboard so
-- stock_status uses them when present, falling back to the 20%-of-last-
-- purchase heuristic from migration 06 when they are not set.
--
-- reorder_point     — at-or-below this on-hand level the part is "low"
-- reorder_quantity  — suggested order quantity when reordering (informational
--                     for now; future "reorder now" actions will round to MOQ)
-- ============================================================================

ALTER TABLE parts
  ADD COLUMN IF NOT EXISTS reorder_point    NUMERIC(10,3)
    CHECK (reorder_point IS NULL OR reorder_point >= 0),
  ADD COLUMN IF NOT EXISTS reorder_quantity NUMERIC(10,3)
    CHECK (reorder_quantity IS NULL OR reorder_quantity >= 0);

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
        -- Explicit reorder point wins when set.
        WHEN p.reorder_point IS NOT NULL
             AND COALESCE(stock.qty, 0) <= p.reorder_point
            THEN 'low'
        -- Fall back to the heuristic only when no explicit point is set.
        WHEN p.reorder_point IS NULL
             AND cost.last_purchase_quantity > 0
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
  'One row per part with aggregated stock, last cost, computed stock_status (using parts.reorder_point when set, else the 20%-of-last-purchase heuristic), supplier count, and primary supplier name. Used by /parts.';

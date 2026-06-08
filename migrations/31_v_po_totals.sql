-- 31_v_po_totals.sql
-- Computed PO totals from the lines, so the list never relies on the stored
-- (and often-null for imported POs) total_amount cache. Consistent with the
-- "current stock is a query, never a stored field" rule. landed_total_dkk
-- uses the GENERATED landed_cost_dkk_per_unit, so it includes transport,
-- tariff and anti-dumping, unified in DKK regardless of the order currency.
CREATE OR REPLACE VIEW v_po_totals AS
SELECT
  l.purchase_order_id,
  count(*)                                      AS line_count,
  sum(l.quantity * l.landed_cost_dkk_per_unit)  AS landed_total_dkk
FROM purchase_order_lines l
GROUP BY l.purchase_order_id;

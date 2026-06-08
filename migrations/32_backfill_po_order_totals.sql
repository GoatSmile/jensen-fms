-- 32_backfill_po_order_totals.sql
-- One-time backfill of the order-currency total on imported POs. These came
-- in via the spreadsheet migration without total_amount/total_currency, so
-- the detail page's "Order total" showed "—" (the landed DKK total is
-- computed from lines and was unaffected). Mirrors recomputePOTotal in
-- manage-lines.ts: pick the PO's dominant line currency, then sum
-- quantity × unit_price for the lines in that currency. Idempotent — only
-- touches POs whose total_amount is still NULL.
WITH po_cur AS (
  SELECT purchase_order_id,
         mode() WITHIN GROUP (ORDER BY currency) AS cur
  FROM purchase_order_lines
  GROUP BY purchase_order_id
),
po_sum AS (
  SELECT l.purchase_order_id, c.cur,
         round(sum(l.quantity * l.unit_price)
               FILTER (WHERE l.currency = c.cur), 4) AS total
  FROM purchase_order_lines l
  JOIN po_cur c ON c.purchase_order_id = l.purchase_order_id
  GROUP BY l.purchase_order_id, c.cur
)
UPDATE purchase_orders po
SET total_currency = s.cur,
    total_amount   = s.total
FROM po_sum s
WHERE po.id = s.purchase_order_id
  AND po.total_amount IS NULL;

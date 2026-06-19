-- 38_po_unit_price_nullable.sql
-- Dennis often orders parts before the supplier has quoted a price (the last
-- purchase may be years old). A purchase order goes out as a "request"; the
-- prices arrive on the supplier's order confirmation and are entered afterward.
-- So a PO line must be allowed to carry a blank unit price.
--
-- The GENERATED landed_cost_dkk_per_unit column references unit_price; when
-- unit_price is NULL the generated value is simply NULL (Postgres allows this —
-- the generated column itself has no NOT NULL constraint). Downstream behaviour
-- already degrades cleanly:
--   * v_po_totals uses SUM(), which ignores NULL landed costs, so a PO total is
--     a partial sum over the lines that DO have a price.
--   * Receiving is blocked in app code until a line has a price, because the
--     inventory cost basis (inventory_movements.unit_cost_dkk) is stamped from
--     landed_cost_dkk_per_unit and must not be NULL.
ALTER TABLE purchase_order_lines
  ALTER COLUMN unit_price DROP NOT NULL;

COMMENT ON COLUMN purchase_order_lines.unit_price IS
  'Supplier unit price in the line currency. Nullable: a PO request can be created/sent before the price is known; the price is filled in from the order confirmation before the PO is received.';

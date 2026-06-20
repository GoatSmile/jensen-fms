-- Link a paint order back to the sales order it was batched from (Tier 2
-- Phase C / decision D3). The "paint from SO" flow picks a SUBSET of an SO's
-- frames into a paint order and records the SO here so both sides cross-link:
-- the SO detail lists its paint orders, the paint order links back to the SO.
--
-- Optional / nullable — ad-hoc paint orders (the existing /paint-orders/new
-- flow) carry no SO and stay NULL. ON DELETE SET NULL so a paint order, which
-- references real bikes + cost, survives if its SO is ever hard-deleted (SOs
-- are normally cancelled via status, not deleted, but be defensive).
ALTER TABLE paint_orders
  ADD COLUMN IF NOT EXISTS sales_order_id UUID
    REFERENCES sales_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_paint_orders_sales_order_id
  ON paint_orders(sales_order_id);

COMMENT ON COLUMN paint_orders.sales_order_id IS
  'Optional link to the sales order this paint batch was created from (Tier 2 Phase C / D3). NULL for ad-hoc paint orders. Subset of the SO''s frames; both sides cross-link.';

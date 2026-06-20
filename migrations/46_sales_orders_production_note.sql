-- Build-floor labeling note (Tier 2 Phase D, Dennis call item 16). A free-text
-- instruction to the workshop floor that travels with every bike built for this
-- sales order — e.g. "apply Copenhagen kommune asset stickers, fleet numbers
-- 100–150" for a service-contract municipality. Distinct from sales_orders.notes
-- (internal/commercial); this one is tech-facing and surfaced on the /work build
-- card + the per-bike build workbench (bike → manufacturing_order → sales_order).
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS production_note TEXT;

COMMENT ON COLUMN sales_orders.production_note IS
  'Build-floor labeling/production instruction (Tier 2 Phase D). Surfaced to technicians on the /work build card + build workbench for every bike whose MO links to this SO. Distinct from notes (internal/commercial).';

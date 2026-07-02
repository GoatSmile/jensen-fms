-- 51_paint_line_color_scope.sql
-- Per-line colour + scope on paint_order_bikes (owner request, 2026-07-02):
--   * different frames in ONE paint order can be different colours
--   * each frame carries a paint SCOPE that drives the JP-lak price:
--       std  = frame + fork
--       svaj = frame + fork + front carrier + mudguards + sign + stays
--
-- paint_orders.color_id is demoted from the batch's only colour to an optional
-- batch DEFAULT that pre-fills new lines; the per-line paint_order_bikes.color_id
-- is now the source of truth. Existing lines are backfilled from their order's
-- header colour so historical orders keep their colour.

alter table paint_order_bikes
  add column if not exists color_id uuid references colors (id),
  add column if not exists scope text
    check (scope is null or scope in ('std', 'svaj'));

-- Backfill each existing line from its order's (old, mandatory) header colour.
update paint_order_bikes pob
set color_id = po.color_id
from paint_orders po
where pob.paint_order_id = po.id
  and pob.color_id is null;

-- Header colour is now optional (a batch default), not the mandatory batch colour.
alter table paint_orders
  alter column color_id drop not null;

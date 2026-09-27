-- 105 — a part sold on a sales order leaves stock: movement type `sold`
--
-- Dennis, 15 Sep (01:52:54): an extra battery or charger goes on the sales
-- order. A sales-order line can already be a PART, but delivering the order
-- never touched inventory — only template lines have a build that consumes
-- stock — so every extra battery sold stayed on the shelf in the books.
--
-- From now on the SO's `ready → delivered` transition writes one outbound
-- movement per part line: quantity_delta = −qty, cost inherited from the
-- prevailing figure (basis `derived`, like every outbound movement), with
-- source_entity_type = 'sales_order_line' so the ledger traces back to it.
-- `delivered` is terminal, so this happens once per order.
--
-- A type of its own rather than `adjustment` or `disposed`: a sale is neither
-- a recount nor a write-off, and the ledger should say what happened (the
-- same reasoning as `paint_out` / `paint_in`, migration 91).

alter type public.inventory_movement_type add value if not exists 'sold';

insert into public.schema_migrations (version, name)
  values (105, '105_sold_movement') on conflict (version) do nothing;

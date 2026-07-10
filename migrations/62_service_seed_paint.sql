-- 62: seed the paint service vocabulary + the SIK 2026 price list, and
-- retire the JP-lak service SKUs.
--
-- Source: SIK_Jensen Priser 2026.xlsx (analyzed 2026-07-09, see
-- docs/plan-july9-vacation-month.md) — 8 part types × 3 qty tiers
-- (1–9 / 10–19 / 20+), DKK per piece, column "PRIS pr. 1. juni 2026"
-- authoritative. Prices assumed EX MOMS (B2B convention; Dennis asked).
-- The list is attached to Metacoat A/S — the file says "SIK" but no such
-- supplier exists and the owner's call (2026-07-10) is to stick with
-- Metacoat until Dennis confirms what SIK means. If it turns out to be a
-- different painter, re-point service_price_lists.supplier_id — cheap.
--
-- JP-lak retirement: the six Lakering SKUs priced paint per bike bundled
-- with a volume tier; per-part-type price lists replace them. Contrary to
-- the old "service SKUs never accumulate movements" rule they HAD ledger
-- entries (a received +1 each, 8 build consumptions, net on-hand -2), sat
-- on 5 template recipes (7 rows) and 3 un-consumed bike_parts rows. Order:
-- recipes cleaned, ledger zeroed ADDITIVELY (adjustment movements — history
-- is never deleted), then the parts soft-delete. Consumed bike_parts rows,
-- closed-MO recipe rows, and historical PO lines stay frozen.

-- ── the 8 part types on the painter's list ─────────────────────────────────

insert into public.service_part_types (slug, name_en, name_da, sort_order)
values
  ('stel', 'Frame', 'Stel', 10),
  ('forgaffel', 'Fork', 'Forgaffel', 20),
  ('lad', 'Cargo bed', 'Lad', 30),
  ('skaerm_stivere', 'Mudguards + stays', 'Skærm og stivere', 40),
  ('kaedeskaerm', 'Chain guard', 'Kædeskærm', 50),
  ('kurv', 'Basket', 'Kurv', 60),
  ('skilt', 'Sign', 'Skilt', 70),
  ('bagagebaerer', 'Rear carrier', 'Bagagebærer', 80)
on conflict (slug) do nothing;

-- ── the SIK 2026 list on Metacoat ───────────────────────────────────────────

insert into public.service_price_lists
  (supplier_id, service_type_id, name, currency, effective_from, version, is_current)
select s.id, st.id, 'SIK priser 2026', 'DKK', date '2026-06-01', 1, true
from public.suppliers s, public.service_types st
where s.name = 'Metacoat A/S' and s.deleted_at is null
  and st.slug = 'painting';

insert into public.service_price_items
  (price_list_id, service_part_type_id, supplier_item_no, tier_min, tier_max, unit_price)
select pl.id, pt.id, v.item_no, v.tier_min, v.tier_max, v.unit_price
from (values
  ('stel',           'J.Jensen Stel1',    1,  9,                365.00),
  ('stel',           'J.Jensen Stel10',   10, 19,               250.00),
  ('stel',           'J.Jensen Stel20',   20, null::integer,    175.00),
  ('forgaffel',      'J.Jensen FG1',      1,  9,                 70.00),
  ('forgaffel',      'J.Jensen FG10',     10, 19,                60.00),
  ('forgaffel',      'J.Jensen FG20',     20, null,              50.00),
  ('lad',            'J.Jensen Lad1',     1,  9,                185.00),
  ('lad',            'J.Jensen Lad10',    10, 19,               130.00),
  ('lad',            'J.Jensen Lad20',    20, null,             110.00),
  ('skaerm_stivere', 'J.Jensen S1',       1,  9,                130.00),
  ('skaerm_stivere', 'J.Jensen S10',      10, 19,               125.00),
  ('skaerm_stivere', 'J.Jensen S20',      20, null,             120.00),
  ('kaedeskaerm',    'J.Jensen KS1',      1,  9,                 90.00),
  ('kaedeskaerm',    'J.Jensen KS10',     10, 19,                80.00),
  ('kaedeskaerm',    'J.Jensen KS20',     20, null,              75.00),
  ('kurv',           'J.Jensen KU1',      1,  9,                185.00),
  ('kurv',           'J.Jensen KU10',     10, 19,               160.00),
  ('kurv',           'J.Jensen KU20',     20, null,             140.00),
  ('skilt',          'J.Jensen Skilt1',   1,  9,                 90.00),
  ('skilt',          'J.Jensen Skilt10',  10, 19,                80.00),
  ('skilt',          'J.Jensen Skilt20',  20, null,              75.00),
  ('bagagebaerer',   'J.Jensen Bag1',     1,  9,                185.00),
  ('bagagebaerer',   'J.Jensen Bag10',    10, 19,               165.00),
  ('bagagebaerer',   'J.Jensen Bag20',    20, null,             150.00)
) as v(part_slug, item_no, tier_min, tier_max, unit_price)
join public.service_part_types pt on pt.slug = v.part_slug
join public.service_price_lists pl
  on pl.name = 'SIK priser 2026' and pl.is_current;

-- ── retire the JP-lak service SKUs ──────────────────────────────────────────

-- 1. Off the template recipes (7 rows, 5 templates): the template's paint
--    cost now comes from the pricing layer, not a phantom BOM line. Without
--    this, dropping the app-side isServiceSku exclusion would flag every
--    such template as perpetually short of "paint stock".
delete from public.bike_template_parts btp
using public.parts p
where p.id = btp.part_id and p.internal_sku ilike 'JP-lak%';

-- 2. Off un-consumed bike_parts rows (3): pre-consumption rows are editable
--    by definition; leaving them would consume phantom paint stock at finish.
--    Consumed rows (inventory_movement_id set) are frozen history and stay.
delete from public.bike_parts bp
using public.parts p
where p.id = bp.part_id and p.internal_sku ilike 'JP-lak%'
  and bp.inventory_movement_id is null;

-- 3. Zero the ledger additively (net on-hand was nonzero — the "service SKUs
--    never accumulate movements" rule had been violated in practice).
insert into public.inventory_movements
  (part_id, location_id, movement_type, quantity_delta, reason)
select v.part_id, v.location_id, 'adjustment', -v.quantity_on_hand,
       'Retired paint service SKU — paint pricing moved to service price lists (migration 62)'
from public.v_current_stock v
join public.parts p on p.id = v.part_id
where p.internal_sku ilike 'JP-lak%' and v.quantity_on_hand <> 0;

-- 4. Soft-delete the six parts (audit trail kept; hidden from all pickers).
update public.parts
set deleted_at = now()
where internal_sku ilike 'JP-lak%' and deleted_at is null;

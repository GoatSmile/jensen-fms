-- 61: service model — painting becomes the first SERVICE TYPE.
--
-- Owner decision 2026-07-09 ("go all the way to service_orders"): outsourced
-- per-part work shares one machine — a supplier takes a batch of part-units,
-- prices come from a supplier-issued tiered price list (revised every year or
-- two), and the bikes are physically away until received back. Painting is
-- the first type; washing / priming / galvanizing / wheel building reuse the
-- same tables when they become real. Full design + the analyzed painter price
-- list: docs/plan-july9-vacation-month.md.
--
-- STRUCTURE ONLY. Migration 62 seeds the paint part-type vocabulary, the
-- "SIK priser 2026" price list (on Metacoat), and retires the JP-lak service
-- SKUs. Routes and nav deliberately KEEP /paint-orders — surfaces are
-- per service type (owner decision); only the machine underneath is generic.

-- ── service_types: what kinds of work exist ────────────────────────────────

create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_da text not null,
  blocks_build boolean not null default false,
  document_type text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.service_types is
  'Kinds of outsourced per-part work (painting, washing, ...). Controlled vocab; each real type gets its own nav surface (e.g. /paint-orders).';
comment on column public.service_types.blocks_build is
  'TRUE = bikes on an open order of this type are physically away, so the build floor is gated (the at-supplier gate). Paint is TRUE.';
comment on column public.service_types.document_type is
  'Key passed to next_document_number(). Painting keeps ''paint_order'' so the PNT-YYYY-NNNN series continues unbroken; future types get their own key.';

-- ── service_part_types: what units the work is done on ─────────────────────

create table if not exists public.service_part_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_da text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.service_part_types is
  'Units of outsourced work (frame, fork, basket, ...). Shared across service types; the painter''s 2026 list prices 8 of these.';

-- ── service_price_lists: whose prices, from when — one row per REVISION ────

create table if not exists public.service_price_lists (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  service_type_id uuid not null references public.service_types(id),
  name text not null,
  currency character(3) not null references public.currencies(code),
  effective_from date,
  version integer not null default 1,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.service_price_lists is
  'Supplier-issued price list, one row per revision (the bike_templates versioning pattern: new revision + is_current flip, never edit-in-place). Hangs off the SUPPLIER — suppliers span countries, each revision carries its own currency.';

create index if not exists idx_service_price_lists_supplier
  on public.service_price_lists (supplier_id);
create index if not exists idx_service_price_lists_type
  on public.service_price_lists (service_type_id);
-- Exactly one current revision per supplier × service type.
create unique index if not exists uq_service_price_lists_current
  on public.service_price_lists (supplier_id, service_type_id)
  where is_current;

-- ── service_price_items: the numbers — one row per list line ───────────────

create table if not exists public.service_price_items (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.service_price_lists(id) on delete cascade,
  service_part_type_id uuid not null references public.service_part_types(id),
  supplier_item_no text,
  tier_min integer not null default 1 check (tier_min >= 1),
  tier_max integer check (tier_max is null or tier_max >= tier_min),
  unit_price numeric(15, 4) not null,
  constraint uq_service_price_items_tier
    unique (price_list_id, service_part_type_id, tier_min)
);

comment on table public.service_price_items is
  'Tiered per-piece prices on a list revision. tier_max NULL = open-ended top tier (e.g. 20+). supplier_item_no is the supplier''s own article number (e.g. "J.Jensen Stel10").';

create index if not exists idx_service_price_items_list
  on public.service_price_items (price_list_id);

-- ── paint_orders → service_orders (promotion, not a new table) ─────────────
-- Live data at cutover: 1 planned order, 0 bike lines — the PNT number series
-- (document_sequences 'paint_order', at 5) is the only history that matters.

alter type public.paint_order_status rename to service_order_status;
alter type public.service_order_status rename value 'sent_to_painter' to 'sent';
alter type public.service_order_status rename value 'at_painter' to 'at_supplier';

alter table public.paint_orders rename to service_orders;
alter table public.service_orders rename column paint_order_number to order_number;

-- Header costing columns from the pre-line model (superseded twice over:
-- per-line scope in 51, now per-item snapshots). paint_part_id points at the
-- JP-lak SKUs that migration 62 retires.
alter table public.service_orders drop column if exists paint_part_id;
alter table public.service_orders drop column if exists unit_cost;
alter table public.service_orders drop column if exists unit_cost_currency;

alter table public.service_orders
  add column if not exists service_type_id uuid references public.service_types(id);

comment on column public.service_orders.color_id is
  'Optional batch-default colour; pre-fills new item lines on paint orders. Not meaningful for colourless service types.';

-- Painting seeded here (not 62) so service_type_id can be NOT NULL from the
-- start; 62 seeds the rest of the vocabulary.
insert into public.service_types
  (slug, name_en, name_da, blocks_build, document_type, sort_order)
values
  ('painting', 'Painting', 'Lakering', true, 'paint_order', 10)
on conflict (slug) do nothing;

update public.service_orders
set service_type_id = (select id from public.service_types where slug = 'painting')
where service_type_id is null;

alter table public.service_orders alter column service_type_id set not null;

create index if not exists idx_service_orders_service_type_id
  on public.service_orders (service_type_id);

-- Constraint / index / trigger hygiene renames.
alter table public.service_orders
  rename constraint paint_orders_pkey to service_orders_pkey;
alter table public.service_orders
  rename constraint paint_orders_paint_order_number_key to service_orders_order_number_key;
alter table public.service_orders
  rename constraint paint_orders_supplier_id_fkey to service_orders_supplier_id_fkey;
alter table public.service_orders
  rename constraint paint_orders_color_id_fkey to service_orders_color_id_fkey;
alter table public.service_orders
  rename constraint paint_orders_sales_order_id_fkey to service_orders_sales_order_id_fkey;
alter index if exists idx_paint_orders_supplier_id rename to idx_service_orders_supplier_id;
alter index if exists idx_paint_orders_color_id rename to idx_service_orders_color_id;
alter index if exists idx_paint_orders_status rename to idx_service_orders_status;
alter index if exists idx_paint_orders_sent_at rename to idx_service_orders_sent_at;
alter index if exists idx_paint_orders_sales_order_id rename to idx_service_orders_sales_order_id;
alter trigger trg_paint_orders_updated_at on public.service_orders
  rename to trg_service_orders_updated_at;

-- ── paint_order_bikes → service_order_bikes ────────────────────────────────

alter table public.paint_order_bikes rename to service_order_bikes;
alter table public.service_order_bikes rename column paint_order_id to service_order_id;

alter table public.service_order_bikes
  rename constraint paint_order_bikes_pkey to service_order_bikes_pkey;
alter table public.service_order_bikes
  rename constraint paint_order_bikes_paint_order_id_fkey to service_order_bikes_service_order_id_fkey;
alter table public.service_order_bikes
  rename constraint paint_order_bikes_bike_id_fkey to service_order_bikes_bike_id_fkey;
alter table public.service_order_bikes
  rename constraint paint_order_bikes_color_id_fkey to service_order_bikes_color_id_fkey;
alter index if exists idx_paint_order_bikes_bike_id rename to idx_service_order_bikes_bike_id;

comment on column public.service_order_bikes.color_id is
  'LEGACY (pre-items model, migration 51): per-bike colour on old paint orders. Read-only history; new orders carry colour on service_order_items.';
comment on column public.service_order_bikes.scope is
  'LEGACY std/svaj scope from the pre-items paint model (migration 51). Read-only history; superseded by service_order_items part-type lines.';

-- ── service_order_items: the commercial lines ──────────────────────────────

create table if not exists public.service_order_items (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  service_part_type_id uuid not null references public.service_part_types(id),
  quantity integer not null check (quantity > 0),
  color_id uuid references public.colors(id),
  -- Snapshot at send (the purchase_order_lines pattern): NULL while planned
  -- (estimates track the supplier's CURRENT list), frozen when the order is
  -- sent. A new price list never rewrites a sent order.
  supplier_item_no text,
  unit_price numeric(15, 4),
  currency character(3) references public.currencies(code),
  fx_rate_to_dkk numeric,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.service_order_items is
  'What a service order buys: part type × qty (× colour for paint). Tier resolution is live while planned; supplier_item_no + unit_price + currency + fx_rate_to_dkk freeze at send.';

create index if not exists idx_service_order_items_order
  on public.service_order_items (service_order_id);

-- Match migration 50: RLS on + permissive anon policy (auth deferred to M1).
-- The renamed tables keep their existing RLS + anon_all automatically.
alter table public.service_types enable row level security;
create policy "anon_all" on public.service_types
  for all to anon using (true) with check (true);
alter table public.service_part_types enable row level security;
create policy "anon_all" on public.service_part_types
  for all to anon using (true) with check (true);
alter table public.service_price_lists enable row level security;
create policy "anon_all" on public.service_price_lists
  for all to anon using (true) with check (true);
alter table public.service_price_items enable row level security;
create policy "anon_all" on public.service_price_items
  for all to anon using (true) with check (true);
alter table public.service_order_items enable row level security;
create policy "anon_all" on public.service_order_items
  for all to anon using (true) with check (true);

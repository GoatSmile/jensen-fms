-- ============================================================================
-- 91 — Painted parts are stock, per part and colour
-- ============================================================================
-- A frame (fork, cargo bed, carrier, mudguard, sign) has three physical states:
-- raw on the shelf, painted on the shelf, built into a bike. The system had the
-- first (a part with stock) and the last (a bike) and faked the middle with a
-- bike-in-planning — which works for a frame painted for an order and breaks
-- for a frame painted for stock, because the order that later uses it spawns
-- its own bikes and nothing can hand the painted frame across.
--
-- The middle state is inventory. A painted part is a PART: a variant of its raw
-- base part in one colour, with its own stock and its own cost (raw cost plus
-- the paint price frozen on the paint-order line). Variants are created lazily,
-- only when something is painted for stock, so the catalogue grows by the
-- colours the shop actually stocks.
--
-- Paint stays a SERVICE TYPE with its own price lists; the variant is the
-- product of that service. Design: docs/plan-painted-parts.md; decision:
-- DECISIONS 2026-09-02. Apply to BOTH databases.

-- Which of the painter's part types a part is — what makes it pickable on a
-- paint-order line and priceable from the tiered list. NULL = not paintable.
alter table public.parts
  add column if not exists service_part_type_id uuid
    references public.service_part_types(id);
comment on column public.parts.service_part_type_id is
  'Paintable as this service part type (frame, fork, …). NULL = the part never goes to the painter.';

-- A painted variant points at its raw base part and its colour; both or neither.
alter table public.parts
  add column if not exists base_part_id uuid references public.parts(id),
  add column if not exists color_id uuid references public.colors(id);
alter table public.parts
  add constraint parts_variant_both_or_neither
    check ((base_part_id is null) = (color_id is null));
create unique index if not exists parts_one_variant_per_base_colour
  on public.parts (base_part_id, color_id)
  where base_part_id is not null;
comment on column public.parts.base_part_id is
  'Set on a PAINTED VARIANT: the raw part this one was painted from. NULL on every base part.';
comment on column public.parts.color_id is
  'Set on a PAINTED VARIANT: the colour it was painted. Pairs with base_part_id.';

-- The specific part a paint-order line is about (the type alone cannot say
-- WHICH frame came back black). Optional: order-tied lines derive it later.
alter table public.service_order_items
  add column if not exists part_id uuid references public.parts(id);
comment on column public.service_order_items.part_id is
  'The specific (raw) part this line paints. Required for stock conversion on received_back; NULL means "some part of this type".';

-- The two ledger events of a conversion. Not `adjustment`: a transformation
-- is not a recount, and the ledger should say what happened.
alter type public.inventory_movement_type add value if not exists 'paint_out';
alter type public.inventory_movement_type add value if not exists 'paint_in';

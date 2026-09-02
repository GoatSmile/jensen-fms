-- 97 · A painter part type can claim a part category
--
-- `parts.service_part_type_id` ("Paintable as") carries two facts at once: does
-- this part go to the painter, and what does the painter call it. The second
-- earns its keep — Metacoat prices per part TYPE in quantity tiers, so without
-- it a paint-order line cannot be priced and a template's paintwork cannot be
-- costed. The first is mostly inferable from the part's CATEGORY, and asking a
-- human to restate it 200 times is why it never got filled in: 15 declared
-- paintwork lines across current templates, 2 backed by a marked part
-- (2026-09-02), and an MO that answered "all covered" for a bike whose template
-- sends four things to the painter.
--
-- So a type may claim a category, and new parts inherit from it. Unique per
-- category — two types claiming "Frames" would make the default ambiguous, and
-- an ambiguous default is worse than none.
--
-- The mapping is a DEFAULT GENERATOR, not a live lookup: the resolved value is
-- still stored on the part. Re-filing a part into another category must not
-- retroactively change what it is to the painter, because painted variants,
-- their frozen costs and priced paint-order lines all hang off the stored id.
alter table service_part_types
  add column if not exists default_category_id uuid
    references part_categories(id) on delete set null;

create unique index if not exists uq_service_part_types_default_category
  on service_part_types (default_category_id)
  where default_category_id is not null;

comment on column service_part_types.default_category_id is
  'Parts filed under this category are this painter type by default. A generator for new parts and for the one-shot apply action — never read in place of parts.service_part_type_id.';

-- The third state. Today a NULL type means BOTH "nobody has said" (200 parts)
-- and "this is never painted" (a stainless frame, an SKS mudguard bought
-- black). The apply action has to tell them apart or it would re-mark the
-- exceptions every time it ran, so the deliberate "no" gets its own column.
alter table parts
  add column if not exists paint_exempt boolean not null default false;

comment on column parts.paint_exempt is
  'Deliberately never painted — stainless, or pre-finished by the supplier. Distinct from a NULL service_part_type_id, which only means nobody has decided; the category apply action skips exempt parts and fills the undecided ones.';

-- A part cannot be both painted and exempt from painting.
alter table parts drop constraint if exists parts_paint_exempt_shape;
alter table parts add constraint parts_paint_exempt_shape
  check (not (paint_exempt and service_part_type_id is not null));

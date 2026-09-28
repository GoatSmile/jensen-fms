-- 108 — identifier rules from the 15 Sep meeting (02:01–02:05; owner 2026-09-28)
--
--   * Frame, battery and charger numbers are unique; NOTHING lock-related is
--     (lock number, battery-lock number). `is_globally_unique` is set to say
--     so, and the unique index now reads the same list — it used to exempt
--     only the recognition code, by a hardcoded id, and ignore the column.
--   * Only ACTIVE identifiers claim their number. Deactivating an identifier
--     (the battery was swapped) used to keep blocking its number forever,
--     because the index was not partial on `is_active`. The app's "already
--     exists — move it here?" (overwrite) relies on this: moving deactivates
--     the old row, then inserts the new one.
--   * The number of identifiers follows the number of parts: an identifier
--     type may name the part CATEGORY it counts (battery → Batteries,
--     charger → Charger), so a bike with two batteries needs two battery
--     numbers (`requiredIdentifierProgress`).
--
-- The index predicate cannot join, so the non-unique type ids are resolved
-- from their slugs here and written into it; a new non-unique type needs a
-- migration that recreates the index (it is a code-level decision anyway).

update public.bike_identifier_types
   set is_globally_unique = false
 where slug in ('lock_number', 'battery_lock_number', 'fleet_number');

do $$
declare
  ids text;
begin
  select string_agg(quote_literal(id::text), ', ' order by id)
    into ids
    from public.bike_identifier_types
   where not is_globally_unique;
  if ids is null then
    raise exception 'no non-unique identifier types found';
  end if;
  execute 'drop index if exists public.uq_bike_identifiers_type_value';
  execute format(
    'create unique index uq_bike_identifiers_type_value
       on public.bike_identifiers (identifier_type_id, identifier_value)
       where is_active and identifier_type_id not in (%s)',
    ids
  );
end $$;

alter table public.bike_identifier_types
  add column if not exists counts_part_category_id uuid
    references public.part_categories(id);

comment on column public.bike_identifier_types.counts_part_category_id is
  'The part category whose quantity on a bike sets how many identifiers of this type it needs (battery → Batteries). NULL = one.';

update public.bike_identifier_types t
   set counts_part_category_id = c.id
  from public.part_categories c
 where (t.slug, c.slug) in (('battery_number', 'battery_system'),
                            ('charger_number', 'charger'));

-- Counting by category needs the category to hold only that thing (the
-- "Paintable as" rule: map only homogeneous categories). Batteries also held
-- JP-BH CWF1, a battery BOX for the rear carrier, which would have asked every
-- bike carrying it for a second battery number. Owner, 2026-09-28: it is filed
-- under Rear Carrier, where it belongs.
update public.parts p
   set category_id = rc.id, updated_at = now()
  from public.part_categories rc, public.part_categories bat
 where rc.slug = 'rear_carrier'
   and bat.slug = 'battery_system'
   and p.category_id = bat.id
   and p.internal_sku = 'JP-BH CWF1';

insert into public.schema_migrations (version, name)
  values (108, '108_identifier_rules') on conflict (version) do nothing;

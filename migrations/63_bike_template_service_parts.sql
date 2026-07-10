-- 63: template paintwork — which service part-units a bike of this template
-- sends to the painter (stel, forgaffel, kurv, ...), with per-bike quantity.
--
-- Drives the template's "cost to paint this bike" estimate, which joins the
-- parts cost in the cost-to-produce + margin box (the 310→710 kr lesson: bad
-- paint estimates ate the hotel-project margin). Estimates resolve against
-- the default painter's CURRENT price list at per-bike quantities (the 1–9
-- tier for singles) — batch pricing happens on the paint order itself, where
-- the real qty is known and the send freezes the snapshot.
--
-- Shape mirrors bike_template_parts: hangs off the template VERSION row
-- (cascade with it), so each version carries its own paintwork declaration;
-- clone-as-version and duplicate copy it forward like the parts recipe.

create table if not exists public.bike_template_service_parts (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.bike_templates(id) on delete cascade,
  service_part_type_id uuid not null references public.service_part_types(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unique (template_id, service_part_type_id)
);

comment on table public.bike_template_service_parts is
  'Per-template paintwork declaration: which service part-units (frame, fork, basket, ...) one bike of this template sends to the painter, and how many. Drives the template cost-to-paint estimate.';

create index if not exists idx_bike_template_service_parts_template
  on public.bike_template_service_parts (template_id);

-- Match migration 50: RLS on + permissive anon policy (auth deferred to M1).
alter table public.bike_template_service_parts enable row level security;
create policy "anon_all" on public.bike_template_service_parts
  for all to anon using (true) with check (true);

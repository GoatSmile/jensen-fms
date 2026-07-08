-- Migration 52: Promote bike_templates.family (free text) to a controlled vocab.
--
-- EXPAND phase of an expand/contract change. Creates the bike_families table,
-- adds bike_templates.family_id (FK), and backfills it from the existing
-- distinct family strings — while KEEPING the family text column so the
-- currently-deployed app (which reads `family`) keeps working. The text column
-- is dropped in migration 53, after the new code (which reads via the join) is
-- deployed. See docs/plan-july2-meeting-backlog.md.

create table if not exists public.bike_families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed from existing distinct family strings, spaced by 10 for easy reordering.
insert into public.bike_families (name, sort_order)
select d.family, (row_number() over (order by d.family)) * 10
from (
  select distinct family
  from public.bike_templates
  where family is not null and btrim(family) <> ''
) d
on conflict (name) do nothing;

alter table public.bike_templates
  add column if not exists family_id uuid references public.bike_families(id);

update public.bike_templates t
set family_id = f.id
from public.bike_families f
where t.family = f.name and t.family_id is null;

-- Match migration 50: RLS on + permissive anon policy (auth deferred to M1).
alter table public.bike_families enable row level security;
create policy "anon_all" on public.bike_families
  for all to anon using (true) with check (true);

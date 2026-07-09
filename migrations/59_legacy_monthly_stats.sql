-- 59: legacy_monthly_stats — pre-system history for the dashboard trend
-- charts (owner green-lit backfill 2026-07-09).
--
-- The live system only started recording operations ~May 2026, so the
-- 12-month charts would stay near-empty for a year. This table holds
-- monthly aggregates from BEFORE the system existed; the RPC adds them on
-- top of live numbers. Rows must only cover pre-system months — a month
-- that has both legacy and live activity would double-count (the initial
-- backfill ends April 2026, live capture starts May 2026, so the boundary
-- is clean).
--
-- Initial backfill source: the owner's legacy Excel service-agreement
-- register ("Bikes and customers.xlsx", 12 anniversary-month sheets), one
-- row per bike with its Købt (bought) date, 2012 → April 2026. That
-- register only covers agreement bikes, so sold counts are a documented
-- UNDERCOUNT of total sales (no one-off/non-agreement sales, no revenue,
-- no serviced counts — those live in e-conomic and can be added to these
-- rows later, by hand or via the 3E integration).

create table if not exists public.legacy_monthly_stats (
  month_start          date primary key
                       check (month_start = date_trunc('month', month_start)::date),
  bikes_sold           integer not null default 0,
  bikes_serviced       integer not null default 0,
  invoiced_sales_dkk   numeric(15, 4) not null default 0,
  invoiced_service_dkk numeric(15, 4) not null default 0,
  invoiced_fees_dkk    numeric(15, 4) not null default 0,
  source               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.legacy_monthly_stats is
  'Pre-system monthly aggregates overlaid onto dashboard_monthly_stats(). Only fill months before live capture began (May 2026) — overlapping months double-count.';

-- Match migration 50: RLS on + permissive anon policy (auth deferred to M1).
alter table public.legacy_monthly_stats enable row level security;
create policy "anon_all" on public.legacy_monthly_stats
  for all to anon using (true) with check (true);

-- Replace the RPC: (1) overlay legacy months, (2) exclude soft-deleted
-- bikes from sold/serviced (test-cleanup leftovers were counting).
create or replace function public.dashboard_monthly_stats()
returns table (
  month_start date,
  bikes_sold integer,
  bikes_serviced integer,
  bikes_under_agreement integer,
  invoiced_sales_dkk numeric,
  invoiced_service_dkk numeric,
  invoiced_fees_dkk numeric
)
language sql
stable
set search_path = ''
as $$
with months as (
  select gs::date as month_start,
         (gs + interval '1 month' - interval '1 day')::date as month_end
  from generate_series(
    date_trunc('month', (now() at time zone 'Europe/Copenhagen'))::date
      - interval '11 months',
    date_trunc('month', (now() at time zone 'Europe/Copenhagen'))::date,
    interval '1 month'
  ) gs
),
sold as (
  select date_trunc('month', l.occurred_at at time zone 'Europe/Copenhagen')::date as m,
         count(distinct l.bike_id)::integer as n
  from public.bike_state_log l
  join public.bikes b on b.id = l.bike_id and b.deleted_at is null
  where l.to_status = 'assigned' and l.from_status = 'in_stock'
  group by 1
),
serviced as (
  select date_trunc('month', w.completed_at at time zone 'Europe/Copenhagen')::date as m,
         count(distinct w.bike_id)::integer as n
  from public.work_orders w
  join public.bikes b on b.id = w.bike_id and b.deleted_at is null
  where w.status = 'completed' and w.completed_at is not null
  group by 1
),
under_agreement as (
  select m.month_start as m, count(distinct b.id)::integer as n
  from months m
  join public.service_agreements a
    on a.status <> 'cancelled'
   and a.start_date <= m.month_end
   and (a.end_date is null or a.end_date >= m.month_start)
  join public.bikes b
    on b.owner_organization_id = a.organization_id
   and (a.organization_unit_id is null or b.owner_unit_id = a.organization_unit_id)
   and b.deleted_at is null
   and b.status not in ('retired', 'lost_or_stolen')
  where exists (
    select 1 from public.bike_state_log l
    where l.bike_id = b.id
      and l.to_status = 'assigned'
      and (l.occurred_at at time zone 'Europe/Copenhagen')::date <= m.month_end
  )
  group by 1
),
invoiced as (
  select date_trunc('month', i.issued_date)::date as m,
         coalesce(sum(il.line_subtotal)
           filter (where il.service_agreement_id is null
                     and i.sales_order_id is not null), 0) as sales,
         coalesce(sum(il.line_subtotal)
           filter (where il.service_agreement_id is null
                     and i.sales_order_id is null), 0) as service,
         coalesce(sum(il.line_subtotal)
           filter (where il.service_agreement_id is not null), 0) as fees
  from public.invoices i
  join public.invoice_lines il on il.invoice_id = i.id
  where i.issued_date is not null
    and i.status not in ('draft', 'cancelled')
    and i.currency = 'DKK'
  group by 1
)
select
  m.month_start,
  coalesce(s.n, 0) + coalesce(leg.bikes_sold, 0),
  coalesce(sv.n, 0) + coalesce(leg.bikes_serviced, 0),
  coalesce(ua.n, 0),
  coalesce(inv.sales, 0) + coalesce(leg.invoiced_sales_dkk, 0),
  coalesce(inv.service, 0) + coalesce(leg.invoiced_service_dkk, 0),
  coalesce(inv.fees, 0) + coalesce(leg.invoiced_fees_dkk, 0)
from months m
left join sold s on s.m = m.month_start
left join serviced sv on sv.m = m.month_start
left join under_agreement ua on ua.m = m.month_start
left join invoiced inv on inv.m = m.month_start
left join public.legacy_monthly_stats leg on leg.month_start = m.month_start
order by m.month_start;
$$;

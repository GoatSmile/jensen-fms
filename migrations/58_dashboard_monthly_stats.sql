-- 58: dashboard_monthly_stats() — one RPC feeding the dashboard trend charts.
--
-- Returns the last 12 calendar months (Europe/Copenhagen buckets, oldest
-- first), one row per month:
--   bikes_sold            distinct bikes delivered that month (bike_state_log
--                         in_stock -> assigned transitions; slating and
--                         reassignment don't transition, so they don't count)
--   bikes_serviced        distinct bikes with a completed work order
--   bikes_under_agreement fleet covered by a service agreement at month end.
--                         APPROXIMATION, documented: ownership changes are
--                         overwritten in place (no ownership history), so the
--                         CURRENT owner is projected back in time; a bike
--                         counts from its first delivery onwards while the
--                         owner's agreement was active. Retired/lost bikes
--                         drop out of all months (retirement date not
--                         consulted). Good enough for a trend line; revisit
--                         if ownership churn ever becomes real.
--   invoiced_*_dkk        line_subtotal (ex VAT) of issued invoices by
--                         issued_date, DKK only (non-DKK invoices are
--                         excluded rather than mixed — add FX if non-DKK
--                         invoicing ever grows). Credit notes carry negative
--                         lines and net out in the month they are issued.
--                         Split: fees = lines with service_agreement_id;
--                         sales = other lines on SO-linked invoices;
--                         service = the rest (work orders, manual).

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
  where l.to_status = 'assigned' and l.from_status = 'in_stock'
  group by 1
),
serviced as (
  select date_trunc('month', w.completed_at at time zone 'Europe/Copenhagen')::date as m,
         count(distinct w.bike_id)::integer as n
  from public.work_orders w
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
  coalesce(s.n, 0),
  coalesce(sv.n, 0),
  coalesce(ua.n, 0),
  coalesce(inv.sales, 0),
  coalesce(inv.service, 0),
  coalesce(inv.fees, 0)
from months m
left join sold s on s.m = m.month_start
left join serviced sv on sv.m = m.month_start
left join under_agreement ua on ua.m = m.month_start
left join invoiced inv on inv.m = m.month_start
order by m.month_start;
$$;

comment on function public.dashboard_monthly_stats() is
  'Last 12 months of dashboard trend data: bikes sold/serviced/under agreement + invoiced DKK split by source. See migration 58 for the documented approximations.';

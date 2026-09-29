-- 110 — service agreements per BIKE, and the documents behind them
--
-- Owner go-ahead 2026-09-29 (DECISIONS 2026-09-29; brief
-- BRIEF-SERVICE-AGREEMENTS-2026-09, handling SERVICE-AGREEMENTS-HANDLING-2026-09).
--
-- An agreement is the DOCUMENT with a customer (optionally one department);
-- each covered bike is a LINE on it with its own start date (the anniversary),
-- its own frozen yearly price and GPS add-on, ended with a reason. Coverage is
-- "the bike has an active line on an active agreement" — it no longer follows
-- ownership, because in one department some bikes are covered and some are
-- not.
--
--   * `service_agreement_bikes` — the lines. A bike is on at most ONE active
--     line (partial unique index). Ended lines stay: "we had an agreement until
--     some year" is what a customer says on the phone, and a 0-kr register row
--     imports as exactly that (Dennis, 29 Sep).
--   * `service_agreement_documents` — a signed paper, uploaded from the
--     customer's page (phone photos or a PDF). It belongs to the CUSTOMER until
--     Dennis confirms it, and to an agreement after. The model's reading is
--     stored as it came back; nothing is written from it until a person
--     confirms. The pages are `attachments` rows (entity_type
--     'service_agreement_document') in the PRIVATE bucket below.
--   * `service_agreements.contract_type` — K1/K3/K5/K10 = the years committed,
--     for agreements from now on; NULL for the untyped existing ones (Dennis,
--     29 Sep). Plus `signed_on` and `signatories` from the paper.
--   * `work_orders.covered_by_service_agreement_bike_id` — which LINE covered a
--     repair, next to the agreement stamp that already exists.
--   * BACKFILL: every active agreement gets lines for the bikes it covers today
--     under the ownership rule, so coverage does not jump at the switch.
--   * `dashboard_monthly_stats()` counts lines instead of owned bikes.

-- ---------------------------------------------------------------- agreement

alter table public.service_agreements
  add column if not exists contract_type text
    check (contract_type in ('K1', 'K3', 'K5', 'K10')),
  add column if not exists signed_on date,
  add column if not exists signatories text;

comment on column public.service_agreements.contract_type is
  'K1/K3/K5/K10 = the number of years the customer commits to. NULL for agreements that were never typed (the existing, mostly verbal ones).';
comment on column public.service_agreements.signed_on is
  'The date on the signed paper; NULL for a verbal agreement.';

-- ---------------------------------------------------------------- lines

create table if not exists public.service_agreement_bikes (
  id                   uuid primary key default gen_random_uuid(),
  agreement_id         uuid not null references public.service_agreements(id) on delete cascade,
  bike_id              uuid not null references public.bikes(id),
  start_date           date not null,
  yearly_price         numeric(15, 4),
  currency             char(3) references public.currencies(code),
  has_gps              boolean not null default false,
  status               text not null default 'active'
                       check (status in ('active', 'ended')),
  end_reason           text
                       check (end_reason in ('stolen', 'retired', 'cancelled', 'moved', 'ended')),
  ended_on             date,
  source               text not null default 'manual'
                       check (source in ('document', 'manual', 'import', 'backfill')),
  document_id          uuid,
  import_batch_id      uuid references public.import_batches(id),
  import_row           jsonb,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  last_actor_id        uuid references public.people(id),
  check ((yearly_price is null) = (currency is null)),
  check (status = 'active' or end_reason is not null)
);

comment on table public.service_agreement_bikes is
  'One line per covered bike on a service agreement: its own start date (anniversary), frozen yearly price, GPS. Coverage = an active line on an active agreement.';
comment on column public.service_agreement_bikes.ended_on is
  'When the line ended; NULL on an ended line means the date is not known (e.g. a 0-kr register row).';

create unique index if not exists service_agreement_bikes_one_active
  on public.service_agreement_bikes (bike_id) where status = 'active';
create index if not exists service_agreement_bikes_agreement
  on public.service_agreement_bikes (agreement_id);

alter table public.service_agreement_bikes enable row level security;
drop policy if exists anon_all on public.service_agreement_bikes;
create policy anon_all on public.service_agreement_bikes
  for all to anon using (true) with check (true);

-- ---------------------------------------------------------------- documents

create table if not exists public.service_agreement_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id),
  agreement_id     uuid references public.service_agreements(id) on delete set null,
  status           text not null default 'uploaded'
                   check (status in ('uploaded', 'read', 'failed', 'confirmed')),
  reading          jsonb,
  read_error       text,
  read_model       text,
  read_at          timestamptz,
  confirmed_at     timestamptz,
  confirmed_by     uuid references public.people(id),
  uploaded_by      uuid references public.people(id),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.service_agreement_documents is
  'A signed agreement paper (photos or a PDF). Belongs to the customer until confirmed, then to an agreement. `reading` is the model''s proposal, never applied without a person.';
comment on column public.service_agreement_documents.reading is
  'What the model read off the pages (department, contract type, signed date, signatories, price, GPS, frame numbers) — stored verbatim, parsed defensively.';

create index if not exists service_agreement_documents_org
  on public.service_agreement_documents (organization_id);
create index if not exists service_agreement_documents_agreement
  on public.service_agreement_documents (agreement_id);

alter table public.service_agreement_documents enable row level security;
drop policy if exists anon_all on public.service_agreement_documents;
create policy anon_all on public.service_agreement_documents
  for all to anon using (true) with check (true);

alter table public.service_agreement_bikes
  drop constraint if exists service_agreement_bikes_document_id_fkey;
alter table public.service_agreement_bikes
  add constraint service_agreement_bikes_document_id_fkey
  foreign key (document_id) references public.service_agreement_documents(id) on delete set null;

-- A signed contract is not a public picture: private, read back by signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('agreement-documents', 'agreement-documents', false, 26214400,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- WO stamp

alter table public.work_orders
  add column if not exists covered_by_service_agreement_bike_id uuid
    references public.service_agreement_bikes(id);

comment on column public.work_orders.covered_by_service_agreement_bike_id is
  'The agreement LINE that covered this bike when the work order was created (migration 110).';

-- ---------------------------------------------------------------- backfill

-- What the ownership rule covers today, as lines — a unit-scoped agreement
-- beats an org-wide one, the newest start wins, terminal bikes are skipped.
insert into public.service_agreement_bikes
  (agreement_id, bike_id, start_date, has_gps, source, notes)
select distinct on (b.id)
       a.id, b.id, a.start_date, a.has_gps, 'backfill',
       'Backfilled from ownership at the switch to per-bike lines (migration 110).'
from public.service_agreements a
join public.bikes b
  on b.owner_organization_id = a.organization_id
 and (a.organization_unit_id is null or b.owner_unit_id = a.organization_unit_id)
 and b.deleted_at is null
 and b.status not in ('retired', 'lost_or_stolen')
where a.status = 'active'
  and not exists (
    select 1 from public.service_agreement_bikes x
    where x.bike_id = b.id and x.status = 'active')
order by b.id, (a.organization_unit_id is not null) desc, a.start_date desc;

-- ---------------------------------------------------------------- dashboard

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
-- A bike is under agreement in a month when a line on a non-cancelled
-- agreement overlaps it (migration 110 — lines, not ownership). An ended line
-- with no known end date counts as ended from the start of time.
under_agreement as (
  select m.month_start as m, count(distinct l.bike_id)::integer as n
  from months m
  join public.service_agreement_bikes l
    on l.start_date <= m.month_end
   and (l.status = 'active' or (l.ended_on is not null and l.ended_on >= m.month_start))
  join public.service_agreements a
    on a.id = l.agreement_id
   and a.status <> 'cancelled'
   and a.start_date <= m.month_end
   and (a.end_date is null or a.end_date >= m.month_start)
  join public.bikes b on b.id = l.bike_id and b.deleted_at is null
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

insert into public.schema_migrations (version, name)
  values (110, '110_agreement_bike_lines_and_documents') on conflict (version) do nothing;

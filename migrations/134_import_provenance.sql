-- 134 — every row the register import creates belongs to its batch, and an
-- imported agreement can never feed the fee engine
--
-- WHY. The register import (docs/plan-register-import.md) creates customers,
-- departments, bikes, agreements and lines in ONE batch, and a batch must be
-- listable, checkable and undoable by its id. Migration 102 put provenance on
-- bikes and 110 on agreement LINES; the agreements, departments and customers
-- a batch creates had nowhere to say so (plan §3).
--
--   * `service_agreements.import_batch_id` + `import_row` — the agreement a
--     batch made, and the source facts it was made from (customer sheet,
--     department, EAN). No people's names or phone numbers.
--   * `organization_units.import_batch_id` and `organizations.import_batch_id`
--     — a department or customer the batch CREATED. A matched existing row is
--     never stamped: what the batch fills into it (an EAN, a code) is listed
--     by id in the batch's rollback file instead.
--
-- NOTHING BILLS. The fee engine (`src/lib/invoicing/agreement-fees.ts`) bills
-- `monthly_fee` monthly in arrears from `start_date`; an imported agreement
-- starting in 2013 with a fee would put years of invoices one button press
-- away. The register's price lives on the LINES (`yearly_price`), which only
-- renewal invoicing will bill. So the database itself refuses an imported
-- agreement with a fee, rather than a rule someone has to remember (plan §6).

begin;

alter table public.service_agreements
  add column if not exists import_batch_id uuid references public.import_batches(id),
  add column if not exists import_row jsonb;

comment on column public.service_agreements.import_batch_id is
  'Set only by a data import; NULL for agreements made in the app.';
comment on column public.service_agreements.import_row is
  'The source facts the import made this agreement from (sheet, department, EAN). History only.';

alter table public.service_agreements
  drop constraint if exists service_agreements_imported_no_fee;
alter table public.service_agreements
  add constraint service_agreements_imported_no_fee
  check (import_batch_id is null or monthly_fee is null);

alter table public.organization_units
  add column if not exists import_batch_id uuid references public.import_batches(id);
comment on column public.organization_units.import_batch_id is
  'Set only when a data import CREATED this department; a matched existing one is never stamped.';

alter table public.organizations
  add column if not exists import_batch_id uuid references public.import_batches(id);
comment on column public.organizations.import_batch_id is
  'Set only when a data import CREATED this customer; a matched existing one is never stamped.';

create index if not exists service_agreements_import_batch_id_idx
  on public.service_agreements (import_batch_id) where import_batch_id is not null;
create index if not exists service_agreement_bikes_import_batch_id_idx
  on public.service_agreement_bikes (import_batch_id) where import_batch_id is not null;
create index if not exists organization_units_import_batch_id_idx
  on public.organization_units (import_batch_id) where import_batch_id is not null;
create index if not exists organizations_import_batch_id_idx
  on public.organizations (import_batch_id) where import_batch_id is not null;

insert into public.schema_migrations (version, name)
  values (134, '134_import_provenance') on conflict (version) do nothing;

commit;

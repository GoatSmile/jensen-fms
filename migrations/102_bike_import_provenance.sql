-- 102 — where a bike came from, and the recognition code gets its real name
--
-- WHY. The fleet register (`KOMMUNE og VIRKSOMHEDS OVERSIGT`) holds ~900 bikes
-- that are already out with customers and were never built in this system.
-- They are about to be imported, and "which bikes came from the import?" has
-- to be a QUERY, not an argument: the TEST rule exists because a notes marker
-- (`Jp -test 1`, "fixture") had to be hunted for by hand, and on 2026-09-15 a
-- marker failed to travel to 14 of 20 generated documents. So provenance is a
-- column, not a notes prefix (owner, 2026-09-26).
--
--   * `import_batches` — one row per import run: a stable label, the source,
--     who ran it. A whole batch can be listed, reviewed or rolled back by id.
--   * `bikes.import_batch_id` — NULL for every bike made in the app (built on
--     an MO or recorded at /bikes/new); set only by an import. This is what
--     the "Imported bikes" view filters on.
--   * `bikes.import_row` — the source row, verbatim (minus people's names and
--     phone numbers), so nothing in the register is lost while the schema has
--     no home for it yet (GPS phone, service invoicing dates, department text,
--     EAN, the old model name). Read-only history; nothing computes from it.
--
-- RECOGNITION CODE. The `fleet_number` identifier was described as "the
-- customer's own numbering". Dennis, 15 Sep (02:29): it is JENSEN's code —
-- customer prefix + department + a running number (BKTM01, GKHJ08), printed on
-- a label on the bike with the service phone number so a caller can say which
-- bike. The slug stays `fleet_number` (code and call extraction key on it);
-- the NAME changes, and each customer gets its 2–4 letter prefix so a build
-- can pre-fill the next code. Uppercase Danish letters only; not unique — a
-- kommune and a department that is still its own customer row may share one.

begin;

create table if not exists public.import_batches (
  id          uuid        primary key default gen_random_uuid(),
  label       text        not null unique,
  source      text,
  notes       text,
  imported_by uuid        references public.people(id),
  imported_at timestamptz not null default now()
);

comment on table public.import_batches is
  'One row per data import run (e.g. the fleet register). Rows that came from '
  'an import point here; rows made in the app never do.';

-- RLS on every table (migration 50) with the permissive policy until auth/M1.
alter table public.import_batches enable row level security;
drop policy if exists anon_all on public.import_batches;
create policy anon_all on public.import_batches
  for all using (true) with check (true);

alter table public.bikes
  add column if not exists import_batch_id uuid references public.import_batches(id),
  add column if not exists import_row jsonb;

comment on column public.bikes.import_batch_id is
  'Set only by a data import; NULL for bikes built on an MO or recorded at /bikes/new.';
comment on column public.bikes.import_row is
  'The imported source row, verbatim minus personal names and phone numbers. History only.';

create index if not exists bikes_import_batch_id_idx
  on public.bikes (import_batch_id)
  where import_batch_id is not null;

alter table public.organizations
  add column if not exists recognition_prefix text;

alter table public.organizations
  drop constraint if exists organizations_recognition_prefix_format;
alter table public.organizations
  add constraint organizations_recognition_prefix_format
  check (recognition_prefix is null or recognition_prefix ~ '^[A-ZÆØÅ]{2,4}$');

comment on column public.organizations.recognition_prefix is
  'Jensen''s 2–4 letter code for this customer (GK = Gladsaxe Kommune); the '
  'first part of every recognition code on its bikes.';

update public.bike_identifier_types
   set name_en        = 'Recognition code',
       name_da        = 'Genkendelseskode',
       description_en = 'Jensen''s own code on the bike''s label: customer prefix + department + running number, e.g. BKTM01.',
       description_da = 'Jensens egen kode på cyklens label: kundens forkortelse + afdeling + løbenummer, fx BKTM01.'
 where slug = 'fleet_number';

insert into public.schema_migrations (version, name)
  values (102, '102_bike_import_provenance') on conflict (version) do nothing;

commit;

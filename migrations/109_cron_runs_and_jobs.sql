-- 109 — the daily jobs are visible, and Finn's paint runs can tell Dennis
--
-- Owner, 2026-09-28:
--
--   * Every scheduled job run is RECORDED — `cron_runs`, one row per run,
--     written by the one runner every job goes through (src/lib/cron/run.ts),
--     whether Vercel triggered it or someone pressed *Run now*. /admin/jobs
--     lists the jobs from vercel.json with their last run, result and summary.
--   * Seeing them is its own capability, `jobs` ("See scheduled jobs"), given
--     to Owner and IT admin — an admin concern, hidden from everyone else.
--   * `paint.received_incomplete` (a paint order Finn collected had lines that
--     could not become painted stock) goes to the Owner role.

create table if not exists public.cron_runs (
  id           uuid primary key default gen_random_uuid(),
  job          text not null,
  trigger      text not null check (trigger in ('schedule', 'manual')),
  triggered_by uuid references public.people(id),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  summary      text,
  detail       jsonb
);
create index if not exists idx_cron_runs_job_started
  on public.cron_runs (job, started_at desc);

alter table public.cron_runs enable row level security;
drop policy if exists anon_all on public.cron_runs;
create policy anon_all on public.cron_runs
  for all to anon using (true) with check (true);

insert into public.role_capabilities (role_id, capability)
select r.id, 'jobs' from public.roles r where r.key in ('owner', 'it_admin')
on conflict do nothing;

insert into public.role_notifications (role_id, event_key)
select r.id, 'paint.received_incomplete' from public.roles r where r.key = 'owner'
on conflict do nothing;

insert into public.schema_migrations (version, name)
  values (109, '109_cron_runs_and_jobs') on conflict (version) do nothing;

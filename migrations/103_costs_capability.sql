-- 103 — technicians see no money; the Workshop role keeps what the floor needs
--
-- Owner, 2026-09-26: Finn and Glenn — the technicians — must not see costs or
-- prices of anything. That supersedes the 2026-07 rule "no field-level
-- redaction — workshop sees costs" (docs/plan-people-roles.md). Two changes:
--
--   * A new capability, `costs` (registered in src/lib/people/capabilities.ts):
--     the right to see money — costs, prices, margins, stock value. Granted to
--     every role but Workshop. Screens a technician can open (parts, a bike,
--     the floor, the build workbench) render AND send money only with it; the
--     Stock value page needs it outright.
--   * The Workshop role, re-evaluated against the work: keeps work, scan,
--     bikes, parts; loses dashboard (office KPIs and money), inbox (call triage
--     is office work — Finn's calls reach him as jobs) and maintenance (the
--     office ticket/work-order pages; technicians work a job from /work/<wo>).
--
-- Existing sessions carry capabilities frozen at login; the session layer
-- upgrades a pre-`costs` (v1) session that holds `invoices`, so nobody who
-- could see money loses it until their next login (src/lib/auth/session.ts).
--
-- Guards: the grant touches exactly the four money-seeing roles and the
-- removal at most the three Workshop rows named here — anything else aborts.

begin;

do $$
declare
  money_roles int;
  workshop_rows int;
begin
  select count(*) into money_roles
    from public.roles where key in ('owner', 'it_admin', 'accountant', 'sales');
  if money_roles <> 4 then
    raise exception 'expected 4 money-seeing roles, found %', money_roles;
  end if;
  select count(*) into workshop_rows
    from public.role_capabilities rc join public.roles r on r.id = rc.role_id
   where r.key = 'workshop' and rc.capability in ('dashboard', 'inbox', 'maintenance');
  if workshop_rows > 3 then
    raise exception 'expected at most 3 Workshop rows to remove, found %', workshop_rows;
  end if;
end $$;

insert into public.role_capabilities (role_id, capability)
select r.id, 'costs'
  from public.roles r
 where r.key in ('owner', 'it_admin', 'accountant', 'sales')
on conflict do nothing;

delete from public.role_capabilities rc
 using public.roles r
 where rc.role_id = r.id
   and r.key = 'workshop'
   and rc.capability in ('dashboard', 'inbox', 'maintenance');

insert into public.schema_migrations (version, name)
  values (103, '103_costs_capability') on conflict (version) do nothing;

commit;

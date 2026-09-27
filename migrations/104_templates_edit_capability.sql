-- 104 — only Dennis creates templates: a `templates_edit` capability
--
-- Owner, 2026-09-15 (00:34:19): "I'm the one creating. Others will not be
-- creating." Templates and bike configurations are made by Dennis alone.
-- Today `templates` both opens the pages and lets its holder change them, and
-- Sales and Accountant hold it. So a second capability, `templates_edit`
-- (registered in src/lib/people/capabilities.ts), is the right to create,
-- change, version, duplicate and delete a template. `templates` stays the
-- right to LOOK — an offer is priced off a template, so Sales still reads them.
--
-- Granted to Owner (Dennis) and IT admin (Nazar, who builds the system). The
-- Admin login holds every registered capability without role rows.
--
-- Existing sessions carry capabilities frozen at login; the session layer
-- gives a pre-`templates_edit` session that holds `admin` the new capability
-- (src/lib/auth/session.ts), so neither loses editing until their next login.
--
-- Guard: exactly the two roles named here must exist.

begin;

do $$
declare
  n int;
begin
  select count(*) into n from public.roles where key in ('owner', 'it_admin');
  if n <> 2 then
    raise exception 'expected the owner and it_admin roles, found %', n;
  end if;
end $$;

insert into public.role_capabilities (role_id, capability)
select r.id, 'templates_edit'
  from public.roles r
 where r.key in ('owner', 'it_admin')
on conflict do nothing;

insert into public.schema_migrations (version, name)
  values (104, '104_templates_edit_capability') on conflict (version) do nothing;

commit;

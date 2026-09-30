-- 115 · Who handles everyone's calls (owner, 2026-09-30).
--
-- `inbox` = every phone line's calls on /calls, plus dictated commands.
-- Sales gets it: an order enquiry is the most valuable call the shop takes,
-- and the people who sell must see it. The accountant loses it: bookkeeping
-- does not answer customers' calls. Owner and IT admin keep it; Workshop keeps
-- `calls_own` (its own line only).

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'inbox' FROM roles r WHERE r.key = 'sales'
ON CONFLICT DO NOTHING;

DELETE FROM role_capabilities rc
USING roles r
WHERE rc.role_id = r.id AND r.key = 'accountant' AND rc.capability = 'inbox';

insert into public.schema_migrations (version, name)
  values (115, '115_calls_access_sales_not_accountant') on conflict (version) do nothing;

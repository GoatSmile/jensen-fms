-- 100 — offer_revisions joins the RLS invariant
--
-- Migration 99 created `offer_revisions` without enabling row level security
-- and without the permissive `anon_all` policy that migration 50 put on every
-- other table. It is the ONLY table in `public` with `relrowsecurity = false`.
--
-- Nothing is exploitable *today*: `anon_all` is `using (true) with check (true)`,
-- so RLS-on and RLS-off grant the same access, and the app writes this table
-- through the secret key, which bypasses RLS either way. It matters at M1: the
-- user-scoped policies get written against the set of tables that HAVE RLS, and
-- a table outside that set is a table nobody remembers to protect.
--
-- 99 is already applied to the local copy, so it is not edited — this is the
-- correction, in the shape migration 94 used for `outbound_messages`.

begin;

alter table public.offer_revisions enable row level security;

drop policy if exists anon_all on public.offer_revisions;
create policy anon_all on public.offer_revisions
  for all using (true) with check (true);

commit;

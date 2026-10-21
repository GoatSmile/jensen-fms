-- 129 · The assistant may READ the whole database — for Owner and IT admin only
--
-- Owner, 2026-10-21: "ask questions about anything in the system: contracts,
-- buy, service agreements — everything." Per-area lookups follow each role's
-- rights (technicians see no money); for the two roles that already see
-- everything, a general lookup: the model writes ONE SELECT and this function
-- runs it. Capability `data_query` (Owner, IT admin) decides who gets the tool.
--
-- Three guards, any one of which stops a write:
--   1. `assistant_reader` holds SELECT and nothing else — no INSERT, UPDATE,
--      DELETE, no function it could call to write, no other schema.
--   2. The transaction is set read-only before the query runs.
--   3. The query is wrapped as a subquery, so a second statement or a
--      data-modifying WITH cannot parse.
-- Plus a row cap and a COST cap: the planner's estimate is read first and an
-- expensive query is refused before it runs. (A statement_timeout set inside
-- the function does not bind the statement already running — tried, it let a
-- 7 s pg_sleep through — so the estimate is the guard that works here.) people.password_hash is the one
-- secret-shaped column, and it is not granted (column-level SELECT on people).
-- A FUTURE table is readable by default (default privileges below) — so a
-- secret column added later must be revoked here too.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_reader') THEN
    CREATE ROLE assistant_reader NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO assistant_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO assistant_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO assistant_reader;

-- people: every column but the password hash.
REVOKE SELECT ON public.people FROM assistant_reader;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'people' AND column_name <> 'password_hash';
  EXECUTE format('GRANT SELECT (%s) ON public.people TO assistant_reader', cols);
END $$;

-- The API's server role may become it, inside the function below only.
GRANT assistant_reader TO service_role;

CREATE OR REPLACE FUNCTION public.assistant_read_query(q text, max_rows int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  wrapped text;
  plan jsonb;
  cost numeric;
  result jsonb;
BEGIN
  PERFORM set_config('transaction_read_only', 'on', true);
  SET LOCAL ROLE assistant_reader;
  wrapped := format(
    'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (%s) AS q LIMIT %s) AS t',
    q,
    least(greatest(coalesce(max_rows, 100), 1), 200)
  );
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || wrapped INTO plan;
  cost := (plan -> 0 -> 'Plan' ->> 'Total Cost')::numeric;
  IF cost > 2000000 THEN
    RAISE EXCEPTION 'query too expensive (estimated cost %), narrow it down', round(cost);
  END IF;
  EXECUTE wrapped INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_read_query(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_read_query(text, int) TO service_role;

INSERT INTO public.role_capabilities (role_id, capability)
SELECT r.id, 'data_query' FROM public.roles r WHERE r.key IN ('owner', 'it_admin')
ON CONFLICT DO NOTHING;

insert into public.schema_migrations (version, name)
  values (129, '129_assistant_read_query') on conflict (version) do nothing;

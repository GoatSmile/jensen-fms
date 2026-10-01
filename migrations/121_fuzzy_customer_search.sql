-- 121 · Close spellings of a customer's name (owner, 2026-10-01: fix the
-- garbled-name problem). A transcription heard "Frederiksberg Kommune" as
-- "Fredericksburg Community"; the exact search found nothing, and the call's
-- suggestions proposed creating a NEW customer. Trigram similarity ranks the
-- real one first (0.34 vs 0.25 for the next), so the assistant and the
-- suggestion cards can OFFER it — a person still picks; nothing is filled in
-- from a close spelling. pg_trgm is already installed (organizations has a
-- trigram index on legal_name).

CREATE OR REPLACE FUNCTION public.search_organizations_fuzzy(q text, lim integer DEFAULT 5)
RETURNS TABLE (id uuid, label text, score real)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT o.id,
         COALESCE(o.display_name_da, o.display_name_en, o.legal_name) AS label,
         GREATEST(
           similarity(o.legal_name, q),
           similarity(COALESCE(o.display_name_da, ''), q),
           similarity(COALESCE(o.display_name_en, ''), q)
         ) AS score
  FROM organizations o
  WHERE o.deleted_at IS NULL
    AND GREATEST(
          similarity(o.legal_name, q),
          similarity(COALESCE(o.display_name_da, ''), q),
          similarity(COALESCE(o.display_name_en, ''), q)
        ) >= 0.2
  ORDER BY score DESC
  LIMIT LEAST(GREATEST(lim, 1), 10);
$$;

insert into public.schema_migrations (version, name)
  values (121, '121_fuzzy_customer_search') on conflict (version) do nothing;

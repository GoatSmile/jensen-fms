-- ============================================================================
-- 86 — bike_state_log.actor_id gets the foreign key it never had
-- ============================================================================
-- The column has existed since the original schema and was never constrained,
-- because it was written by nobody. Migration 84 started filling it; this
-- makes it a real reference.
--
-- Not cosmetic: PostgREST resolves an embed BY CONSTRAINT NAME, so
-- `people!bike_state_log_actor_id_fkey(full_name)` fails without it — and a
-- failed embed doesn't error loudly, it returns no rows. The bike page's
-- whole status history rendered as "no status changes recorded yet" while the
-- table held them. Same shape as the `.is("deleted_at", null)` trap in
-- CLAUDE.md: a query that is wrong about the schema comes back empty, not red.
--
-- Every existing row has actor_id NULL, so this validates without a rewrite.

ALTER TABLE bike_state_log
    ADD CONSTRAINT bike_state_log_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES people(id);

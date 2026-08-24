-- ============================================================================
-- 83 — Who did the work, and who typed it in
-- ============================================================================
-- DECISIONS 2026-08-24. Login carries a person since migration 80, so the
-- system can finally record who did something rather than only what happened.
--
-- TWO COLUMNS PER EVENT, because they are two different facts:
--
--   <event>_by            THE PERFORMER — a claim about the world. The
--                         mechanic who built the bike. Often second-hand:
--                         Dennis records a build Lars did, because Lars does
--                         not log in. Editable, correctable later.
--   <event>_recorded_by   THE RECORDER — a system fact, the session person,
--                         stamped automatically and never offered for edit.
--
-- Conflating them is how attribution loses credibility: the first time a
-- mechanic sees "built by Dennis" on a bike he built, the field stops meaning
-- anything. Keeping them apart also means the shared `Admin` login degrades
-- gracefully — recorded_by = Admin, built_by = whoever actually did it.
--
-- NULL means "before we tracked this". Historical rows are NOT backfilled with
-- Admin; that would fabricate a record. Screens show "—".
--
-- Where performer and recorder are always the same person — issuing an
-- invoice, moving stock — there is ONE column and no picker. A second field
-- there is friction with no information in it.

-- The build. Stamped by finishBikeBuild, shown on the bike forever.
ALTER TABLE bikes
    ADD COLUMN built_by          UUID REFERENCES people(id),
    ADD COLUMN built_recorded_by UUID REFERENCES people(id);

COMMENT ON COLUMN bikes.built_by IS
    'Who built it (claim, correctable). NULL = not recorded.';
COMMENT ON COLUMN bikes.built_recorded_by IS
    'Session person who wrote the current built_by. System fact.';

-- The repair. `assigned_to` already says who SHOULD do it; this says who did.
ALTER TABLE work_orders
    ADD COLUMN completed_by            UUID REFERENCES people(id),
    ADD COLUMN completion_recorded_by  UUID REFERENCES people(id);

COMMENT ON COLUMN work_orders.completed_by IS
    'Who did the repair (claim, correctable) — distinct from assigned_to.';

-- Stock. The column existed from day one, unconstrained and never written,
-- aimed at auth.users for M1. Point it at people and start using it: performer
-- and recorder are the same person for a movement, so one column is right.
ALTER TABLE inventory_movements
    ADD CONSTRAINT inventory_movements_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES people(id);

COMMENT ON COLUMN inventory_movements.created_by IS
    'Who moved the stock. NULL on the 638 rows written before attribution.';

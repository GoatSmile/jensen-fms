-- ============================================================================
-- 81 — Preferences belong to the person, not to the browser
-- ============================================================================
-- DECISIONS 2026-08-23 (follows migration 80). Once login carries a name, the
-- settings a person builds up should follow that name to whatever screen they
-- log in on — the shop floor tablet, the office desktop, a phone. Anything we
-- kept in a cookie or in localStorage was per BROWSER, which is not the same
-- thing and quietly lies the moment two people share a device.
--
--   ui_preferences      app chrome the person has arranged: which nav groups
--                       are open, whether the rail is collapsed. JSONB because
--                       this list grows and none of it is ever queried across
--                       people — it is read whole, by id, once per render.
--   preferred_language  becomes NULLABLE: NULL = follow the app default
--                       (app_settings.app_language / worker_language), a value
--                       = this person's own choice, everywhere in the app.
--                       Before this, the column was NOT NULL DEFAULT 'da', so
--                       "never decided" and "chose Danish" were the same row.
--
-- The seeded Admin row is set to NULL here for exactly that reason: it took the
-- column default when migration 80 created it seconds earlier — nobody chose
-- Danish for it. The two real people keep the values they were given.
-- ---------------------------------------------------------------------------

ALTER TABLE people
    ADD COLUMN ui_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE people
    ALTER COLUMN preferred_language DROP NOT NULL,
    ALTER COLUMN preferred_language DROP DEFAULT;

UPDATE people SET preferred_language = NULL WHERE is_system;

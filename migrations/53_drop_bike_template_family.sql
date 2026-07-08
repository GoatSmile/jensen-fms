-- Migration 53: Drop the legacy bike_templates.family text column.
--
-- CONTRACT phase of the family controlled-vocab change (see migration 52).
-- Only safe to apply AFTER the migration-52 code is deployed to prod — that
-- code reads the family via the family_id → bike_families join and no longer
-- selects the `family` text column, so it's now dead weight. Applied once the
-- Vercel deploy of the family commit went green.

alter table public.bike_templates drop column if exists family;

-- Coating finishes as a managed controlled-vocab table.
--
-- Item 9 added colors.coating as free text backed by an app constant
-- (src/lib/colors/coating.ts). Dennis wants to manage the list of finishes
-- himself (on the colours admin page, no separate page). Promote the vocabulary
-- to a table that drives the colour form's coating picker. colors.coating keeps
-- storing the chosen slug (text, loosely coupled — same as before), so nothing
-- downstream re-plumbs; this table just governs which finishes are offered and
-- is the admin-managed source of truth.
CREATE TABLE IF NOT EXISTS coatings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  label_en    TEXT NOT NULL,
  label_da    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE coatings IS
  'Controlled vocabulary of paint finishes offered in the colour form''s coating picker. colors.coating stores the chosen slug. Archived (is_active=false) rows drop out of the picker but keep meaning on historical colours.';

-- Seed the four finishes that were the app constant, da/en labels intact.
INSERT INTO coatings (slug, label_en, label_da, sort_order) VALUES
  ('matte',  'Matte',  'Mat',   1),
  ('glossy', 'Glossy', 'Blank', 2),
  ('clear',  'Clear',  'Klar',  3),
  ('satin',  'Satin',  'Satin', 4)
ON CONFLICT (slug) DO NOTHING;

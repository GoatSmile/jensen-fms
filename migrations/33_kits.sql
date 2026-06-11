-- 33_kits.sql
-- Kitting: the floor aid for assembly picking. A kit is a colour+number
-- sticker family ("Red 1", "Green 9") applied to part boxes; the assembler
-- picks by full code. Parts can carry zero, one, or many kit labels —
-- plain M-to-N, no snapshotting (this is a picking aid, not cost basis).
-- The sticker-colour palette (slug -> hex) is an app constant, not a DB
-- table: print colours are a presentation concern and a fixed palette
-- keeps the physical stickers consistent.
CREATE TABLE kits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_color TEXT NOT NULL,
  kit_number    INTEGER NOT NULL CHECK (kit_number > 0),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sticker_color, kit_number)
);

COMMENT ON TABLE kits IS
  'Kitting labels ("Red 1") stuck on part boxes so assemblers pick complete part sets per build. Full-code picking: colour+number is the identity.';

CREATE TABLE part_kits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id    UUID NOT NULL REFERENCES parts (id) ON DELETE CASCADE,
  kit_id     UUID NOT NULL REFERENCES kits (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (part_id, kit_id)
);

CREATE INDEX idx_part_kits_kit ON part_kits (kit_id);
CREATE INDEX idx_part_kits_part ON part_kits (part_id);

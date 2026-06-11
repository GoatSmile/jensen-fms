-- 34_kit_number_optional.sql
-- A kit can now be a bare colour ("Red") as well as colour + number
-- ("Red 1"). kit_number becomes nullable; the CHECK (> 0) still applies
-- when a number is given (NULL passes CHECK). Uniqueness must treat NULLs
-- as equal — plain UNIQUE would allow two bare "Red" kits — so the
-- constraint is recreated NULLS NOT DISTINCT (PG15+; project is PG17).
ALTER TABLE kits ALTER COLUMN kit_number DROP NOT NULL;
ALTER TABLE kits DROP CONSTRAINT kits_sticker_color_kit_number_key;
ALTER TABLE kits ADD CONSTRAINT kits_sticker_color_kit_number_key
  UNIQUE NULLS NOT DISTINCT (sticker_color, kit_number);

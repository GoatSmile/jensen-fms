-- ============================================================================
-- 11 — Bike images storage bucket
-- ============================================================================
-- Mirrors migration 05 (part-images): public bucket, 5 MB cap, common image
-- MIME types. Bike photos are referenced via the generic `attachments` table
-- with entity_type='bike' so the schema doesn't need a new table.
--
-- AUTH / RLS NOTE — same v1.0 caveat as 05: no user-level auth yet, anon
-- has full access. When auth lands, tighten INSERT/DELETE to authenticated.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bike-images',
  'bike-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "bike-images: anon read"   ON storage.objects;
DROP POLICY IF EXISTS "bike-images: anon insert" ON storage.objects;
DROP POLICY IF EXISTS "bike-images: anon delete" ON storage.objects;

CREATE POLICY "bike-images: anon read"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'bike-images');

CREATE POLICY "bike-images: anon insert"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'bike-images');

CREATE POLICY "bike-images: anon delete"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'bike-images');

-- ============================================================================
-- 05 — Part images storage bucket
-- ============================================================================
-- Creates a public Supabase Storage bucket for part photos and the storage
-- policies that allow the app to read, write, and delete objects in it.
--
-- Bucket name: part-images
-- Public:      yes (catalog images can be referenced from any URL)
-- Size limit:  5 MB per object (we resize client-side to ~1600px WebP)
-- MIME types:  jpeg, png, webp, gif (animated GIFs allowed for spinners)
--
-- AUTH / RLS NOTE
-- ---------------
-- v1.0 of the FMS has no user-level auth (per CLAUDE.md): the publishable
-- key is anon and has full access. The policies below grant the anon role
-- read + insert + delete on this bucket only. When auth lands, tighten:
--     - keep SELECT open (catalog stays public)
--     - restrict INSERT/DELETE to the authenticated role
--     - consider scoping the path prefix per user/org if multi-tenant.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'part-images',
  'part-images',
  true,
  5242880,                                                          -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop any prior copies so this migration is rerunnable in dev.
DROP POLICY IF EXISTS "part-images: anon read"   ON storage.objects;
DROP POLICY IF EXISTS "part-images: anon insert" ON storage.objects;
DROP POLICY IF EXISTS "part-images: anon delete" ON storage.objects;

CREATE POLICY "part-images: anon read"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'part-images');

CREATE POLICY "part-images: anon insert"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'part-images');

CREATE POLICY "part-images: anon delete"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'part-images');

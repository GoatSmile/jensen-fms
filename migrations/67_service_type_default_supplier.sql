-- ============================================================================
-- 67 — service_types.default_supplier_id (retire DEFAULT_PAINTER_NAME constant)
-- ============================================================================
-- The "default painter" was a hardcoded code constant
-- (DEFAULT_PAINTER_NAME = 'Metacoat A/S') matched by supplier NAME — brittle
-- (rename breaks it) and paint-specific. Per the config doctrine (operational
-- config → DB + admin, not code) it becomes a per-service-type FK: each
-- service type has its default supplier, editable at /admin/services. Paint
-- is just the first type; washing/sandblasting later each get their own.
--
-- ON DELETE SET NULL: archiving/removing the supplier clears the default
-- rather than dangling; the new-order forms simply pre-select nothing and the
-- template estimate falls back to any current list.

ALTER TABLE service_types
  ADD COLUMN IF NOT EXISTS default_supplier_id UUID
    REFERENCES suppliers(id) ON DELETE SET NULL;

-- Backfill the painting type's default to the existing Metacoat A/S supplier
-- (by name, one-time — the same lookup the constant did), if present.
UPDATE service_types st
SET default_supplier_id = s.id
FROM suppliers s
WHERE st.slug = 'painting'
  AND st.default_supplier_id IS NULL
  AND s.name = 'Metacoat A/S'
  AND s.deleted_at IS NULL;

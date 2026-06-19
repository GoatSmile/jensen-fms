-- Coating / finish on a colour (matte / glossy / clear / satin).
--
-- Part of the RAL + coating capture from Dennis's app-review call. The locked
-- decision is to extend the controlled `colors` table rather than free-text
-- coating per SO line: "matte RAL 9005" and "glossy RAL 9005" become distinct
-- colour rows. That way the coating rides along with `color_id` through
-- sales_order_line → manufacturing_order → bike → paint_order with no extra
-- plumbing.
--
-- Nullable: the seeded white/red/black rows carry no coating until classified.
-- Free text (no CHECK) so the admin can add finishes we didn't anticipate;
-- the colour form offers the common values as a picker.
ALTER TABLE colors ADD COLUMN IF NOT EXISTS coating text;

COMMENT ON COLUMN colors.coating IS
  'Finish: matte | glossy | clear | satin (app constant in src/lib/colors/coating.ts), or NULL when unspecified.';

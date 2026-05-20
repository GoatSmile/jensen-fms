# Jensen Production — FMS Schema Package v1.2

This package contains the proposed PostgreSQL database schema for the
Bicycle Fleet Management System.

**v1.2 adds full Danish + English bilingual support** to every user-facing
text field — see `CHANGES.md` for the v1.1 → v1.2 delta.

## Files

| File | Purpose |
|------|---------|
| `01_schema.sql`              | Full DDL — tables, types, indexes, triggers, bilingual functions and views |
| `02_seed_reference_data.sql` | Lookup tables with Danish + English values, currencies, FX, default supplier, document sequences |
| `03_migrate_excel_data.sql`  | One-time migration of the 28 existing parts |
| `CHANGES.md`                 | What changed from v1.1 to v1.2 and why |

## How to apply

```bash
# Local Postgres
psql "$DATABASE_URL" -f 01_schema.sql
psql "$DATABASE_URL" -f 02_seed_reference_data.sql
psql "$DATABASE_URL" -f 03_migrate_excel_data.sql

# Supabase: paste each file into the SQL Editor in order
```

Verify with:

```sql
SELECT COUNT(*) FROM parts;                       -- expect 28
SELECT COUNT(*) FROM bike_types;                  -- expect 7
SELECT COUNT(*) FROM bike_identifier_types;       -- expect 13
SELECT name_en, name_da FROM bike_types;          -- both languages populated
SELECT name_en, name_da FROM customer_segments;   -- ditto
SELECT next_document_number('invoice');           -- 'INV-2026-0001'

-- Test the localized line-description function:
SELECT effective_line_description('da', NULL, NULL,
    (SELECT id FROM parts LIMIT 1), NULL, NULL);  -- returns Danish name
SELECT effective_line_description('en', NULL, NULL,
    (SELECT id FROM parts LIMIT 1), NULL, NULL);  -- returns English name
```

## Bilingual support — what's new

Every user-facing text field now has `_en` and `_da` columns. Customer
documents (offers, sales orders, invoices, work orders) carry a `language`
column ('da' or 'en') determining which language the document is rendered
in. Customer organizations have a `preferred_language` that drives the
default for new documents via trigger.

Line descriptions on commercial documents are NULLABLE and rendered at
print time from the catalog (parts, bike model variants, templates) using
the `effective_line_description()` helper function and the three
`v_*_lines_localized` views. Optional `description_en` / `description_da`
override columns on each line let users customize text per-line in either
language.

Internal-only text (notes, mechanic diagnoses, customer-reported issue
descriptions, frame numbers, document numbers, organizations' legal names,
suppliers' names) intentionally stays single-language.

See `CHANGES.md` for the complete list.

## Schema overview (13 domains)

1. **Reference** — `currencies`, `fx_rates`
2. **Lookups (bilingual)** — `bike_types`, `bike_identifier_types`,
   `bike_type_required_identifiers`, `customer_segments`,
   `tax_identifier_types`, `vat_codes`
3. **Document Sequences** — `document_sequences` + `next_document_number()`
4. **Catalog (bilingual)** — `part_categories`, `parts`,
   `part_retail_prices`
5. **Suppliers & Purchasing** — `suppliers`, `part_supplier_offerings`,
   `purchase_orders`, `purchase_order_lines`
6. **Inventory** — `inventory_locations` (bilingual), `inventory_movements`
   (ledger), `v_current_stock`
7. **Customers (bilingual where customer-facing)** — `customer_groups`,
   `organizations`, `organization_tax_identifiers`, `organization_units`,
   `contacts`
8. **Bikes (bilingual on templates and colors)** — `bike_templates`,
   `bike_template_parts`, `colors`, `bikes`, `bike_parts`,
   `bike_identifiers`, `bike_state_log`, `paint_orders`,
   `paint_order_bikes`. *(Migration 09 collapsed the `bike_models` →
   `bike_model_variants` → `bike_templates` trio down to `bike_templates`
   as the single product entity; frame size is on the template, colour is
   a controlled-vocab reference picked at order and build time.
   Migration 10 added the paint-order workflow.)*
9. **Commercial (with language column)** — `offers` / `offer_lines`,
   `sales_orders` / `sales_order_lines`, `invoices` / `invoice_lines`,
   `service_agreements` (bilingual)
10. **Manufacturing** — `manufacturing_orders`, `manufacturing_order_parts`
11. **Shipments** — `shipments`
12. **Maintenance (bilingual where customer-facing)** —
    `maintenance_tickets`, `work_orders` (with language + bilingual
    customer summary), `work_order_parts`
13. **Cross-cutting** — `attachments`, `audit_log`

## Bilingual rendering flow at print time

When generating a PDF for an invoice:

1. Read the invoice's `language` column ('da' or 'en')
2. Query `v_invoice_lines_localized` — the view pre-resolves
   `effective_description` for each line based on the document's language
3. Render the PDF using a Danish or English template based on the language
4. All currency formatting, date formatting, and label translations
   happen in the application layer (next-intl / react-i18next)

The same pattern works for offers, sales orders, and work orders.

## Next.js application bilingual setup

The database handles content translations. The application handles UI
translations:

- Use `next-intl` or `react-i18next` for UI labels, buttons, status
  display text, error messages
- Two PDF templates per document type (invoice_da.tsx + invoice_en.tsx)
- Two email templates per transactional email
- A user/customer language switcher in the UI (server-side reads
  `preferred_language` from organization or contact)

Claude Code can scaffold all of this when you reach Phase 1.

## Migration mapping (Excel → schema)

| Excel column     | New schema location                              |
|------------------|--------------------------------------------------|
| `id`             | (replaced by new `parts.id` UUID)                |
| `purchasedNumber`| `purchase_order_lines.quantity`                  |
| `price`          | `purchase_order_lines.unit_price`                |
| `itemNumber`     | `parts.internal_sku`                             |
| `categoryKey`    | `parts.category_id`                              |
| `currency`       | `purchase_order_lines.currency`                  |
| `purchaseDate`   | `inventory_movements.occurred_at`                |
| `jpNumber`       | `part_supplier_offerings.supplier_sku`           |
| `description`    | `parts.name_en` AND `parts.name_da` (both, as starting point — Dennis to review) |
| `supplier`       | `purchase_orders.supplier_id`                    |
| `rateAtPurchase` | `purchase_order_lines.fx_rate_to_dkk`            |
| `transportFactor`| `purchase_order_lines.transport_factor`          |

Note: existing Excel descriptions are mixed Danish/English. They're
copied into both `name_en` and `name_da` on import. Dennis should plan
a one-time pass through the parts catalog to clean up translations.

## What's still deferred (unchanged from v1.1)

- Row-Level Security policies (add when wiring Supabase auth)
- Audit triggers on every table (pattern is in place; apply selectively)
- Multi-tenancy
- Telemetry/IoT integration tables (AirTags, GPS) — identifier types
  are already in place
- Preventive maintenance schedules
- Engineering Change Orders for formal BOM revision tracking

## Validated end-to-end

The schema has been applied to a real PostgreSQL 16 instance and the
following bilingual scenarios have been confirmed working:

- Document language inheritance from `organizations.preferred_language`
- Same part rendering with the right language on Danish and English
  documents simultaneously
- Per-line override descriptions in both languages
- Graceful fallback when a part has only one language populated
- Atomic document numbering
- All v1.1 functionality (manufacturing orders, state log triggers,
  inventory ledger, etc.) preserved

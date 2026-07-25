# FMS Schema — v1.1 → v1.2 Changes (historical)

> ⚠️ **A May-2026 delta between two drafts of the original schema package, not
> a changelog of the live database.** Schema history since then is the numbered
> migration sequence itself, plus `docs/archive/HISTORY.md`. See
> `migrations/README.md`.

## Summary

v1.2 adds full **bilingual (Danish + English) support** to every user-facing
text field in the database. The schema gains roughly 30 new columns and four
helpers (a function, three views, and a language-inheritance trigger), but
the structure of v1.1 is otherwise preserved. No tables were renamed; no
existing concepts changed.

## What's now bilingual

Every column that can appear on a customer-facing document (work order,
order confirmation, invoice, offer) has a `_da` and `_en` pair.

**Lookup tables:** `bike_types`, `bike_identifier_types`, `customer_segments`,
`tax_identifier_types`, `vat_codes`, `part_categories` all have
`name_en` + `name_da` (and `description_en` + `description_da` where present).

**Catalog:** `parts.name_en` / `name_da`, `parts.description_en` /
`description_da`. The `parts` table is the most important one — every
invoice line that references a part picks up the right language from here.

**Bikes:** `bike_models.name_en/da` and `description_en/da`,
`bike_model_variants.name_en/da` and `color_en/da`,
`bike_templates.name_en/da`. A model called "Hospital Service Bike" /
"Hospital servicecykel" with variant "53cm White" / "53cm Hvid" now renders
correctly on customer documents in either language.

**Customers:** `organizations.display_name_en/da`,
`organizations.preferred_language` (CHAR(2) — defaults to 'da').
`contacts.preferred_language` so individuals can override the org default.

**Commercial documents:** `offers.language`, `sales_orders.language`,
`invoices.language`, `work_orders.language` — each carries the language
this specific document is rendered in. Defaults to the customer's
`preferred_language` via trigger; can be overridden per document.

**Other:** `inventory_locations.name_en/da`, `service_agreements.name_en/da`
and `description_en/da`, `customer_groups.name_en/da` and
`description_en/da`, `currencies.name_en/da`,
`work_orders.customer_summary_en/da`.

## What stays single-language

A few fields are intentionally not translated:

- **`*.notes` everywhere** — internal scratchpad text, written by individual
  staff in their preferred language. Not customer-facing.
- **`organizations.legal_name`** — a customer's legal name doesn't translate.
- **`suppliers.name`, `organization_units.name`** — proper names.
- **`*_number` fields** — frame_number, invoice_number, mo_number, etc.
  These are codes, not language.
- **Status enums** — `'in_progress'`, `'completed'`, etc. The application
  layer translates these for display using a string table (i18n config in
  the Next.js app), not the database.
- **`maintenance_tickets.description`** — this is what the customer
  themselves wrote when reporting an issue; we keep it in their original
  language and tag it with `reported_language`.
- **`work_orders.diagnosis`, `work_performed`** — mechanic notes in their
  preferred working language. The customer-facing summary is bilingual
  via `customer_summary_en/da`.
- **`bikes.notes`, `manufacturing_orders.notes`** — internal.

## How line descriptions work (Approach 1: render at print time)

The `description` columns on offer, sales_order, and invoice line tables
no longer store the customer-facing text directly. Instead:

- `description_en` and `description_da` exist as **optional overrides**
  on each line. They're nullable. When set, they win.
- When the line references a `part_id`, `bike_model_variant_id`, or
  `bike_template_id`, the catalog entity's `name_en/da` is used.
- A CHECK constraint requires every line to have **either** an override
  description **or** a catalog reference. Empty lines are not possible.
- The function `effective_line_description(lang, override_en, override_da,
  part_id, variant_id, template_id)` resolves the right text for any
  line in any language. It tries: override in document language →
  override in other language → part name → variant name → template name →
  fallback string.
- Three views — `v_invoice_lines_localized`, `v_offer_lines_localized`,
  `v_sales_order_lines_localized` — pre-resolve the description for each
  line based on its parent document's language. The application uses
  these views directly for PDF rendering.

This means: when a part name changes (e.g., a translation gets corrected),
**every existing invoice automatically reflects the corrected text on
re-render**. No need to update each historical invoice. If you want to
freeze the text on a specific invoice (e.g., for legal reasons after issue),
you copy the resolved description into the override column at issue time.

## Language inheritance

When a new offer/sales_order/invoice/work_order is inserted without an
explicit `language`, a trigger reads the customer's `preferred_language`
from `organizations`. Work orders inherit from the bike's owner. If no
preference is set anywhere, defaults to `'da'`.

In practice: assign each customer a preferred language once when you
create them, and every document for them gets the right language
automatically.

## Test results

All bilingual scenarios were verified against PostgreSQL 16:

- Same part referenced from a Danish-customer offer and an English-customer
  offer renders with the right language on each.
- Per-line override descriptions in either language correctly take
  precedence over catalog names.
- Parts with text in only one language fall back gracefully (no blanks
  on documents).
- Document language inheritance from `organizations.preferred_language`
  works through the trigger.

## Application-layer concerns (NOT in the database)

Two things still need to be set up in the Next.js application:

1. **UI translations** — labels, buttons, error messages, status enum
   display text. Use `next-intl` or `react-i18next` with translation
   JSON files. The database doesn't store these; they live in your
   application code.

2. **PDF templates** — one Danish and one English template per
   document type (invoice, offer, work order). The PDF library reads
   the document's `language` column and picks the right template.

3. **Email templates** — same: one of each language per transactional
   email, picked at send time based on recipient preference.

These are normal Next.js i18n patterns and Claude Code can scaffold
them when you reach Phase 1 of the build.

## Why two columns instead of a `translations` table

We chose Option A (`name_en`/`name_da` columns) over Option B (a
generic translations table) for explicit speed of build. Tradeoffs:

- ✅ Simpler queries — `SELECT name_en FROM parts` instead of joining
  to a translations table.
- ✅ Easy to understand for any developer.
- ✅ Cheaper at runtime — no extra JOIN per row.
- ⚠️ Adding a third language (Swedish, German) requires a column
  migration. With ~10 tables having translatable fields, that's 20–25
  ALTERs. Manageable but not trivial.

If three or more languages ever become a hard requirement, the path is
to introduce a `translations` table at that point and fall back to it
for the new languages while keeping `_en`/`_da` columns for the existing
two. The migration is mechanical and Claude Code can drive it.

## File summary

- `01_schema.sql` — full v1.2 DDL with bilingual columns, triggers,
  helper function, and three localized views.
- `02_seed_reference_data.sql` — all reference data with both Danish
  and English values.
- `03_migrate_excel_data.sql` — copies existing Excel descriptions into
  both `name_en` and `name_da` as a starting point for review.

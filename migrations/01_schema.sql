-- ============================================================================
-- Jensen Production — Fleet Management System (FMS)
-- Schema v1.2  |  PostgreSQL 15+  |  Supabase-compatible
--
-- Changes from v1.1:
--   • BILINGUAL SUPPORT (Danish + English) on every user-facing text field
--   • All `name` columns on lookup/user-facing tables renamed to `name_en`,
--     with corresponding `name_da` columns alongside
--   • All `description` columns on user-facing tables split into
--     `description_da` and `description_en`
--   • Documents (offers, sales_orders, invoices, work_orders) gain a
--     `language CHAR(2)` column ('da' | 'en') for what language the
--     document itself is in
--   • Organizations gain a `preferred_language` for customer-default UX
--   • Line descriptions on offers/sales_orders/invoices are now NULLABLE
--     with a CHECK constraint requiring either text OR a catalog reference
--     (Approach 1: render description from part/variant/template at print
--     time based on document language)
--   • Helper function `effective_line_description()` resolves the right
--     description for any line in any language
--   • Bilingual rendering views: v_invoice_lines_localized,
--     v_offer_lines_localized, v_sales_order_lines_localized
--
-- Internal-only fields (notes, mechanic diagnoses, customer-reported
-- problem descriptions, frame numbers, document numbers, supplier/
-- organization legal names) remain single-language by design.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- 1. REFERENCE TABLES
-- ============================================================================

CREATE TABLE currencies (
    code           CHAR(3) PRIMARY KEY,
    name_en        TEXT    NOT NULL,
    name_da        TEXT,
    symbol         TEXT,
    decimal_places SMALLINT NOT NULL DEFAULT 2
);

INSERT INTO currencies (code, name_en, name_da, symbol) VALUES
    ('DKK', 'Danish Krone',     'Danske kroner',    'kr'),
    ('USD', 'US Dollar',        'Amerikansk dollar', '$'),
    ('EUR', 'Euro',             'Euro',              '€'),
    ('GBP', 'British Pound',    'Britiske pund',     '£'),
    ('SEK', 'Swedish Krona',    'Svenske kroner',    'kr'),
    ('NOK', 'Norwegian Krone',  'Norske kroner',     'kr'),
    ('CNY', 'Chinese Yuan',     'Kinesiske yuan',    '¥'),
    ('CHF', 'Swiss Franc',      'Schweizerfranc',    'CHF'),
    ('PLN', 'Polish Złoty',     'Polske zloty',      'zł');

CREATE TABLE fx_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency CHAR(3) NOT NULL REFERENCES currencies(code),
    to_currency   CHAR(3) NOT NULL DEFAULT 'DKK' REFERENCES currencies(code),
    rate          NUMERIC(15,6) NOT NULL CHECK (rate > 0),
    rate_date     DATE NOT NULL,
    source        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_currency, to_currency, rate_date)
);
CREATE INDEX idx_fx_rates_lookup ON fx_rates(from_currency, to_currency, rate_date DESC);

-- ============================================================================
-- 2. LOOKUP TABLES (extensible without migrations, all bilingual)
-- ============================================================================

CREATE TABLE bike_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name_en         TEXT NOT NULL,
    name_da         TEXT,
    description_en  TEXT,
    description_da  TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bike_identifier_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name_en         TEXT NOT NULL,
    name_da         TEXT,
    description_en  TEXT,
    description_da  TEXT,
    format_regex    TEXT,
    is_globally_unique BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bike_type_required_identifiers (
    bike_type_id            UUID NOT NULL REFERENCES bike_types(id) ON DELETE CASCADE,
    bike_identifier_type_id UUID NOT NULL REFERENCES bike_identifier_types(id) ON DELETE RESTRICT,
    is_required             BOOLEAN NOT NULL DEFAULT TRUE,
    notes                   TEXT,
    PRIMARY KEY (bike_type_id, bike_identifier_type_id)
);

CREATE TABLE customer_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name_en         TEXT NOT NULL,
    name_da         TEXT,
    description_en  TEXT,
    description_da  TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tax_identifier_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    name_en         TEXT NOT NULL,
    name_da         TEXT,
    description_en  TEXT,
    description_da  TEXT,
    country_code    CHAR(2),
    format_regex    TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vat_codes (
    code              TEXT PRIMARY KEY,
    name_en           TEXT NOT NULL,
    name_da           TEXT,
    description_en    TEXT,
    description_da    TEXT,
    default_rate      NUMERIC(5,2) NOT NULL,
    country_code      CHAR(2),
    is_reverse_charge BOOLEAN NOT NULL DEFAULT FALSE,
    is_export         BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. DOCUMENT SEQUENCES
-- ============================================================================

CREATE TABLE document_sequences (
    document_type   TEXT NOT NULL,
    year            INTEGER NOT NULL,
    current_value   INTEGER NOT NULL DEFAULT 0,
    prefix          TEXT NOT NULL,
    pad_width       INTEGER NOT NULL DEFAULT 4,
    PRIMARY KEY (document_type, year)
);

CREATE OR REPLACE FUNCTION next_document_number(p_doc_type TEXT) RETURNS TEXT AS $$
DECLARE
    v_year      INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    v_seq       RECORD;
    v_prefix    TEXT;
    v_pad       INTEGER;
BEGIN
    UPDATE document_sequences
    SET current_value = current_value + 1
    WHERE document_type = p_doc_type AND year = v_year
    RETURNING * INTO v_seq;

    IF NOT FOUND THEN
        v_prefix := CASE p_doc_type
            WHEN 'invoice' THEN 'INV'
            WHEN 'sales_order' THEN 'SO'
            WHEN 'offer' THEN 'OFF'
            WHEN 'purchase_order' THEN 'PO'
            WHEN 'manufacturing_order' THEN 'MO'
            WHEN 'work_order' THEN 'WO'
            WHEN 'maintenance_ticket' THEN 'TKT'
            WHEN 'shipment' THEN 'SHP'
            ELSE UPPER(SUBSTRING(p_doc_type FROM 1 FOR 3))
        END;
        v_pad := 4;

        INSERT INTO document_sequences (document_type, year, current_value, prefix, pad_width)
        VALUES (p_doc_type, v_year, 1, v_prefix, v_pad)
        RETURNING * INTO v_seq;
    END IF;

    RETURN v_seq.prefix || '-' || v_seq.year || '-' ||
           LPAD(v_seq.current_value::TEXT, v_seq.pad_width, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CATALOG: Part Categories, Parts, Retail Pricing
-- ============================================================================

CREATE TABLE part_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id       UUID REFERENCES part_categories(id) ON DELETE RESTRICT,
    slug            TEXT NOT NULL UNIQUE,
    name_en         TEXT NOT NULL,
    name_da         TEXT,
    description_en  TEXT,
    description_da  TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_part_categories_parent ON part_categories(parent_id);
CREATE INDEX idx_part_categories_active ON part_categories(is_active) WHERE deleted_at IS NULL;

CREATE TABLE parts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internal_sku            TEXT NOT NULL UNIQUE,
    -- BILINGUAL: name and description in both languages
    name_en                 TEXT NOT NULL,
    name_da                 TEXT,
    description_en          TEXT,
    description_da          TEXT,
    category_id             UUID NOT NULL REFERENCES part_categories(id) ON DELETE RESTRICT,
    unit_of_measure         TEXT NOT NULL DEFAULT 'pcs',
    default_retail_price    NUMERIC(15,4),
    default_retail_currency CHAR(3) DEFAULT 'DKK' REFERENCES currencies(code),
    weight_grams            INTEGER,
    notes                   TEXT,                       -- internal: single-language
    attributes              JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);
CREATE INDEX idx_parts_category ON parts(category_id);
CREATE INDEX idx_parts_name_en_trgm ON parts USING gin (name_en gin_trgm_ops);
CREATE INDEX idx_parts_name_da_trgm ON parts USING gin (name_da gin_trgm_ops);
CREATE INDEX idx_parts_attrs ON parts USING gin (attributes);

CREATE TABLE part_retail_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id         UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    price           NUMERIC(15,4) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'DKK' REFERENCES currencies(code),
    effective_from  TIMESTAMPTZ NOT NULL,
    effective_to    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID,
    EXCLUDE USING gist (part_id WITH =, tstzrange(effective_from, effective_to) WITH &&)
);

-- ============================================================================
-- 5. SUPPLIERS & PURCHASING
-- ============================================================================

CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,                  -- legal name; not translated
    address_line1       TEXT,
    address_line2       TEXT,
    zip_code            TEXT,
    town                TEXT,
    province            TEXT,
    country_code        CHAR(2) DEFAULT 'DK',
    phone               TEXT,
    email_primary       CITEXT,
    email_secondary     CITEXT,
    website             TEXT,
    default_currency    CHAR(3) REFERENCES currencies(code),
    payment_terms_days  INTEGER,
    notes               TEXT,                           -- internal: single-language
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_suppliers_active ON suppliers(is_active) WHERE deleted_at IS NULL;

CREATE TABLE part_supplier_offerings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id                     UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    supplier_id                 UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    supplier_sku                TEXT,
    default_purchase_price      NUMERIC(15,4),
    default_purchase_currency   CHAR(3) REFERENCES currencies(code),
    minimum_order_quantity      NUMERIC(10,3),
    lead_time_days              INTEGER,
    is_preferred                BOOLEAN NOT NULL DEFAULT FALSE,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (part_id, supplier_id)
);
CREATE INDEX idx_pso_part ON part_supplier_offerings(part_id);
CREATE INDEX idx_pso_supplier ON part_supplier_offerings(supplier_id);

CREATE TYPE purchase_order_status AS ENUM (
    'draft', 'placed', 'partially_received', 'received', 'cancelled'
);

CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number       TEXT NOT NULL UNIQUE,
    supplier_id     UUID NOT NULL REFERENCES suppliers(id),
    status          purchase_order_status NOT NULL DEFAULT 'draft',
    order_date      DATE NOT NULL,
    expected_date   DATE,
    received_date   DATE,
    total_amount    NUMERIC(15,4),
    total_currency  CHAR(3) REFERENCES currencies(code),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID
);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_date ON purchase_orders(order_date DESC);

CREATE TABLE purchase_order_lines (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    part_id                     UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity                    NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
    unit_price                  NUMERIC(15,4) NOT NULL,
    currency                    CHAR(3) NOT NULL REFERENCES currencies(code),
    fx_rate_to_dkk              NUMERIC(15,6) NOT NULL,
    transport_factor            NUMERIC(8,4) NOT NULL DEFAULT 1.0,
    landed_cost_dkk_per_unit    NUMERIC(15,4) GENERATED ALWAYS AS
        (unit_price * fx_rate_to_dkk * transport_factor) STORED,
    received_quantity           NUMERIC(10,3) NOT NULL DEFAULT 0,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pol_po ON purchase_order_lines(purchase_order_id);
CREATE INDEX idx_pol_part ON purchase_order_lines(part_id);

-- ============================================================================
-- 6. INVENTORY
-- ============================================================================

CREATE TABLE inventory_locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    name_en     TEXT NOT NULL,
    name_da     TEXT,
    address     TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO inventory_locations (code, name_en, name_da) VALUES
    ('WH-MAIN', 'Main Warehouse, Ellekær 3, Herlev', 'Hovedlager, Ellekær 3, Herlev');

CREATE TYPE inventory_movement_type AS ENUM (
    'received', 'consumed_build', 'consumed_maintenance', 'returned_to_supplier',
    'adjustment', 'transfer_out', 'transfer_in', 'disposed'
);

CREATE TABLE inventory_movements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id             UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    location_id         UUID NOT NULL REFERENCES inventory_locations(id),
    movement_type       inventory_movement_type NOT NULL,
    quantity_delta      NUMERIC(10,3) NOT NULL,
    unit_cost_dkk       NUMERIC(15,4),
    source_entity_type  TEXT,
    source_entity_id    UUID,
    reason              TEXT,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID
);
CREATE INDEX idx_inv_mov_part_loc ON inventory_movements(part_id, location_id);
CREATE INDEX idx_inv_mov_source ON inventory_movements(source_entity_type, source_entity_id);
CREATE INDEX idx_inv_mov_occurred ON inventory_movements(occurred_at DESC);

CREATE VIEW v_current_stock AS
SELECT
    part_id,
    location_id,
    SUM(quantity_delta) AS quantity_on_hand,
    MAX(occurred_at) AS last_movement_at
FROM inventory_movements
GROUP BY part_id, location_id;

-- ============================================================================
-- 7. CUSTOMERS & ORGANIZATIONS
-- ============================================================================

CREATE TABLE customer_groups (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- BILINGUAL: name shown to customers ("Wholesale" / "Engros")
    name_en                     TEXT NOT NULL,
    name_da                     TEXT,
    description_en              TEXT,
    description_da              TEXT,
    -- Internal slug for stable references (replaces what was UNIQUE name in v1.1):
    slug                        TEXT NOT NULL UNIQUE,
    default_discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (default_discount_percent BETWEEN 0 AND 100),
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name          TEXT NOT NULL,                  -- legal name; not translated
    -- BILINGUAL: friendly display name (what shows on docs in each language)
    display_name_en     TEXT,
    display_name_da     TEXT,
    customer_group_id   UUID REFERENCES customer_groups(id),
    customer_segment_id UUID REFERENCES customer_segments(id),
    -- Customer's preferred language (drives default for new documents):
    preferred_language  CHAR(2) NOT NULL DEFAULT 'da'
        CHECK (preferred_language IN ('da', 'en')),
    cvr_number          TEXT,
    ean_number          TEXT,
    vat_number          TEXT,
    address_line1       TEXT,
    address_line2       TEXT,
    zip_code            TEXT,
    city                TEXT,
    state_province      TEXT,
    country_code        CHAR(2) DEFAULT 'DK',
    phone               TEXT,
    email               CITEXT,
    website             TEXT,
    billing_currency    CHAR(3) DEFAULT 'DKK' REFERENCES currencies(code),
    payment_terms_days  INTEGER DEFAULT 14,
    default_vat_code    TEXT REFERENCES vat_codes(code),
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    pii_redacted_at     TIMESTAMPTZ
);
CREATE INDEX idx_orgs_segment ON organizations(customer_segment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orgs_group ON organizations(customer_group_id);
CREATE INDEX idx_orgs_country ON organizations(country_code);
CREATE INDEX idx_orgs_lang ON organizations(preferred_language);
CREATE INDEX idx_orgs_cvr ON organizations(cvr_number) WHERE cvr_number IS NOT NULL;
CREATE INDEX idx_orgs_ean ON organizations(ean_number) WHERE ean_number IS NOT NULL;
CREATE INDEX idx_orgs_legal_name_trgm ON organizations USING gin (legal_name gin_trgm_ops);

CREATE TABLE organization_tax_identifiers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tax_identifier_type_id  UUID NOT NULL REFERENCES tax_identifier_types(id),
    value                   TEXT NOT NULL,
    notes                   TEXT,
    is_primary              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, tax_identifier_type_id, value)
);
CREATE INDEX idx_oti_org ON organization_tax_identifiers(organization_id);
CREATE INDEX idx_oti_value ON organization_tax_identifiers(value);

CREATE TABLE organization_units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                      -- proper name; not translated
    code            TEXT,
    address         TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_org_units_org ON organization_units(organization_id);

CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name      TEXT,
    last_name       TEXT,
    email           CITEXT,
    phone           TEXT,
    role            TEXT,
    preferred_language CHAR(2) CHECK (preferred_language IN ('da', 'en')),
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    pii_redacted_at TIMESTAMPTZ
);
CREATE INDEX idx_contacts_org ON contacts(organization_id);

-- ============================================================================
-- 8. BIKES
-- ============================================================================

CREATE TABLE bike_models (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_type_id            UUID NOT NULL REFERENCES bike_types(id),
    -- BILINGUAL: model name appears on customer documents
    name_en                 TEXT NOT NULL,
    name_da                 TEXT,
    description_en          TEXT,
    description_da          TEXT,
    manufacturer            TEXT,                       -- proper name; not translated
    model_year              INTEGER,
    headline_retail_price   NUMERIC(15,4),
    headline_currency       CHAR(3) DEFAULT 'DKK' REFERENCES currencies(code),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);
CREATE INDEX idx_bike_models_type ON bike_models(bike_type_id);

CREATE TABLE bike_model_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_model_id   UUID NOT NULL REFERENCES bike_models(id) ON DELETE CASCADE,
    sku             TEXT NOT NULL UNIQUE,
    -- BILINGUAL: variant name (e.g., "48cm Black" / "48cm Sort")
    name_en         TEXT NOT NULL,
    name_da         TEXT,
    frame_size      TEXT,
    color_en        TEXT,
    color_da        TEXT,
    configuration   JSONB NOT NULL DEFAULT '{}',
    retail_price    NUMERIC(15,4),
    retail_currency CHAR(3) DEFAULT 'DKK' REFERENCES currencies(code),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_variants_model ON bike_model_variants(bike_model_id);

CREATE TABLE bike_templates (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_model_id           UUID NOT NULL REFERENCES bike_models(id) ON DELETE RESTRICT,
    bike_model_variant_id   UUID REFERENCES bike_model_variants(id),
    bike_type_id            UUID NOT NULL REFERENCES bike_types(id),
    -- BILINGUAL: template name (mostly internal, but cheap to support)
    name_en                 TEXT NOT NULL,
    name_da                 TEXT,
    version                 INTEGER NOT NULL DEFAULT 1,
    is_current              BOOLEAN NOT NULL DEFAULT TRUE,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID,
    UNIQUE (bike_model_id, bike_model_variant_id, version)
);
CREATE INDEX idx_templates_model ON bike_templates(bike_model_id);
CREATE INDEX idx_templates_variant ON bike_templates(bike_model_variant_id);

CREATE TABLE bike_template_parts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES bike_templates(id) ON DELETE CASCADE,
    part_id         UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity        NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    is_optional     BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,
    UNIQUE (template_id, part_id)
);

CREATE TYPE bike_status AS ENUM (
    'planning', 'building', 'in_stock', 'assigned',
    'in_service', 'in_maintenance', 'retired', 'lost_or_stolen'
);

CREATE TABLE bikes (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_type_id                UUID NOT NULL REFERENCES bike_types(id),
    bike_model_id               UUID REFERENCES bike_models(id),
    bike_model_variant_id       UUID REFERENCES bike_model_variants(id),
    template_id                 UUID REFERENCES bike_templates(id),
    manufacturing_order_id      UUID,                   -- FK added later (forward reference)
    frame_number                TEXT NOT NULL UNIQUE,   -- natural key; not translated
    status                      bike_status NOT NULL DEFAULT 'planning',
    owner_organization_id       UUID REFERENCES organizations(id),
    owner_unit_id               UUID REFERENCES organization_units(id),
    current_location_id         UUID REFERENCES inventory_locations(id),
    current_location_text       TEXT,
    build_cost_dkk              NUMERIC(15,4),
    assigned_at                 TIMESTAMPTZ,
    sale_price                  NUMERIC(15,4),
    sale_currency               CHAR(3) REFERENCES currencies(code),
    notes                       TEXT,                   -- internal: single-language
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);
CREATE INDEX idx_bikes_status ON bikes(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_bikes_owner ON bikes(owner_organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bikes_template ON bikes(template_id);
CREATE INDEX idx_bikes_mo ON bikes(manufacturing_order_id);
CREATE INDEX idx_bikes_type ON bikes(bike_type_id);

CREATE TABLE bike_parts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_id                 UUID NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
    part_id                 UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity                NUMERIC(10,3) NOT NULL DEFAULT 1,
    inventory_movement_id   UUID REFERENCES inventory_movements(id),
    installed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at              TIMESTAMPTZ,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bike_parts_bike ON bike_parts(bike_id);
CREATE INDEX idx_bike_parts_part ON bike_parts(part_id);

CREATE TABLE bike_identifiers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_id                 UUID NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
    identifier_type_id      UUID NOT NULL REFERENCES bike_identifier_types(id),
    identifier_value        TEXT NOT NULL,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at          TIMESTAMPTZ,
    UNIQUE (identifier_type_id, identifier_value)
);
CREATE INDEX idx_bike_ids_bike ON bike_identifiers(bike_id);
CREATE INDEX idx_bike_ids_lookup ON bike_identifiers(identifier_value);

CREATE TABLE bike_state_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_id         UUID NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
    from_status     bike_status,
    to_status       bike_status NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id        UUID,
    reason          TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_bike_state_log_bike ON bike_state_log(bike_id, occurred_at DESC);

-- ============================================================================
-- 9. COMMERCIAL: Offers, Sales Orders, Invoices, Service Agreements
--    All commercial documents carry a `language` column for which language
--    THIS document is in. Defaults from organizations.preferred_language.
-- ============================================================================

CREATE TYPE offer_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');
CREATE TYPE sales_order_status AS ENUM ('draft', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'overdue', 'credited', 'cancelled');

CREATE TABLE offers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_number            TEXT NOT NULL UNIQUE,
    organization_id         UUID NOT NULL REFERENCES organizations(id),
    organization_unit_id    UUID REFERENCES organization_units(id),
    contact_id              UUID REFERENCES contacts(id),
    -- LANGUAGE this offer document is rendered in:
    language                CHAR(2) NOT NULL DEFAULT 'da'
        CHECK (language IN ('da', 'en')),
    status                  offer_status NOT NULL DEFAULT 'draft',
    issued_date             DATE,
    expiry_date             DATE,
    currency                CHAR(3) NOT NULL DEFAULT 'DKK' REFERENCES currencies(code),
    subtotal_amount         NUMERIC(15,4),
    total_vat_amount        NUMERIC(15,4),
    total_amount            NUMERIC(15,4),
    is_price_template       BOOLEAN NOT NULL DEFAULT FALSE,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID
);
CREATE INDEX idx_offers_org ON offers(organization_id);
CREATE INDEX idx_offers_status ON offers(status);

-- Line description handling (Approach 1): description is NULLABLE.
-- If NULL, render at print time from part_id / variant_id / template_id
-- using the document's language. CHECK ensures every line is renderable.
CREATE TABLE offer_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id                UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    line_number             INTEGER NOT NULL,
    part_id                 UUID REFERENCES parts(id),
    bike_model_variant_id   UUID REFERENCES bike_model_variants(id),
    bike_template_id        UUID REFERENCES bike_templates(id),
    -- BILINGUAL OVERRIDES: optional; populated only when user wants
    -- a custom description that overrides the catalog name.
    description_en          TEXT,
    description_da          TEXT,
    quantity                NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit_price              NUMERIC(15,4),
    vat_code                TEXT REFERENCES vat_codes(code),
    vat_rate                NUMERIC(5,2),
    line_subtotal           NUMERIC(15,4),
    line_vat_amount         NUMERIC(15,4),
    line_total              NUMERIC(15,4),
    UNIQUE (offer_id, line_number),
    -- Every line must be renderable: either has a description or references something
    CHECK (
        description_en IS NOT NULL OR description_da IS NOT NULL
        OR part_id IS NOT NULL OR bike_model_variant_id IS NOT NULL
        OR bike_template_id IS NOT NULL
    )
);

CREATE TABLE sales_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_number      TEXT NOT NULL UNIQUE,
    converted_from_offer_id UUID REFERENCES offers(id),
    organization_id         UUID NOT NULL REFERENCES organizations(id),
    organization_unit_id    UUID REFERENCES organization_units(id),
    contact_id              UUID REFERENCES contacts(id),
    language                CHAR(2) NOT NULL DEFAULT 'da'
        CHECK (language IN ('da', 'en')),
    status                  sales_order_status NOT NULL DEFAULT 'draft',
    order_date              DATE NOT NULL,
    requested_delivery_date DATE,
    actual_delivery_date    DATE,
    currency                CHAR(3) NOT NULL DEFAULT 'DKK' REFERENCES currencies(code),
    subtotal_amount         NUMERIC(15,4),
    total_vat_amount        NUMERIC(15,4),
    total_amount            NUMERIC(15,4),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID
);
CREATE INDEX idx_so_org ON sales_orders(organization_id);
CREATE INDEX idx_so_status ON sales_orders(status);

CREATE TABLE sales_order_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id          UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    line_number             INTEGER NOT NULL,
    part_id                 UUID REFERENCES parts(id),
    bike_model_variant_id   UUID REFERENCES bike_model_variants(id),
    bike_template_id        UUID REFERENCES bike_templates(id),
    description_en          TEXT,
    description_da          TEXT,
    quantity                NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit_price              NUMERIC(15,4) NOT NULL,
    vat_code                TEXT REFERENCES vat_codes(code),
    vat_rate                NUMERIC(5,2),
    line_subtotal           NUMERIC(15,4),
    line_vat_amount         NUMERIC(15,4),
    line_total              NUMERIC(15,4),
    UNIQUE (sales_order_id, line_number),
    CHECK (
        description_en IS NOT NULL OR description_da IS NOT NULL
        OR part_id IS NOT NULL OR bike_model_variant_id IS NOT NULL
        OR bike_template_id IS NOT NULL
    )
);

CREATE TABLE invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number          TEXT NOT NULL UNIQUE,
    sales_order_id          UUID REFERENCES sales_orders(id),
    organization_id         UUID NOT NULL REFERENCES organizations(id),
    language                CHAR(2) NOT NULL DEFAULT 'da'
        CHECK (language IN ('da', 'en')),
    status                  invoice_status NOT NULL DEFAULT 'draft',
    issued_date             DATE,
    due_date                DATE,
    paid_date               DATE,
    currency                CHAR(3) NOT NULL DEFAULT 'DKK' REFERENCES currencies(code),
    subtotal_amount         NUMERIC(15,4) NOT NULL DEFAULT 0,
    total_vat_amount        NUMERIC(15,4) NOT NULL DEFAULT 0,
    total_amount            NUMERIC(15,4) NOT NULL DEFAULT 0,
    economic_voucher_id     TEXT,
    economic_synced_at      TIMESTAMPTZ,
    ean_number_used         TEXT,
    is_reverse_charge       BOOLEAN NOT NULL DEFAULT FALSE,
    is_export               BOOLEAN NOT NULL DEFAULT FALSE,
    notes                   TEXT,
    pdf_url                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issued_locked_at        TIMESTAMPTZ
);
CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_economic ON invoices(economic_voucher_id) WHERE economic_voucher_id IS NOT NULL;

CREATE TABLE invoice_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    line_number     INTEGER NOT NULL,
    -- Catalog references (used for at-print-time description rendering):
    part_id         UUID REFERENCES parts(id),
    bike_model_variant_id UUID REFERENCES bike_model_variants(id),
    bike_template_id UUID REFERENCES bike_templates(id),
    description_en  TEXT,
    description_da  TEXT,
    quantity        NUMERIC(10,3) NOT NULL,
    unit_price      NUMERIC(15,4) NOT NULL,
    vat_code        TEXT REFERENCES vat_codes(code),
    vat_rate        NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    line_subtotal   NUMERIC(15,4) NOT NULL,
    line_vat_amount NUMERIC(15,4) NOT NULL,
    line_total      NUMERIC(15,4) NOT NULL,
    UNIQUE (invoice_id, line_number),
    CHECK (
        description_en IS NOT NULL OR description_da IS NOT NULL
        OR part_id IS NOT NULL OR bike_model_variant_id IS NOT NULL
        OR bike_template_id IS NOT NULL
    )
);

CREATE TYPE service_agreement_status AS ENUM ('active', 'expired', 'cancelled');

CREATE TABLE service_agreements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    -- BILINGUAL: agreement name appears on customer-facing reports
    name_en             TEXT NOT NULL,
    name_da             TEXT,
    description_en      TEXT,
    description_da      TEXT,
    status              service_agreement_status NOT NULL DEFAULT 'active',
    start_date          DATE NOT NULL,
    end_date            DATE,
    covers_parts        BOOLEAN NOT NULL DEFAULT TRUE,
    covers_labor        BOOLEAN NOT NULL DEFAULT TRUE,
    monthly_fee         NUMERIC(15,4),
    fee_currency        CHAR(3) DEFAULT 'DKK' REFERENCES currencies(code),
    -- coverage_details JSONB can hold language-keyed structures if needed:
    -- e.g. { "scope": {"da": "...", "en": "..."}, "limits": {...} }
    coverage_details    JSONB NOT NULL DEFAULT '{}',
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_service_agreements_org ON service_agreements(organization_id);

-- ============================================================================
-- 10. MANUFACTURING
-- ============================================================================

CREATE TYPE manufacturing_order_status AS ENUM (
    'planned', 'released', 'in_progress', 'on_hold', 'completed', 'cancelled'
);

CREATE TABLE manufacturing_orders (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mo_number                   TEXT NOT NULL UNIQUE,
    sales_order_id              UUID REFERENCES sales_orders(id),
    sales_order_line_id         UUID REFERENCES sales_order_lines(id),
    bike_template_id            UUID NOT NULL REFERENCES bike_templates(id),
    bike_model_id               UUID NOT NULL REFERENCES bike_models(id),
    bike_model_variant_id       UUID REFERENCES bike_model_variants(id),
    bike_type_id                UUID NOT NULL REFERENCES bike_types(id),
    target_quantity             INTEGER NOT NULL CHECK (target_quantity > 0),
    completed_quantity          INTEGER NOT NULL DEFAULT 0,
    status                      manufacturing_order_status NOT NULL DEFAULT 'planned',
    planned_start_date          DATE,
    planned_completion_date     DATE,
    actual_start_date           DATE,
    actual_completion_date      DATE,
    assigned_to_user_id         UUID,
    notes                       TEXT,                   -- internal: single-language
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by                  UUID
);
CREATE INDEX idx_mo_status ON manufacturing_orders(status);
CREATE INDEX idx_mo_sales_order ON manufacturing_orders(sales_order_id);
CREATE INDEX idx_mo_template ON manufacturing_orders(bike_template_id);

ALTER TABLE bikes
    ADD CONSTRAINT fk_bikes_mo
    FOREIGN KEY (manufacturing_order_id) REFERENCES manufacturing_orders(id);

CREATE TABLE manufacturing_order_parts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturing_order_id  UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
    part_id                 UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity_per_bike       NUMERIC(10,3) NOT NULL DEFAULT 1,
    origin                  TEXT NOT NULL DEFAULT 'template'
        CHECK (origin IN ('template', 'added', 'substituted', 'modified')),
    substituted_part_id     UUID REFERENCES parts(id),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (manufacturing_order_id, part_id)
);
CREATE INDEX idx_mop_mo ON manufacturing_order_parts(manufacturing_order_id);

CREATE OR REPLACE FUNCTION mo_copy_template_parts(p_mo_id UUID) RETURNS INTEGER AS $$
DECLARE
    v_template_id UUID;
    v_count INTEGER;
BEGIN
    SELECT bike_template_id INTO v_template_id
    FROM manufacturing_orders WHERE id = p_mo_id;

    IF v_template_id IS NULL THEN
        RAISE EXCEPTION 'Manufacturing order % has no template', p_mo_id;
    END IF;

    INSERT INTO manufacturing_order_parts
        (manufacturing_order_id, part_id, quantity_per_bike, origin)
    SELECT p_mo_id, btp.part_id, btp.quantity, 'template'
    FROM bike_template_parts btp
    WHERE btp.template_id = v_template_id
    ON CONFLICT (manufacturing_order_id, part_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. SHIPMENTS
-- ============================================================================

CREATE TYPE shipment_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE shipment_status AS ENUM ('planned', 'in_transit', 'delivered', 'exception', 'cancelled');

CREATE TABLE shipments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_number         TEXT NOT NULL UNIQUE,
    direction               shipment_direction NOT NULL,
    source_entity_type      TEXT NOT NULL CHECK (source_entity_type IN ('purchase_order', 'sales_order')),
    source_entity_id        UUID NOT NULL,
    status                  shipment_status NOT NULL DEFAULT 'planned',
    carrier                 TEXT,
    service_level           TEXT,
    tracking_number         TEXT,
    incoterms               TEXT,
    incoterms_location      TEXT,
    origin_address          TEXT,
    destination_address     TEXT,
    planned_ship_date       DATE,
    actual_ship_date        DATE,
    planned_delivery_date   DATE,
    actual_delivery_date    DATE,
    shipping_cost           NUMERIC(15,4),
    shipping_cost_currency  CHAR(3) REFERENCES currencies(code),
    weight_kg               NUMERIC(10,3),
    volume_m3               NUMERIC(10,3),
    customs_value           NUMERIC(15,4),
    customs_currency        CHAR(3) REFERENCES currencies(code),
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shipments_source ON shipments(source_entity_type, source_entity_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number) WHERE tracking_number IS NOT NULL;

-- ============================================================================
-- 12. MAINTENANCE
-- ============================================================================

CREATE TYPE ticket_status AS ENUM ('open', 'in_diagnosis', 'awaiting_parts', 'in_repair', 'resolved', 'closed', 'cancelled');
CREATE TYPE ticket_source AS ENUM ('email', 'phone', 'app', 'in_person', 'scheduled', 'other');

CREATE TABLE maintenance_tickets (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number               TEXT NOT NULL UNIQUE,
    bike_id                     UUID NOT NULL REFERENCES bikes(id),
    reported_by_contact_id      UUID REFERENCES contacts(id),
    reported_by_text            TEXT,
    source                      ticket_source NOT NULL DEFAULT 'email',
    status                      ticket_status NOT NULL DEFAULT 'open',
    -- Customer-reported issue (whatever language they wrote in):
    description                 TEXT NOT NULL,
    -- Original reporting language (informational; not a translation system):
    reported_language           CHAR(2),
    priority                    SMALLINT NOT NULL DEFAULT 3,
    reported_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at                 TIMESTAMPTZ,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tickets_bike ON maintenance_tickets(bike_id);
CREATE INDEX idx_tickets_status ON maintenance_tickets(status);

CREATE TYPE work_order_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');

CREATE TABLE work_orders (
    id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wo_number                           TEXT NOT NULL UNIQUE,
    ticket_id                           UUID REFERENCES maintenance_tickets(id),
    bike_id                             UUID NOT NULL REFERENCES bikes(id),
    assigned_to                         UUID,
    -- Language to render the customer-facing work order document in:
    language                            CHAR(2) NOT NULL DEFAULT 'da'
        CHECK (language IN ('da', 'en')),
    status                              work_order_status NOT NULL DEFAULT 'open',
    started_at                          TIMESTAMPTZ,
    completed_at                        TIMESTAMPTZ,
    labor_minutes                       INTEGER,
    labor_rate_dkk                      NUMERIC(15,4),
    covered_by_service_agreement_id     UUID REFERENCES service_agreements(id),
    is_billable                         BOOLEAN NOT NULL DEFAULT TRUE,
    invoice_id                          UUID REFERENCES invoices(id),
    -- Internal: mechanic notes (single language, whatever the mechanic writes)
    diagnosis                           TEXT,
    work_performed                      TEXT,
    -- Customer-facing summary in both languages (mechanic or system fills these):
    customer_summary_en                 TEXT,
    customer_summary_da                 TEXT,
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wo_bike ON work_orders(bike_id);
CREATE INDEX idx_wo_ticket ON work_orders(ticket_id);
CREATE INDEX idx_wo_status ON work_orders(status);

CREATE TABLE work_order_parts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id           UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    part_id                 UUID NOT NULL REFERENCES parts(id),
    quantity                NUMERIC(10,3) NOT NULL,
    unit_price              NUMERIC(15,4),
    inventory_movement_id   UUID REFERENCES inventory_movements(id),
    installed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wo_parts_wo ON work_order_parts(work_order_id);

-- ============================================================================
-- 13. CROSS-CUTTING: Attachments, Audit Log
-- ============================================================================

CREATE TABLE attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    file_name       TEXT NOT NULL,
    file_url        TEXT NOT NULL,
    mime_type       TEXT,
    file_size_bytes BIGINT,
    purpose         TEXT,
    uploaded_by     UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    action          TEXT NOT NULL,
    old_data        JSONB,
    new_data        JSONB,
    changed_fields  TEXT[],
    actor_id        UUID,
    actor_email     TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id      UUID
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, occurred_at DESC);

-- ============================================================================
-- 14. BILINGUAL HELPERS: functions and views (Approach 1: render at print time)
-- ============================================================================

-- Resolve the right description for a line in a given language.
-- Order of preference:
--   1. Override (description_da or description_en in the line itself)
--   2. Part name (parts.name_da or parts.name_en)
--   3. Variant name (bike_model_variants.name_da/en)
--   4. Template name (bike_templates.name_da/en)
--   5. Fallback string
-- For each catalog name, falls back to the OTHER language if the requested
-- language is empty (so a part with only name_en will still display on a
-- Danish document rather than appearing blank).
CREATE OR REPLACE FUNCTION effective_line_description(
    p_lang CHAR(2),
    p_override_en TEXT,
    p_override_da TEXT,
    p_part_id UUID,
    p_variant_id UUID,
    p_template_id UUID
) RETURNS TEXT AS $$
DECLARE
    v_result TEXT;
BEGIN
    -- 1. Override in the document's language wins
    IF p_lang = 'da' THEN
        IF p_override_da IS NOT NULL AND p_override_da <> '' THEN
            RETURN p_override_da;
        END IF;
        IF p_override_en IS NOT NULL AND p_override_en <> '' THEN
            RETURN p_override_en;  -- fallback to other-language override
        END IF;
    ELSE
        IF p_override_en IS NOT NULL AND p_override_en <> '' THEN
            RETURN p_override_en;
        END IF;
        IF p_override_da IS NOT NULL AND p_override_da <> '' THEN
            RETURN p_override_da;
        END IF;
    END IF;

    -- 2. Part lookup
    IF p_part_id IS NOT NULL THEN
        IF p_lang = 'da' THEN
            SELECT COALESCE(NULLIF(name_da, ''), name_en) INTO v_result
            FROM parts WHERE id = p_part_id;
        ELSE
            SELECT COALESCE(NULLIF(name_en, ''), name_da) INTO v_result
            FROM parts WHERE id = p_part_id;
        END IF;
        IF v_result IS NOT NULL THEN RETURN v_result; END IF;
    END IF;

    -- 3. Variant lookup (also pull model name for context)
    IF p_variant_id IS NOT NULL THEN
        IF p_lang = 'da' THEN
            SELECT COALESCE(NULLIF(bm.name_da, ''), bm.name_en) || ' — ' ||
                   COALESCE(NULLIF(v.name_da, ''), v.name_en)
            INTO v_result
            FROM bike_model_variants v JOIN bike_models bm ON bm.id = v.bike_model_id
            WHERE v.id = p_variant_id;
        ELSE
            SELECT COALESCE(NULLIF(bm.name_en, ''), bm.name_da) || ' — ' ||
                   COALESCE(NULLIF(v.name_en, ''), v.name_da)
            INTO v_result
            FROM bike_model_variants v JOIN bike_models bm ON bm.id = v.bike_model_id
            WHERE v.id = p_variant_id;
        END IF;
        IF v_result IS NOT NULL THEN RETURN v_result; END IF;
    END IF;

    -- 4. Template lookup
    IF p_template_id IS NOT NULL THEN
        IF p_lang = 'da' THEN
            SELECT COALESCE(NULLIF(name_da, ''), name_en) INTO v_result
            FROM bike_templates WHERE id = p_template_id;
        ELSE
            SELECT COALESCE(NULLIF(name_en, ''), name_da) INTO v_result
            FROM bike_templates WHERE id = p_template_id;
        END IF;
        IF v_result IS NOT NULL THEN RETURN v_result; END IF;
    END IF;

    -- 5. Fallback
    RETURN CASE WHEN p_lang = 'da' THEN '(Uden beskrivelse)' ELSE '(No description)' END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Localized rendering views: what to query when generating PDFs.
CREATE VIEW v_invoice_lines_localized AS
SELECT
    il.*,
    i.language AS document_language,
    effective_line_description(
        i.language, il.description_en, il.description_da,
        il.part_id, il.bike_model_variant_id, il.bike_template_id
    ) AS effective_description
FROM invoice_lines il
JOIN invoices i ON i.id = il.invoice_id;

CREATE VIEW v_offer_lines_localized AS
SELECT
    ol.*,
    o.language AS document_language,
    effective_line_description(
        o.language, ol.description_en, ol.description_da,
        ol.part_id, ol.bike_model_variant_id, ol.bike_template_id
    ) AS effective_description
FROM offer_lines ol
JOIN offers o ON o.id = ol.offer_id;

CREATE VIEW v_sales_order_lines_localized AS
SELECT
    sol.*,
    so.language AS document_language,
    effective_line_description(
        so.language, sol.description_en, sol.description_da,
        sol.part_id, sol.bike_model_variant_id, sol.bike_template_id
    ) AS effective_description
FROM sales_order_lines sol
JOIN sales_orders so ON so.id = sol.sales_order_id;

-- ============================================================================
-- 15. TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at' AND table_schema = 'public'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            r.table_name, r.table_name
        );
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION log_bike_state_change() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO bike_state_log (bike_id, from_status, to_status, occurred_at)
        VALUES (NEW.id, OLD.status, NEW.status, NOW());
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO bike_state_log (bike_id, from_status, to_status, occurred_at)
        VALUES (NEW.id, NULL, NEW.status, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bikes_state_log
    AFTER INSERT OR UPDATE OF status ON bikes
    FOR EACH ROW EXECUTE FUNCTION log_bike_state_change();

CREATE OR REPLACE FUNCTION update_mo_completed_qty() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.manufacturing_order_id IS NOT NULL AND
       NEW.status IN ('in_stock', 'assigned', 'in_service') AND
       (OLD IS NULL OR OLD.status NOT IN ('in_stock', 'assigned', 'in_service')) THEN
        UPDATE manufacturing_orders
        SET completed_quantity = completed_quantity + 1
        WHERE id = NEW.manufacturing_order_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bikes_mo_completion
    AFTER INSERT OR UPDATE OF status ON bikes
    FOR EACH ROW EXECUTE FUNCTION update_mo_completed_qty();

-- Trigger: when a new offer/sales_order/invoice/work_order is created and
-- language is not explicitly set, default it from the customer's preferred_language.
CREATE OR REPLACE FUNCTION inherit_org_language() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.language IS NULL OR NEW.language = 'da' THEN
        SELECT preferred_language INTO NEW.language
        FROM organizations WHERE id = NEW.organization_id;
        IF NEW.language IS NULL THEN
            NEW.language := 'da';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offers_inherit_lang BEFORE INSERT ON offers
    FOR EACH ROW EXECUTE FUNCTION inherit_org_language();
CREATE TRIGGER trg_sales_orders_inherit_lang BEFORE INSERT ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION inherit_org_language();
CREATE TRIGGER trg_invoices_inherit_lang BEFORE INSERT ON invoices
    FOR EACH ROW EXECUTE FUNCTION inherit_org_language();

-- Work orders inherit from the bike's owner organization
CREATE OR REPLACE FUNCTION inherit_wo_language() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.language IS NULL OR NEW.language = 'da' THEN
        SELECT o.preferred_language INTO NEW.language
        FROM bikes b
        LEFT JOIN organizations o ON o.id = b.owner_organization_id
        WHERE b.id = NEW.bike_id;
        IF NEW.language IS NULL THEN
            NEW.language := 'da';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_orders_inherit_lang BEFORE INSERT ON work_orders
    FOR EACH ROW EXECUTE FUNCTION inherit_wo_language();

-- ============================================================================
-- END OF SCHEMA v1.2
-- ============================================================================

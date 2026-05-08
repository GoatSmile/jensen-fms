-- ============================================================================
-- Migration of existing parts_Fleet_Export.xlsx into FMS v1.2 schema
-- Run AFTER 01_schema.sql and 02_seed_reference_data.sql
--
-- NOTE on bilingual data: the existing Excel rows have mixed Danish/English
-- product descriptions (e.g., 'Forgaffel for semilav M410+' is Danish-flavored,
-- 'Bafang motor extension kabel 1800mm' is English-flavored). On import we copy
-- the original text into BOTH name_en and name_da as a starting point.
-- Dennis should review and clean up translations in a follow-up pass.
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
    v_supplier_id UUID;
    v_po_id UUID;
    v_part_id UUID;
    v_pol_id UUID;
    v_main_loc_id UUID;
BEGIN

    SELECT id INTO v_supplier_id FROM suppliers WHERE name = 'Eastek HK';
    SELECT id INTO v_main_loc_id FROM inventory_locations WHERE code = 'WH-MAIN';

    INSERT INTO purchase_orders (po_number, supplier_id, status, order_date, notes)
    VALUES ('PO-LEGACY-IMPORT', v_supplier_id, 'received', '2024-01-01',
            'Migrated from parts_Fleet_Export.xlsx — combines historical purchases')
    RETURNING id INTO v_po_id;

    -- Bafang motor extension kabel 1800mm
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-EB 1T1.FX', 'Bafang motor extension kabel 1800mm', 'Bafang motor extension kabel 1800mm', 'Bafang motor extension kabel 1800mm', 'Bafang motor extension kabel 1800mm',
            (SELECT id FROM part_categories WHERE slug = 'motor_kabel'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 5.73, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        39.8123, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'EB 1T1.FX', 5.73,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang motor cover right side for M410 center
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-MM G333-0121A', 'Bafang motor cover right side for M410 center', 'Bafang motor cover right side for M410 center', 'Bafang motor cover right side for M410 center', 'Bafang motor cover right side for M410 center',
            (SELECT id FROM part_categories WHERE slug = 'motor_cover'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 3.97, 'USD',
        6.3175, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        27.5885, 'purchase_order_line', v_pol_id, '2026-02-05'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'MM G333-0121A', 3.97,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang Display C080 for front motor disc
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-DP-C080', 'Bafang Display C080 for front motor disc', 'Bafang Display C080 for front motor disc', 'Bafang Display C080 for front motor disc', 'Bafang Display C080 for front motor disc',
            (SELECT id FROM part_categories WHERE slug = 'display'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 25.95, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        180.3016, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'DP C080.CAN', 25.95,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Semilav 48cm f. Bafang M410 center
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-SL48 B410C', 'Semilav 48cm f. Bafang M410 center', 'Semilav 48cm f. Bafang M410 center', 'Semilav 48cm f. Bafang M410 center', 'Semilav 48cm f. Bafang M410 center',
            (SELECT id FROM part_categories WHERE slug = 'frames'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 70, 54.9, 'USD',
        6.3164, 1.1, 70
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 70,
        381.4474, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'YT7CL480-1098', 54.9,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Lofandi lck hub for Bafang M410 center 700c
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-ZS3714-21', 'Lofandi lck hub for Bafang M410 center 700c', 'Lofandi lck hub for Bafang M410 center 700c', 'Lofandi lck hub for Bafang M410 center 700c', 'Lofandi lck hub for Bafang M410 center 700c',
            (SELECT id FROM part_categories WHERE slug = 'front_hub'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 34.29, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        238.2483, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'ZS3714-21', 34.29,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang Chainwheel f M410, 38T, 3/32"
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-CW G3320.1A', 'Bafang Chainwheel f M410, 38T, 3/32"', 'Bafang Chainwheel f M410, 38T, 3/32"', 'Bafang Chainwheel f M410, 38T, 3/32"', 'Bafang Chainwheel f M410, 38T, 3/32"',
            (SELECT id FROM part_categories WHERE slug = 'tandhjul_for'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 15.2, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        105.6102, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'CW G3320.1A', 15.2,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Kabelsæt til M100 med Lofandi lock hub
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-JP-C02', 'Kabelsæt til M100 med Lofandi lock hub', 'Kabelsæt til M100 med Lofandi lock hub', 'Kabelsæt til M100 med Lofandi lock hub', 'Kabelsæt til M100 med Lofandi lock hub',
            (SELECT id FROM part_categories WHERE slug = 'ledninger'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 110, 4.6, 'USD',
        7.0037, 1.1, 110
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 110,
        35.4387, 'purchase_order_line', v_pol_id, '2024-04-12'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'JP-C02', 4.6,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang krankarme streight 170mm l+r
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-CK A01 170', 'Bafang krankarme streight 170mm l+r', 'Bafang krankarme streight 170mm l+r', 'Bafang krankarme streight 170mm l+r', 'Bafang krankarme streight 170mm l+r',
            (SELECT id FROM part_categories WHERE slug = 'krankarme'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 6.6, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        45.8571, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'CK A01 170', 6.6,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang light cable 800mm
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-EB S1T1 013r', 'Bafang light cable 800mm', 'Bafang light cable 800mm', 'Bafang light cable 800mm', 'Bafang light cable 800mm',
            (SELECT id FROM part_categories WHERE slug = 'ledninger'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 1.13, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        7.8513, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'EB S1T1 013r', 1.13,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Forgaffel for semilav M410+
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-KRD-241113-700c', 'Forgaffel for semilav M410+', 'Forgaffel for semilav M410+', 'Forgaffel for semilav M410+', 'Forgaffel for semilav M410+',
            (SELECT id FROM part_categories WHERE slug = 'forks'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 150, 5.8, 'USD',
        6.3164, 1.1, 150
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 150,
        40.2986, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, '-KRD-241113-700c', 5.8,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang controller for front motor disc with light cables
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-CR A101,C', 'Bafang controller for front motor disc with light cables', 'Bafang controller for front motor disc with light cables', 'Bafang controller for front motor disc with light cables', 'Bafang controller for front motor disc with light cables',
            (SELECT id FROM part_categories WHERE slug = 'controller'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 29.36, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        203.9945, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'CR A101,C', 29.36,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang Display for M410 center 700c
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-DP C080.C', 'Bafang Display for M410 center 700c', 'Bafang Display for M410 center 700c', 'Bafang Display for M410 center 700c', 'Bafang Display for M410 center 700c',
            (SELECT id FROM part_categories WHERE slug = 'display'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 25.95, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        180.3016, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'DP C080.C', 25.95,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Speed sensor for Bafang M410 500mm
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-SR SD021.01', 'Speed sensor for Bafang M410 500mm', 'Speed sensor for Bafang M410 500mm', 'Speed sensor for Bafang M410 500mm', 'Speed sensor for Bafang M410 500mm',
            (SELECT id FROM part_categories WHERE slug = 'sensor'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 5.73, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        39.8123, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'SR SD021.01', 5.73,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang motor extension kabel 1800mm
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-EB 1T1 U', 'Bafang motor extension kabel 1800mm', 'Bafang motor extension kabel 1800mm', 'Bafang motor extension kabel 1800mm', 'Bafang motor extension kabel 1800mm',
            (SELECT id FROM part_categories WHERE slug = 'display_kabel'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 2.96, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        20.5662, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'EB 1T1 U', 2.96,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang motor cover left side for M410 center
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-MM G333-0120A', 'Bafang motor cover left side for M410 center', 'Bafang motor cover left side for M410 center', 'Bafang motor cover left side for M410 center', 'Bafang motor cover left side for M410 center',
            (SELECT id FROM part_categories WHERE slug = 'motor_cover'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 2.7, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        18.7597, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'MM G333-0120A', 2.7,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang light cable 1900mm
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-EB S1T1 013', 'Bafang light cable 1900mm', 'Bafang light cable 1900mm', 'Bafang light cable 1900mm', 'Bafang light cable 1900mm',
            (SELECT id FROM part_categories WHERE slug = 'ledninger'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 1.13, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        7.8513, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'EB S1T1 013', 1.13,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang M410 center motor for 700c CRX10ZC3615F805504.0
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-MM G333.250.CCB', 'Bafang M410 center motor for 700c CRX10ZC3615F805504.0', 'Bafang M410 center motor for 700c CRX10ZC3615F805504.0', 'Bafang M410 center motor for 700c CRX10ZC3615F805504.0', 'Bafang M410 center motor for 700c CRX10ZC3615F805504.0',
            (SELECT id FROM part_categories WHERE slug = 'motor'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 266, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        1848.1786, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'MM G333.250.CCB', 266,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Justerbar frempind no tools 25,4mm180mm
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-MQ579', 'Justerbar frempind no tools 25,4mm180mm', 'Justerbar frempind no tools 25,4mm180mm', 'Justerbar frempind no tools 25,4mm180mm', 'Justerbar frempind no tools 25,4mm180mm',
            (SELECT id FROM part_categories WHERE slug = 'stems'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 180, 15, 'USD',
        6.3164, 1.1, 180
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 180,
        104.2206, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'MQ-579', 15,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Display for Jensen V2
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-V2', 'Display for Jensen V2', 'Display for Jensen V2', 'Display for Jensen V2', 'Display for Jensen V2',
            (SELECT id FROM part_categories WHERE slug = 'display'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 50, 6.58, 'USD',
        6.2357, 1.3, 50
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 50,
        53.3402, 'purchase_order_line', v_pol_id, '2026-01-28'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'Display version 2', 6.58,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- 36v Display Canbus NTC card
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-DF130', '36v Display Canbus NTC card', '36v Display Canbus NTC card', '36v Display Canbus NTC card', '36v Display Canbus NTC card',
            (SELECT id FROM part_categories WHERE slug = 'display'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 110, 40.5, 'USD',
        7.0037, 1.1, 110
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 110,
        312.0148, 'purchase_order_line', v_pol_id, '2024-04-12'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'DF130', 40.5,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- AQ1,0 F180/R160 Adaptor A3
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-AARD000039', 'AQ1,0 F180/R160 Adaptor A3', 'AQ1,0 F180/R160 Adaptor A3', 'AQ1,0 F180/R160 Adaptor A3', 'AQ1,0 F180/R160 Adaptor A3',
            (SELECT id FROM part_categories WHERE slug = 'bremse_skive'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 1.39, 'USD',
        6.3289, 2, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        17.5943, 'purchase_order_line', v_pol_id, '2026-02-04'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'AARD000039', 1.39,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang speed sensor
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-SBF05', 'Bafang speed sensor', 'Bafang speed sensor', 'Bafang speed sensor', 'Bafang speed sensor',
            (SELECT id FROM part_categories WHERE slug = 'sensor'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 6.98, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        48.4973, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'SR PA011.12.S', 6.98,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Ananda M100 36v 250w Canbus JIS 24" speed 25
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('11688010300381', 'Ananda M100 36v 250w Canbus JIS 24" speed 25', 'Ananda M100 36v 250w Canbus JIS 24" speed 25', 'Ananda M100 36v 250w Canbus JIS 24" speed 25', 'Ananda M100 36v 250w Canbus JIS 24" speed 25',
            (SELECT id FROM part_categories WHERE slug = 'motor'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 258, 'USD',
        7.0037, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        1987.6501, 'purchase_order_line', v_pol_id, '2024-04-12'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'M100 - 250w 24', 258,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Semilav 53cm f. Bafang M410 center
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-SL53 B410C', 'Semilav 53cm f. Bafang M410 center', 'Semilav 53cm f. Bafang M410 center', 'Semilav 53cm f. Bafang M410 center', 'Semilav 53cm f. Bafang M410 center',
            (SELECT id FROM part_categories WHERE slug = 'frames'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 30, 54.9, 'USD',
        6.3164, 1.1, 30
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 30,
        381.4474, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'YT7CL530-1231', 54.9,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang sensor kabel 400mm
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-EB 1T1 q', 'Bafang sensor kabel 400mm', 'Bafang sensor kabel 400mm', 'Bafang sensor kabel 400mm', 'Bafang sensor kabel 400mm',
            (SELECT id FROM part_categories WHERE slug = 'sensor_kabel'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 2.86, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        19.8714, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'EB 1T1 q', 2.86,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- TR-180nRoto for 2 piston 6 bolts
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-AART000162', 'TR-180nRoto for 2 piston 6 bolts', 'TR-180nRoto for 2 piston 6 bolts', 'TR-180nRoto for 2 piston 6 bolts', 'TR-180nRoto for 2 piston 6 bolts',
            (SELECT id FROM part_categories WHERE slug = 'bremse_skive'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 2.81, 'USD',
        6.2357, 1.6, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        28.0357, 'purchase_order_line', v_pol_id, '2026-01-28'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'AART000162', 2.81,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Bafang Front motor f/disc 250w
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-FMG312.250', 'Bafang Front motor f/disc 250w', 'Bafang Front motor f/disc 250w', 'Bafang Front motor f/disc 250w', 'Bafang Front motor f/disc 250w',
            (SELECT id FROM part_categories WHERE slug = 'motor'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 100, 69.02, 'USD',
        6.3164, 1.1, 100
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 100,
        479.5537, 'purchase_order_line', v_pol_id, '2025-09-18'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'FM G312.250.D', 69.02,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

    -- Power kabel til Ananda M100 motoren
    INSERT INTO parts (internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure)
    VALUES ('JP-JP-C01', 'Power kabel til Ananda M100 motoren', 'Power kabel til Ananda M100 motoren', 'Power kabel til Ananda M100 motoren', 'Power kabel til Ananda M100 motoren',
            (SELECT id FROM part_categories WHERE slug = 'kabelsaet'), 'pcs')
    ON CONFLICT (internal_sku) DO UPDATE SET name_en = EXCLUDED.name_en
    RETURNING id INTO v_part_id;

    INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_factor, received_quantity
    ) VALUES (
        v_po_id, v_part_id, 110, 3.58, 'USD',
        7.0037, 1.1, 110
    ) RETURNING id INTO v_pol_id;

    INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id, occurred_at, reason
    ) VALUES (
        v_part_id, v_main_loc_id, 'received', 110,
        27.5806, 'purchase_order_line', v_pol_id, '2024-04-12'::timestamptz,
        'Legacy import from Excel'
    );

    INSERT INTO part_supplier_offerings (
        part_id, supplier_id, supplier_sku, default_purchase_price,
        default_purchase_currency, is_preferred
    ) VALUES (
        v_part_id, v_supplier_id, 'JP-C01', 3.58,
        'USD', TRUE
    ) ON CONFLICT (part_id, supplier_id) DO NOTHING;

END $migration$;

UPDATE purchase_orders po
SET total_amount = (SELECT SUM(quantity * unit_price) FROM purchase_order_lines WHERE purchase_order_id = po.id),
    total_currency = 'USD',
    received_date = '2024-01-01'
WHERE po_number = 'PO-LEGACY-IMPORT';

COMMIT;
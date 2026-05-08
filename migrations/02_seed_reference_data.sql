-- ============================================================================
-- Seed Reference Data v1.2 — Bilingual (Danish + English)
-- Run AFTER 01_schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BIKE TYPES
-- ----------------------------------------------------------------------------

INSERT INTO bike_types (slug, name_en, name_da, description_en, description_da, sort_order) VALUES
    ('pedal',       'Pedal Bike',     'Pedalcykel',         'Standard human-powered bicycle (no electric assist)',       'Almindelig pedalcykel uden elassistance',                       10),
    ('e_bike',      'Electric Bike',  'Elcykel',            'Electric pedal-assist bicycle with motor and battery',       'Elektrisk pedalassisteret cykel med motor og batteri',          20),
    ('tricycle',    'Tricycle',       'Trehjulet cykel',    'Three-wheeled bicycle (pedal or electric)',                  'Trehjulet cykel (pedal eller elektrisk)',                       30),
    ('cargo',       'Cargo Bike',     'Ladcykel',           'Cargo bike for transporting goods or passengers',            'Ladcykel til transport af varer eller passagerer',              40),
    ('hand_cycle',  'Hand Cycle',     'Håndcykel',          'Hand-powered cycle for accessibility use',                   'Håndtrukket cykel til tilgængelighedsformål',                   50),
    ('child',       'Child Bike',     'Børnecykel',         'Bike sized for children',                                    'Cykel i børnestørrelse',                                        60),
    ('other',       'Other',          'Andet',              'Other bike type not covered above',                          'Anden cykeltype ikke dækket ovenfor',                           99);

-- ----------------------------------------------------------------------------
-- BIKE IDENTIFIER TYPES
-- ----------------------------------------------------------------------------

INSERT INTO bike_identifier_types
    (slug, name_en, name_da, description_en, description_da, is_globally_unique, sort_order) VALUES
    ('frame_number',         'Frame Number',          'Stelnummer',         'Manufacturer frame serial number — natural unique key', 'Producentens stelnummer — naturlig unik nøgle',           TRUE,  10),
    ('lock_number',          'Lock Number',           'Låsenummer',         'Bike lock serial / key number',                          'Cykellåsens serienummer / nøglenummer',                   TRUE,  20),
    ('battery_lock_number',  'Battery Lock Number',   'Batterilåsenummer',  'Battery compartment lock number (e-bikes)',              'Nummer på batterirummets lås (elcykler)',                 TRUE,  30),
    ('battery_number',       'Battery Number',        'Batterinummer',      'Battery serial number (e-bikes)',                        'Batterinummer (elcykler)',                                TRUE,  40),
    ('charger_number',       'Charger Number',        'Opladernummer',      'Charger serial number (e-bikes)',                        'Opladernummer (elcykler)',                                TRUE,  50),
    ('qr_code',              'QR Code',               'QR-kode',            'Printed/affixed QR code',                                'Påsat QR-kode',                                            TRUE,  60),
    ('rfid_tag',             'RFID Tag',              'RFID-tag',           'RFID tag identifier',                                    'RFID-tag',                                                 TRUE,  70),
    ('airtag_uuid',          'AirTag UUID',           'AirTag-UUID',        'Apple AirTag identifier',                                'Apple AirTag-identifikator',                               TRUE,  80),
    ('gps_imei',             'GPS Tracker IMEI',      'GPS-sporings-IMEI',  'IMEI of attached GPS tracker',                           'IMEI på tilkoblet GPS-sporing',                            TRUE,  90),
    ('sim_number',           'SIM Card Number',       'SIM-kortnummer',     'SIM card / phone number for connected devices',          'SIM-kort / telefonnummer for tilsluttede enheder',         TRUE, 100),
    ('bluetooth_id',         'Bluetooth ID',          'Bluetooth-ID',       'Bluetooth peripheral identifier',                        'Bluetooth-perifer enheds identifikator',                   TRUE, 110),
    ('motor_serial',         'Motor Serial',          'Motorserie',         'Motor unit serial number (e-bikes)',                     'Motorens serienummer (elcykler)',                          TRUE, 120),
    ('display_serial',       'Display Serial',        'Display-serie',      'Display unit serial number (e-bikes)',                   'Displayens serienummer (elcykler)',                        TRUE, 130);

-- ----------------------------------------------------------------------------
-- BIKE TYPE → REQUIRED IDENTIFIERS
-- ----------------------------------------------------------------------------

INSERT INTO bike_type_required_identifiers (bike_type_id, bike_identifier_type_id, is_required)
SELECT (SELECT id FROM bike_types WHERE slug = 'pedal'),
       (SELECT id FROM bike_identifier_types WHERE slug = 'frame_number'), TRUE
UNION ALL SELECT (SELECT id FROM bike_types WHERE slug = 'pedal'),
       (SELECT id FROM bike_identifier_types WHERE slug = 'lock_number'), TRUE;

INSERT INTO bike_type_required_identifiers (bike_type_id, bike_identifier_type_id, is_required)
SELECT (SELECT id FROM bike_types WHERE slug = 'e_bike'),
       (SELECT id FROM bike_identifier_types WHERE slug = s), TRUE
FROM (VALUES ('frame_number'), ('lock_number'), ('battery_lock_number'),
             ('battery_number'), ('charger_number')) AS t(s);

INSERT INTO bike_type_required_identifiers (bike_type_id, bike_identifier_type_id, is_required)
SELECT (SELECT id FROM bike_types WHERE slug = 'tricycle'),
       (SELECT id FROM bike_identifier_types WHERE slug = s), TRUE
FROM (VALUES ('frame_number'), ('lock_number')) AS t(s);

INSERT INTO bike_type_required_identifiers (bike_type_id, bike_identifier_type_id, is_required)
SELECT (SELECT id FROM bike_types WHERE slug = 'cargo'),
       (SELECT id FROM bike_identifier_types WHERE slug = s), TRUE
FROM (VALUES ('frame_number'), ('lock_number')) AS t(s);

INSERT INTO bike_type_required_identifiers (bike_type_id, bike_identifier_type_id, is_required)
SELECT (SELECT id FROM bike_types WHERE slug = 'cargo'),
       (SELECT id FROM bike_identifier_types WHERE slug = s), FALSE
FROM (VALUES ('battery_lock_number'), ('battery_number'), ('charger_number')) AS t(s);

INSERT INTO bike_type_required_identifiers (bike_type_id, bike_identifier_type_id, is_required)
SELECT bt.id, (SELECT id FROM bike_identifier_types WHERE slug = 'frame_number'), TRUE
FROM bike_types bt WHERE bt.slug IN ('hand_cycle', 'child', 'other');

-- ----------------------------------------------------------------------------
-- CUSTOMER SEGMENTS
-- ----------------------------------------------------------------------------

INSERT INTO customer_segments (slug, name_en, name_da, description_en, description_da, sort_order) VALUES
    ('hotel',                'Hotel',                'Hotel',               'Hotels and hospitality (core Jensen Production segment)', 'Hoteller og restaurationsbranchen (Jensen Productions kernesegment)',  10),
    ('hospital',             'Hospital',             'Hospital',            'Hospitals and healthcare facilities',                     'Hospitaler og sundhedsfaciliteter',                                    20),
    ('municipality',         'Municipality',         'Kommune',             'Danish kommuner and other municipal customers',           'Kommuner og andre kommunale kunder',                                   30),
    ('facility_management',  'Facility Management',  'Facility Management', 'FM companies managing buildings/sites',                   'FM-virksomheder der administrerer bygninger eller områder',            40),
    ('b2b',                  'Business (B2B)',       'Erhverv (B2B)',       'Generic business customers',                              'Generelle erhvervskunder',                                             50),
    ('b2c',                  'Consumer (B2C)',       'Privat (B2C)',        'Private individuals',                                     'Privatpersoner',                                                       60),
    ('rental_company',       'Rental Company',       'Udlejningsfirma',     'Bike rental / sharing operators',                         'Cykeludlejning / -delingsoperatører',                                  70),
    ('other',                'Other',                'Andet',               'Other segment not covered above',                         'Andet segment ikke dækket ovenfor',                                    99);

-- ----------------------------------------------------------------------------
-- TAX IDENTIFIER TYPES
-- ----------------------------------------------------------------------------

INSERT INTO tax_identifier_types (code, name_en, name_da, description_en, description_da, country_code, format_regex) VALUES
    ('CVR',        'Danish Company Registration (CVR)',      'CVR-nummer',                          'Centralt Virksomhedsregister number',     'Nummer fra Det Centrale Virksomhedsregister',  'DK', '^\d{8}$'),
    ('EAN',        'Danish Public Sector EAN (GLN)',         'EAN-lokationsnummer',                 'Global Location Number for e-invoicing',  'EAN-nummer til offentlig e-fakturering',       'DK', '^\d{13}$'),
    ('VAT_DK',     'Danish VAT Number',                      'Dansk momsnummer',                    'Danish VAT (moms) number',                'Dansk momsregistreringsnummer',                'DK', '^DK\d{8}$'),
    ('VAT_EU',     'EU VAT Number',                          'EU-momsnummer',                       'EU VAT identification number',            'EU-momsidentifikationsnummer',                  NULL, NULL),
    ('EORI',       'EU EORI Number',                         'EORI-nummer',                         'Economic Operators Registration (customs)', 'EORI (told og afgift)',                       NULL, NULL),
    ('ORG_NR_NO',  'Norwegian Organization Number',          'Norsk organisationsnummer',           'Norwegian Org. nr.',                       'Norsk org. nr.',                                'NO', '^\d{9}$'),
    ('ORG_NR_SE',  'Swedish Organization Number',            'Svensk organisationsnummer',          'Swedish Organisationsnummer',              'Svensk organisationsnummer',                    'SE', '^\d{6}-?\d{4}$'),
    ('UID_DE',     'German Tax Number (USt-IdNr)',           'Tysk skatte-id (USt-IdNr)',           'German VAT ID',                            'Tysk moms-ID',                                  'DE', '^DE\d{9}$'),
    ('VAT_GB',     'UK VAT Number',                          'Britisk momsnummer',                  'UK VAT registration number',               'Britisk momsregistreringsnummer',               'GB', '^GB\d{9}$'),
    ('EIN_US',     'US Employer ID (EIN)',                   'Amerikansk arbejdsgiver-ID (EIN)',    'US Employer Identification Number',        'Amerikansk arbejdsgiveridentifikationsnummer',  'US', '^\d{2}-?\d{7}$'),
    ('OTHER',      'Other Tax Identifier',                   'Andet skatteidentifikator',           'Free-form identifier with custom format',   'Frit-format identifikator',                    NULL, NULL);

-- ----------------------------------------------------------------------------
-- VAT CODES
-- ----------------------------------------------------------------------------

INSERT INTO vat_codes (code, name_en, name_da, description_en, description_da, default_rate, country_code, is_reverse_charge, is_export) VALUES
    ('DK_STANDARD',       'Danish Standard VAT',         'Dansk standardmoms',          'Standard 25% Danish moms',                       'Standard dansk moms 25%',                                   25.00, 'DK', FALSE, FALSE),
    ('DK_ZERO',           'Danish Zero-Rated',           'Dansk nulmoms',               'Zero-rated supply (specific exempt categories)',  'Nulmomsbelagt leverance (specifikke undtagne kategorier)',   0.00, 'DK', FALSE, FALSE),
    ('EU_REVERSE_CHARGE', 'EU Reverse Charge',           'EU omvendt betalingspligt',   'B2B sales to EU VAT-registered customers',        'B2B-salg til EU-momsregistrerede kunder',                    0.00, NULL, TRUE,  FALSE),
    ('NON_EU_EXPORT',     'Non-EU Export',               'Eksport uden for EU',         'Export outside the EU — zero-rated',              'Eksport uden for EU — nulmoms',                              0.00, NULL, FALSE, TRUE),
    ('EU_DISTANCE_DK',    'EU Distance Sale (DK rate)',  'EU-fjernsalg (DK-sats)',      'Distance selling within EU below threshold',     'Fjernsalg inden for EU under tærskel',                      25.00, 'DK', FALSE, FALSE),
    ('EU_OSS',            'EU OSS (destination rate)',   'EU OSS (destinationssats)',   'One-Stop Shop — apply destination country rate',  'One-Stop Shop — anvend destinationsland-sats',               0.00, NULL, FALSE, FALSE),
    ('EXEMPT',            'VAT Exempt',                  'Momsfri',                     'VAT-exempt supply (medical, financial, etc.)',    'Momsfri leverance (medicinsk, finansiel, osv.)',             0.00, NULL, FALSE, FALSE);

-- ----------------------------------------------------------------------------
-- INITIAL FX RATES
-- ----------------------------------------------------------------------------

INSERT INTO fx_rates (from_currency, to_currency, rate, rate_date, source) VALUES
    ('USD', 'DKK', 6.4100, '2026-04-30', 'manual_seed'),
    ('EUR', 'DKK', 7.4700, '2026-04-30', 'manual_seed'),
    ('GBP', 'DKK', 8.7000, '2026-04-30', 'manual_seed'),
    ('SEK', 'DKK', 0.6700, '2026-04-30', 'manual_seed'),
    ('NOK', 'DKK', 0.6300, '2026-04-30', 'manual_seed'),
    ('CNY', 'DKK', 0.8900, '2026-04-30', 'manual_seed'),
    ('CHF', 'DKK', 7.5000, '2026-04-30', 'manual_seed'),
    ('PLN', 'DKK', 1.7300, '2026-04-30', 'manual_seed');

-- ----------------------------------------------------------------------------
-- DEFAULT SUPPLIER
-- ----------------------------------------------------------------------------

INSERT INTO suppliers (name, country_code, default_currency, is_active) VALUES
    ('Eastek HK', 'HK', 'USD', TRUE);

-- ----------------------------------------------------------------------------
-- CUSTOMER GROUPS
-- ----------------------------------------------------------------------------

INSERT INTO customer_groups (slug, name_en, name_da, description_en, description_da, default_discount_percent) VALUES
    ('retail',    'Retail',    'Detail',     'Standard retail pricing',  'Standard detailpris',     0.00),
    ('wholesale', 'Wholesale', 'Engros',     'Wholesale partners',       'Engrospartnere',         15.00),
    ('corporate', 'Corporate', 'Erhverv',    'Large corporate accounts', 'Store erhvervskonti',    20.00);

-- ----------------------------------------------------------------------------
-- DOCUMENT SEQUENCES
-- ----------------------------------------------------------------------------

INSERT INTO document_sequences (document_type, year, current_value, prefix, pad_width) VALUES
    ('invoice',              2026, 0, 'INV', 4),
    ('sales_order',          2026, 0, 'SO',  4),
    ('offer',                2026, 0, 'OFF', 4),
    ('purchase_order',       2026, 0, 'PO',  4),
    ('manufacturing_order',  2026, 0, 'MO',  4),
    ('work_order',           2026, 0, 'WO',  4),
    ('maintenance_ticket',   2026, 0, 'TKT', 4),
    ('shipment',             2026, 0, 'SHP', 4);

-- ----------------------------------------------------------------------------
-- PART CATEGORIES (top-level set from prototype + sub-categories from Excel)
-- ----------------------------------------------------------------------------

INSERT INTO part_categories (slug, name_en, name_da, sort_order) VALUES
    ('frames',           'Frames',           'Stel',                 10),
    ('forks',            'Forks',            'Forgafler',            20),
    ('headsets',         'Headsets',         'Styrlejer',            30),
    ('stems',            'Stems',            'Frempinde',            40),
    ('handlebars',       'Handlebars',       'Styr',                 50),
    ('grips',            'Grips',            'Håndtag',              60),
    ('brake_levers',     'Brake Levers',     'Bremsegreb',           70),
    ('front_brake',      'Front Brake',      'Forbremse',            80),
    ('rear_brake',       'Rear Brake',       'Bagbremse',            90),
    ('seat_clamps',      'Seat Clamps',      'Sadelpindsklamper',   100),
    ('seat_posts',       'Seat Posts',       'Sadelpinde',          110),
    ('saddle',           'Saddle',           'Saddel',              120),
    ('rims',             'Rims',             'Fælge',               130),
    ('spokes',           'Spokes',           'Eger',                140),
    ('tires',            'Tires',            'Dæk',                 150),
    ('tubes',            'Tubes',            'Slanger',             160),
    ('rim_tapes',        'Rim Tapes',        'Fælgbånd',            170),
    ('front_hub',        'Front Hub',        'Fornav',              180),
    ('rear_hub',         'Rear Hub',         'Bagnav',              190),
    ('gear_shifter',     'Gear Shifter',     'Gearskifter',         200),
    ('cables',           'Cables',           'Kabler',              210),
    ('bottom_bracket',   'Bottom Bracket',   'Krankboks',           220),
    ('crank_set',        'Crank Set',        'Kranksæt',            230),
    ('chain',            'Chain',            'Kæde',                240),
    ('rear_sprocket',    'Rear Sprocket',    'Baghjulstandhjul',    250),
    ('front_sprocket',   'Front Sprocket',   'Fortandhjul',         260),
    ('mudguards_stays',  'Mudguards & Stays','Skærme & stivere',    270),
    ('kickstand',        'Kickstand',        'Støtteben',           280),
    ('stabilizer',       'Stabilizer',       'Støttehjul',          290),
    ('bell',             'Bell',             'Klokke',              300),
    ('pedals',           'Pedals',           'Pedaler',             310),
    ('basket',           'Basket',           'Kurv',                320),
    ('front_carrier',    'Front Carrier',    'Forbagagebærer',      330),
    ('rear_carrier',     'Rear Carrier',     'Bagagebærer',         340),
    ('reflectors',       'Reflectors',       'Reflekser',           350),
    ('screws_nuts',      'Screws and Nuts',  'Skruer og møtrikker', 360),
    ('motor_system',     'Motor System',     'Motorsystem',         400),
    ('battery_system',   'Battery System',   'Batterisystem',       500),
    ('lighting',         'Lighting',         'Belysning',           600),
    ('locks',            'Locks',            'Låse',                700);

-- Sub-categories
INSERT INTO part_categories (slug, name_en, name_da, parent_id, sort_order)
SELECT 'motor',           'Motor',                'Motor',
       (SELECT id FROM part_categories WHERE slug = 'motor_system'), 410
UNION ALL SELECT 'motor_cover',     'Motor Cover',          'Motorcover',
       (SELECT id FROM part_categories WHERE slug = 'motor_system'), 420
UNION ALL SELECT 'controller',      'Motor Controller',     'Motorcontroller',
       (SELECT id FROM part_categories WHERE slug = 'motor_system'), 430
UNION ALL SELECT 'display',         'Display',              'Display',
       (SELECT id FROM part_categories WHERE slug = 'motor_system'), 440
UNION ALL SELECT 'sensor',          'Speed/Torque Sensor',  'Hastigheds-/momentsensor',
       (SELECT id FROM part_categories WHERE slug = 'motor_system'), 450
UNION ALL SELECT 'motor_kabel',     'Motor Cable',          'Motorkabel',
       (SELECT id FROM part_categories WHERE slug = 'cables'), 211
UNION ALL SELECT 'display_kabel',   'Display Cable',        'Displaykabel',
       (SELECT id FROM part_categories WHERE slug = 'cables'), 212
UNION ALL SELECT 'sensor_kabel',    'Sensor Cable',         'Sensorkabel',
       (SELECT id FROM part_categories WHERE slug = 'cables'), 213
UNION ALL SELECT 'kabelsaet',       'Cable Set',            'Kabelsæt',
       (SELECT id FROM part_categories WHERE slug = 'cables'), 214
UNION ALL SELECT 'ledninger',       'Wiring',               'Ledninger',
       (SELECT id FROM part_categories WHERE slug = 'cables'), 215
UNION ALL SELECT 'krankarme',       'Crank Arms',           'Krankarme',
       (SELECT id FROM part_categories WHERE slug = 'crank_set'), 231
UNION ALL SELECT 'tandhjul_for',    'Front Chainwheel',     'Forkædehjul',
       (SELECT id FROM part_categories WHERE slug = 'front_sprocket'), 261
UNION ALL SELECT 'bremse_skive',    'Brake Disc',           'Bremseskive',
       (SELECT id FROM part_categories WHERE slug = 'front_brake'), 81;

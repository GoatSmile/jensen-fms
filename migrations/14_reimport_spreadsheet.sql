-- ============================================================================
-- 14 — Re-import FleetManager_Eksport (5).xlsx as historical PO lines
-- ============================================================================
-- Each spreadsheet row = one historical purchase. price → unit_price,
-- date → purchase_orders.order_date. Rows grouped by (supplier, date) into
-- one purchase_order with status='received'.
--
-- FX rates use rough 2024-2025 averages (USD=6.95, EUR=7.45, DKK=1.0).
-- transport_pct = 0.10 default, tariff_pct = 0 (Dennis assigns HS codes
-- via /admin/hs-codes once that page exists).
--
-- Existing PO data + 168 NULL-source 'received' movements wiped first;
-- the work_order_part consumption movement is preserved.
-- ============================================================================

-- 1. Wipe existing PO / received-movement data.
DELETE FROM inventory_movements
  WHERE source_entity_type IS NULL
     OR source_entity_type = 'purchase_order_line';
DELETE FROM purchase_order_lines;
DELETE FROM purchase_orders;

-- 2. Stage spreadsheet rows in a temp table.
CREATE TEMP TABLE _import_lines (
  row_no     INT GENERATED ALWAYS AS IDENTITY,
  supplier   TEXT NOT NULL,
  sku        TEXT NOT NULL,
  qty        NUMERIC NOT NULL,
  price      NUMERIC NOT NULL,
  currency   CHAR(3) NOT NULL,
  order_date DATE NOT NULL,
  notes      TEXT
) ON COMMIT DROP;

INSERT INTO _import_lines (supplier, sku, qty, price, currency, order_date, notes) VALUES
  ('Eastek Handel GmbH', 'JP-BJB-445', 200.0, 4.88, 'EUR', DATE '2025-09-19', NULL),
  ('Eastek HK', 'JP-SH-M405', 200.0, 3.38, 'USD', DATE '2025-05-14', NULL),
  ('Eastek HK', 'JP-BK01', 1000.0, 0.35, 'USD', DATE '2024-12-18', NULL),
  ('Metacoat A/S', 'JP-lak20 std', 1.0, 225.0, 'DKK', DATE '2026-02-11', NULL),
  ('Eastek HK', 'JP-MQ579', 180.0, 15.0, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'JP-SLFB', 25.0, 73.3, 'USD', DATE '2025-02-03', NULL),
  ('RYDE', 'JP-And20', 600.0, 9.5, 'EUR', DATE '2024-05-16', NULL),
  ('Eastek HK', 'JP-WO-Fr 22T', 100.0, 36.8, 'USD', DATE '2024-12-18', NULL),
  ('Herrmans Bike Company Ltd', '5050-0008', 3000.0, 0.12, 'EUR', DATE '2025-02-21', NULL),
  ('Herrmans Bike Company Ltd', 'JP-LGS90', 750.0, 1.14, 'EUR', DATE '2025-12-16', NULL),
  ('Eastek HK', 'JP-WSLFH01', 100.0, 73.3, 'USD', DATE '2024-12-18', NULL),
  ('SKS metalplast Scheffer-Klute GmbH', 'JP-SKSA46', 100.0, 6.13, 'EUR', DATE '2024-01-08', NULL),
  ('Herrmans Bike Company Ltd', '5104-0025', 270.0, 0.51, 'EUR', DATE '2025-02-21', NULL),
  ('Eastek HK', 'JP-SBF05rb', 50.0, 6.98, 'USD', DATE '2021-10-21', NULL),
  ('Eastek HK', 'JP-KRD-241113-700c', 150.0, 5.8, 'USD', DATE '2025-09-18', NULL),
  ('Herrmans Bike Company Ltd', '4117-0011', 270.0, 1.64, 'EUR', DATE '2025-02-21', NULL),
  ('Eastek HK', 'JP-SS60', 200.0, 2.9, 'USD', DATE '2023-03-22', NULL),
  ('Eastek HK', 'JP-CO40', 100.0, 3.07, 'USD', DATE '2025-05-14', NULL),
  ('Ralf Bohle GmbH', 'JP-S24', 500.0, 1.62, 'EUR', DATE '2025-03-07', NULL),
  ('Eastek HK', 'JP-SR SD021.01', 100.0, 5.73, 'USD', DATE '2025-09-18', NULL),
  ('Sunrace Sturmey Archer Europe BV', 'JP-CBX-FD', 350.0, 0.4, 'EUR', DATE '2025-12-08', NULL),
  ('Eastek HK', 'JP-MM G333-0120A', 100.0, 2.69, 'USD', DATE '2025-09-18', NULL),
  ('PortaPower (China) Limited', 'JP-BH CWF1', 135.0, 9.0, 'USD', DATE '2026-02-09', NULL),
  ('Shimano Nordic', 'JP-ES54', 24.0, 69.0, 'DKK', DATE '2023-03-16', NULL),
  ('Shimano Nordic', 'JP-ASM7RF', 124.0, 3.38, 'EUR', DATE '2023-11-20', NULL),
  ('Eastek HK', 'SH-M402', 180.0, 2.38, 'USD', DATE '2023-12-07', NULL),
  ('Selle Royal Group', 'Jp-SRB67L', 75.0, 41.95, 'EUR', DATE '2022-10-03', NULL),
  ('Herrmans Bike Company Ltd', 'JP-KS38m', 260.0, 5.9, 'EUR', DATE '2025-12-09', NULL),
  ('Eastek HK', 'JP-CR S105.250.SN', 36.0, 41.9, 'USD', DATE '2021-10-25', NULL),
  ('Herrmans Bike Company Ltd', '3090-0006', 550.0, 0.29, 'EUR', DATE '2025-02-21', NULL),
  ('Eastek HK', 'JP-DP-C15', 40.0, 25.3, 'USD', DATE '2021-10-25', NULL),
  ('Shimano Nordic', 'JP-ASL3', 40.0, 4.74, 'USD', DATE '2023-12-28', NULL),
  ('E. Meyer GmbH', 'JP-Ni Stug', 30.0, 14.65, 'EUR', DATE '2024-03-06', NULL),
  ('E. Meyer GmbH', 'JP-S28DV-D', 300.0, 1.9, 'EUR', DATE '2023-04-21', NULL),
  ('Søndergaard Sønner A/S', 'JP-SM28-DK', 100.0, 134.95, 'DKK', DATE '2024-05-29', NULL),
  ('Ralf Bohle GmbH', 'JP-S28DV', 750.0, 1.53, 'EUR', DATE '2024-12-05', NULL),
  ('Søndergaard Sønner A/S', 'JP-SRC01DK', 105.0, 108.0, 'DKK', DATE '2024-03-25', NULL),
  ('Eastek HK', 'JP-SP207', 180.0, 2.45, 'USD', DATE '2023-12-07', NULL),
  ('Ralf Bohle GmbH', 'JP-SM37-622', 740.0, 13.44, 'EUR', DATE '2024-12-05', NULL),
  ('Eastek HK', 'JP-LS2b', 100.0, 21.5, 'USD', DATE '2024-12-18', NULL),
  ('Eastek HK', 'JP-ZS3714-21', 100.0, 34.29, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'JP-AART000162', 100.0, 2.81, 'USD', DATE '2026-01-28', NULL),
  ('Herrmans Bike Company Ltd', '5101-0025.1', 540.0, 0.01, 'EUR', DATE '2025-02-21', NULL),
  ('Eastek HK', 'JP-MM G333.250.CCB', 100.0, 265.99, 'USD', DATE '2025-09-18', NULL),
  ('Büchel GmbH KG', 'JP-D4 sølv', 609.0, 5.8, 'EUR', DATE '2026-02-02', NULL),
  ('Eastek HK', 'JP-MM G333-0121A', 100.0, 3.97, 'USD', DATE '2026-02-05', NULL),
  ('Metacoat A/S', 'JP-lak10 std', 1.0, 310.0, 'DKK', DATE '2026-02-11', NULL),
  ('Eastek HK', 'JP-G55', 98.0, 3.9, 'USD', DATE '2025-02-03', NULL),
  ('RYDE', 'JP-And700', 600.0, 10.7, 'EUR', DATE '2024-07-30', NULL),
  ('Eastek HK', 'JP-V2', 50.0, 6.58, 'USD', DATE '2026-01-28', NULL),
  ('Metacoat A/S', 'JP-lak20 svaj', 1.0, 271.0, 'DKK', DATE '2026-02-11', NULL),
  ('Herrmans Bike Company Ltd', 'JP-FL10', 150.0, 19.22, 'EUR', DATE '2023-12-05', NULL),
  ('Eastek HK', 'JP-FMG312.250', 100.0, 69.02, 'USD', DATE '2025-09-18', NULL),
  ('Shimano Nordic', 'JP-ASM3', 40.0, 1.52, 'USD', DATE '2023-12-28', NULL),
  ('Eastek HK', 'JP-EB 1T1 q', 100.0, 2.86, 'USD', DATE '2025-09-18', NULL),
  ('Herrmans Bike Company Ltd', 'JP-LGS123', 750.0, 1.2, 'EUR', DATE '2024-09-11', NULL),
  ('Selle Royal Group', 'Jp-SRVir', 400.0, 10.8, 'EUR', DATE '2024-07-30', NULL),
  ('Eastek HK', 'JP-WO-G55t', 100.0, 3.76, 'USD', DATE '2024-12-18', NULL),
  ('Herrmans Bike Company Ltd', '5104-0175', 270.0, 0.26, 'EUR', DATE '2025-02-21', NULL),
  ('Ursus S.p.A.', 'JP-J275t', 180.0, 0.84, 'EUR', DATE '2026-01-08', NULL),
  ('Eastek HK', 'JP-SP4-34', 98.0, 7.6, 'USD', DATE '2025-02-03', NULL),
  ('Shimano Nordic', 'JP-DS7g', 150.0, 4.31, 'EUR', DATE '2023-11-20', NULL),
  ('Eastek HK', 'JP-CR A101.C', 90.0, 29.36, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'JP-TRT 4p', 300.0, 2.89, 'USD', DATE '2023-12-07', NULL),
  ('Eastek HK', 'JP-WO-Sp 55T CDX', 100.0, 32.6, 'USD', DATE '2024-12-18', NULL),
  ('Sunrace Sturmey Archer Europe BV', 'JP-NX-FD', 900.0, 0.22, 'EUR', DATE '2025-12-08', NULL),
  ('Metacoat A/S', 'JP-lak1 std', 1.0, 450.0, 'DKK', DATE '2026-02-11', NULL),
  ('Eastek HK', '1BR-ST4 - RCM01', 220.0, 12.39, 'USD', DATE '2023-12-07', NULL),
  ('E. Meyer GmbH', 'JP-S24-D', 200.0, 2.0, 'EUR', DATE '2023-04-21', NULL),
  ('Eastek HK', 'JP-EB 180', 40.0, 4.8, 'USD', DATE '2021-10-18', NULL),
  ('Eastek HK', 'JP-YWS-EL3 HP', 200.0, 8.75, 'USD', DATE '2025-05-14', NULL),
  ('MessingschKG', 'JP-K32170', 300.0, 7.9, 'EUR', DATE '2025-12-04', NULL),
  ('Shimano Nordic', 'JP-ES54', 24.0, 69.0, 'DKK', DATE '2023-03-16', NULL),
  ('Eastek HK', 'JP-EB D40', 75.0, 3.9, 'USD', DATE '2021-10-25', NULL),
  ('Metacoat A/S', 'JP-lak1 svaj', 1.0, 310.0, 'DKK', DATE '2026-02-11', NULL),
  ('Shimano Nordic', 'JP-SH20', 70.0, 0.74, 'EUR', DATE '2023-11-20', NULL),
  ('Eastek HK', 'JP-DP C080.C', 100.0, 25.95, 'USD', DATE '2025-09-18', NULL),
  ('Selle Royal Group', 'Jp-SRB67Lady', 75.0, 41.95, 'EUR', DATE '2022-10-03', NULL),
  ('Herrmans Bike Company Ltd', 'JP-LGS123r', 150.0, 1.2, 'EUR', DATE '2024-09-11', NULL),
  ('Eastek HK', 'JP-WO-B120T', 100.0, 41.7, 'USD', DATE '2024-12-18', NULL),
  ('Eastek HK', 'JP-SL48 B410C', 70.0, 54.9, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'JP-WSBH01', 100.0, 36.0, 'USD', DATE '2024-12-18', NULL),
  ('Herrmans Bike Company Ltd', '1715-0001', 400.0, 0.58, 'EUR', DATE '2025-02-21', NULL),
  ('Herrmans Bike Company Ltd', 'JP-RL10', 150.0, 2.48, 'EUR', DATE '2026-02-13', NULL),
  ('Eastek HK', 'JP-EB S1T1 013', 100.0, 1.13, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'JP-B12-r', 128.0, 15.0, 'USD', DATE '2022-06-14', NULL),
  ('Eastek HK', 'JP-EB 1T1 U', 100.0, 2.96, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'LC69R', 220.0, 0.75, 'USD', DATE '2023-12-07', NULL),
  ('Ursus S.p.A.', 'JP-Kis', 200.0, 4.3, 'EUR', DATE '2026-01-08', NULL),
  ('RYDE', 'JP-And24', 600.0, 9.5, 'EUR', DATE '2024-05-16', NULL),
  ('Ralf Bohle GmbH', 'JP-S20', 500.0, 1.49, 'EUR', DATE '2025-03-07', NULL),
  ('Eastek HK', 'JP-DP-C080', 100.0, 25.95, 'USD', DATE '2025-09-18', NULL),
  ('Shimano Nordic', 'JP-SH18', 130.0, 0.69, 'EUR', DATE '2023-11-20', NULL),
  ('Eastek HK', 'JP-CA170', 98.0, 5.5, 'USD', DATE '2025-02-03', NULL),
  ('Eastek HK', 'JP-SLFFH01', 100.0, 11.0, 'USD', DATE '2025-05-14', NULL),
  ('Herrmans Bike Company Ltd', '4053-0005', 144.0, 2.95, 'EUR', DATE '2025-02-21', NULL),
  ('Sunrace Sturmey Archer Europe BV', 'JP-AX-FD', 350.0, 0.99, 'EUR', DATE '2025-12-08', NULL),
  ('E. Meyer GmbH', 'JP-Ni42', 70.0, 15.0, 'EUR', DATE '2023-09-29', NULL),
  ('Shimano Nordic', 'JP-7gCADXR', 124.0, 53.88, 'EUR', DATE '2023-11-20', NULL),
  ('Eastek HK', 'JP-FMG312.250R', 36.0, 103.2, 'USD', DATE '2021-10-25', NULL),
  ('Eastek HK', 'JP-KRD-241113-700', 220.0, 5.8, 'USD', DATE '2025-05-14', NULL),
  ('Eastek HK', 'JP-EB D180', 40.0, 3.9, 'USD', DATE '2021-10-25', NULL),
  ('Shimano Nordic', 'JP-ESRT54', 50.0, 4.41, 'USD', DATE '2023-12-28', NULL),
  ('Eastek HK', 'QC700CST201', 50.0, 149.73, 'USD', DATE '2023-12-07', NULL),
  ('Shimano Nordic', 'JP-ISG11-32', 10.0, 160.0, 'DKK', DATE '2023-03-16', NULL),
  ('Eastek HK', 'CJ700CST201-1', 50.0, 149.74, 'USD', DATE '2023-12-07', NULL),
  ('Eastek HK', 'JP-SLFFH01', 110.0, 11.0, 'USD', DATE '2025-05-14', NULL),
  ('PortaPower (China) Limited', 'JP-504KL', 135.0, 190.0, 'USD', DATE '2026-02-09', NULL),
  ('Eastek HK', 'JP-CDX CT11555AA', 98.0, 33.7, 'USD', DATE '2025-02-03', NULL),
  ('Eastek HK', 'JP-WO-PD5 JIS 170 R/L', 100.0, 11.2, 'USD', DATE '2024-12-18', NULL),
  ('PortaPower (China) Limited', 'JP-VDE 42v', 135.0, 12.0, 'USD', DATE '2026-02-09', NULL),
  ('Eastek HK', 'JP-VP810', 400.0, 2.46, 'USD', DATE '2025-05-14', NULL),
  ('Eastek HK', 'JP-SL48 Belt', 130.0, 26.3, 'USD', DATE '2025-05-14', NULL),
  ('Søndergaard Sønner A/S', 'JP-SM26', 6.0, 177.95, 'DKK', DATE '2023-05-17', NULL),
  ('E. Meyer GmbH', 'JP-SM28-D', 300.0, 18.73, 'EUR', DATE '2023-04-21', NULL),
  ('Eastek HK', 'JP-LB01', 500.0, 0.36, 'USD', DATE '2025-06-10', NULL),
  ('Herrmans Bike Company Ltd', 'JP-Br13', 260.0, 0.23, 'EUR', DATE '2025-12-09', NULL),
  ('Eastek HK', 'JP-EB 40', 40.0, 4.8, 'USD', DATE '2021-10-18', NULL),
  ('Sunrace Sturmey Archer Europe BV', 'JP-WX-FD', 900.0, 0.12, 'EUR', DATE '2025-12-08', NULL),
  ('Søndergaard Sønner A/S', 'JP-S26DV', 6.0, 26.0, 'DKK', DATE '2023-05-17', NULL),
  ('Eastek HK', 'JP-CK A01 170', 100.0, 6.59, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'JP-SBF05', 100.0, 6.98, 'USD', DATE '2025-09-18', NULL),
  ('Metacoat A/S', 'JP-lak10 svaj', 1.0, 285.0, 'DKK', DATE '2026-02-11', NULL),
  ('Eastek HK', 'JP-B-CDX 120', 98.0, 41.6, 'USD', DATE '2025-02-03', NULL),
  ('Eastek HK', 'JP-EC100', 128.0, 21.6, 'USD', DATE '2023-06-26', NULL),
  ('Eastek HK', 'JP-H171', 300.0, 1.9, 'USD', DATE '2025-05-14', NULL),
  ('Eastek HK', 'JP-AARD000039', 100.0, 1.39, 'USD', DATE '2026-02-04', NULL),
  ('Eastek HK', 'JP-AL28', 210.0, 3.72, 'USD', DATE '2025-05-14', NULL),
  ('Eastek HK', 'JP-SLFH01', 75.0, 73.3, 'USD', DATE '2024-05-14', NULL),
  ('Eastek HK', 'JP-SL53 Belt', 70.0, 26.3, 'USD', DATE '2025-05-14', NULL),
  ('Eastek HK', '11688010300381', 100.0, 258.0, 'USD', DATE '2024-04-12', NULL),
  ('Eastek HK', 'JP-FWCDX', 98.0, 37.9, 'USD', DATE '2025-02-03', NULL),
  ('Eastek HK', 'JP-THB-F', 150.0, 25.06, 'USD', DATE '2023-12-07', NULL),
  ('Herrmans Bike Company Ltd', '1715-0008', 400.0, 0.54, 'EUR', DATE '2025-02-21', NULL),
  ('Eastek HK', 'JP-THB-B', 150.0, 27.46, 'USD', DATE '2023-12-07', NULL),
  ('Herrmans Bike Company Ltd', 'JP-Br13s', 450.0, 0.01, 'EUR', DATE '2026-02-13', NULL),
  ('Shimano Nordic', 'JP-ASG3dx', 40.0, 25.05, 'USD', DATE '2023-12-28', NULL),
  ('Ursus S.p.A.', 'JP-J275', 180.0, 14.84, 'EUR', DATE '2026-01-08', NULL),
  ('Eastek HK', 'JP-JB01', 100.0, 2.75, 'USD', DATE '2025-09-18', NULL),
  ('E. Meyer GmbH', 'JP-S20-D', 200.0, 1.85, 'EUR', DATE '2023-04-21', NULL),
  ('Eastek HK', 'JP-WSB', 200.0, 15.7, 'USD', DATE '2024-12-18', NULL),
  ('Shimano Nordic', 'JP-7gDAAS', 45.0, 51.88, 'EUR', DATE '2023-11-20', NULL),
  ('Cycle Service Nordic', 'JP-PC1', 300.0, 30.0, 'DKK', DATE '2025-11-27', NULL),
  ('Eastek HK', 'JP-EB 1T1.FX', 100.0, 5.73, 'USD', DATE '2025-09-18', NULL),
  ('Eastek HK', 'JP-CW G3320.1A', 100.0, 15.2, 'USD', DATE '2025-09-18', NULL),
  ('Sunrace Sturmey Archer Europe BV', 'JP-X-FD', 300.0, 26.21, 'EUR', DATE '2025-12-08', NULL),
  ('Shimano Nordic', 'JP-ASM7R', 120.0, 3.77, 'EUR', DATE '2023-11-20', NULL),
  ('E. Meyer GmbH', 'JP-SM24-D', 150.0, 14.05, 'EUR', DATE '2023-04-21', NULL),
  ('Eastek HK', 'JP-SL53 B410C', 30.0, 54.9, 'USD', DATE '2025-09-18', NULL),
  ('E. Meyer GmbH', 'JP-SM20-D', 150.0, 11.4, 'EUR', DATE '2023-04-21', NULL),
  ('Eastek HK', 'JP-EB S1T1 013r', 100.0, 1.13, 'USD', DATE '2025-09-18', NULL),
  ('Herrmans Bike Company Ltd', 'JP-PC2400', 250.0, 1.51, 'EUR', DATE '2023-11-16', NULL),
  ('Eastek HK', 'JP-EB D80', 50.0, 3.9, 'USD', DATE '2021-10-25', NULL),
  ('Eastek HK', 'JP-AL16', 200.0, 3.4, 'USD', DATE '2025-05-14', NULL),
  ('Ursus S.p.A.', 'JP-QR', 400.0, 0.85, 'EUR', DATE '2026-01-08', NULL),
  ('Shimano Nordic', 'EMT4102JHFPRA100', 100.0, 148.49, 'DKK', DATE '2025-11-17', NULL),
  ('Shimano Nordic', 'EBRC6001FB', 50.0, 205.0, 'DKK', DATE '2025-11-17', NULL),
  ('SAPIM', 'JP-sap271', 83.0, 2.53, 'EUR', DATE '2026-02-24', '3000 stk'),
  ('SAPIM', 'JP-sap272', 3000.0, 0.07, 'EUR', DATE '2026-02-24', NULL),
  ('SAPIM', 'JP-sap275', 4000.0, 0.07, 'EUR', DATE '2026-02-24', NULL),
  ('SAPIM', 'JP-sap281', 5000.0, 0.07, 'EUR', DATE '2026-02-24', NULL),
  ('SAPIM', 'Jp-SapNp', 15000.0, 0.05, 'EUR', DATE '2026-02-24', NULL),
  ('Eastek HK', 'JP-JC01', 60.0, 36.0, 'USD', DATE '2026-02-26', NULL),
  ('Eastek HK', 'JP-JC02', 60.0, 36.0, 'USD', DATE '2026-02-26', NULL),
  ('Eastek HK', 'JP-KRD-241113-700c-1', 100.0, 5.8, 'USD', DATE '2026-02-26', NULL),
  ('Eastek HK', 'JP-SP207- 27,2 350', 300.0, 3.82, 'USD', DATE '2026-02-26', NULL);

-- 3. Insert one purchase_order per (supplier, date), then PO lines and
--    inventory movements.
DO $$
DECLARE
  v_loc_id    UUID;
  v_grp       RECORD;
  v_line      RECORD;
  v_supplier  UUID;
  v_part      UUID;
  v_po        UUID;
  v_pol       UUID;
  v_po_num    TEXT;
  v_fx        NUMERIC;
  v_unit_cost NUMERIC;
BEGIN
  SELECT id INTO v_loc_id FROM inventory_locations WHERE code = 'WH-MAIN';

  FOR v_grp IN
    SELECT DISTINCT supplier, order_date
    FROM _import_lines
    ORDER BY order_date, supplier
  LOOP
    SELECT id INTO v_supplier FROM suppliers WHERE name = v_grp.supplier;
    IF v_supplier IS NULL THEN
      RAISE WARNING 'Unknown supplier: %', v_grp.supplier;
      CONTINUE;
    END IF;

    SELECT next_document_number('purchase_order') INTO v_po_num;
    INSERT INTO purchase_orders (
      po_number, supplier_id, status, order_date, received_date, notes
    ) VALUES (
      v_po_num, v_supplier, 'received', v_grp.order_date, v_grp.order_date,
      'Imported from FleetManager_Eksport (5).xlsx'
    )
    RETURNING id INTO v_po;

    FOR v_line IN
      SELECT *
      FROM _import_lines
      WHERE supplier = v_grp.supplier AND order_date = v_grp.order_date
      ORDER BY row_no
    LOOP
      SELECT id INTO v_part FROM parts WHERE internal_sku = v_line.sku LIMIT 1;
      IF v_part IS NULL THEN
        RAISE WARNING 'Unknown part SKU: %', v_line.sku;
        CONTINUE;
      END IF;

      v_fx := CASE v_line.currency
                WHEN 'DKK' THEN 1.0
                WHEN 'EUR' THEN 7.45
                WHEN 'USD' THEN 6.95
                ELSE 1.0
              END;
      v_unit_cost := v_line.price * v_fx * 1.10;

      INSERT INTO purchase_order_lines (
        purchase_order_id, part_id, quantity, unit_price, currency,
        fx_rate_to_dkk, transport_pct, tariff_pct,
        received_quantity, notes
      ) VALUES (
        v_po, v_part, v_line.qty, v_line.price, v_line.currency,
        v_fx, 0.10, 0,
        v_line.qty, v_line.notes
      )
      RETURNING id INTO v_pol;

      INSERT INTO inventory_movements (
        part_id, location_id, movement_type, quantity_delta,
        unit_cost_dkk, source_entity_type, source_entity_id,
        reason, occurred_at
      ) VALUES (
        v_part, v_loc_id, 'received', v_line.qty,
        v_unit_cost, 'purchase_order_line', v_pol,
        'Imported from spreadsheet',
        (v_grp.order_date::timestamptz + interval '12 hours')
      );
    END LOOP;
  END LOOP;
END $$;


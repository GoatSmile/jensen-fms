-- ============================================================================
-- 16 — Reconcile part_categories to Dennis's 57-category canon
-- ============================================================================
-- Adopts Dennis's list (per the FleetManager Pro screenshot) as the canonical
-- taxonomy. All categories are flat (no parent_id); existing nested children
-- are promoted to top-level; categories Dennis dropped are archived after
-- their parts are remapped to the closest match.
--
-- Mapping summary (existing → new):
--   - Front Brake + Rear Brake → Brakes (new)
--   - Sensor Cable + Cable Set + Wiring → Cables (Kabler)
--   - Front Chainwheel → Front Sprocket (Tandhjul For)
--   - Reflectors → Accessories (Tilbehør)
--   - Speed/Torque Sensor → Other (Diverse, new)
--   - Motor System (parent) + Battery System (parent): children promoted,
--     Battery System renamed to "Batteries"; Motor System archived.
--
-- New categories added (10): Brakes, Gates, Gear, Front Derailleur,
-- Rear Derailleur, Basket Mount, Basket Accessories, Pumps, Tools, Other.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Insert the 10 new categories
-- ----------------------------------------------------------------------------
INSERT INTO part_categories (name_en, name_da, parent_id, sort_order, is_active)
VALUES
  ('Brakes',             'Bremser',        NULL, 400, true),
  ('Gates Belt Drive',   'Gates',          NULL, 240, true),
  ('Gear',               'Gear',           NULL, 270, true),
  ('Front Derailleur',   'Forskifter',     NULL, 480, true),
  ('Rear Derailleur',    'Bagskifter',     NULL, 490, true),
  ('Basket Mount',       'Kurvebeslag',    NULL, 510, true),
  ('Basket Accessories', 'Kurve Tilbehør', NULL, 520, true),
  ('Pumps',              'Pumper',         NULL, 550, true),
  ('Tools',              'Værktøj',        NULL, 560, true),
  ('Other',              'Diverse',        NULL, 570, true);

-- ----------------------------------------------------------------------------
-- 2. Move parts from to-be-dropped categories
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_brakes        UUID;
  v_kabler        UUID;
  v_tandhjul_for  UUID;
  v_tilbehor      UUID;
  v_diverse       UUID;
BEGIN
  SELECT id INTO v_brakes       FROM part_categories WHERE name_da = 'Bremser';
  SELECT id INTO v_kabler       FROM part_categories WHERE id = '0390074e-a3a8-491a-8b19-2b220dbda1a8';
  SELECT id INTO v_tandhjul_for FROM part_categories WHERE id = 'f5784cc3-85c2-43c7-b46f-5229594bfe12';
  SELECT id INTO v_tilbehor     FROM part_categories WHERE id = '6730bdfc-061f-4dd1-8166-f4d796d995e5';
  SELECT id INTO v_diverse      FROM part_categories WHERE name_da = 'Diverse';

  -- Front Brake → Brakes
  UPDATE parts SET category_id = v_brakes
   WHERE category_id = 'e3b4ff66-2ca9-423a-990a-ff14cdee593a';
  -- Rear Brake → Brakes
  UPDATE parts SET category_id = v_brakes
   WHERE category_id = 'bb2310f5-1a6e-4049-bce7-c2130eebd4f5';
  -- Sensor Cable, Cable Set, Wiring → Cables
  UPDATE parts SET category_id = v_kabler
   WHERE category_id IN (
     'ee68826d-110b-4382-b59c-277ee5506e96', -- Sensor Cable
     'ed5437bc-e29d-4b9c-a056-c5ba3781b69a', -- Cable Set
     '75ddba2a-d08e-4601-be06-2e4a1e9436ed'  -- Wiring
   );
  -- Front Chainwheel → Front Sprocket (Tandhjul For)
  UPDATE parts SET category_id = v_tandhjul_for
   WHERE category_id = '8724beb6-f406-412a-875b-47650fe0320c';
  -- Reflectors → Accessories
  UPDATE parts SET category_id = v_tilbehor
   WHERE category_id = 'c55708ae-a742-41d0-ba53-9d6456e4a459';
  -- Speed/Torque Sensor → Other
  UPDATE parts SET category_id = v_diverse
   WHERE category_id = '8cde3468-735c-49a7-b750-7dfe0ea20029';
END $$;

-- ----------------------------------------------------------------------------
-- 3. Promote children to top-level
-- ----------------------------------------------------------------------------
UPDATE part_categories SET parent_id = NULL WHERE id IN (
  '30ab75cd-20c0-4c06-8d4e-ca58fc460b0b', -- Display (was under Motor System)
  'a2d0f3ce-e4f0-4546-bbb2-6891ac120d82', -- Display Cable (was under Cables)
  '62826a84-c5c0-4816-af9d-66b1a6356c35', -- Motor Cable (was under Cables)
  'cb6dec2b-bbd4-4aeb-9456-09ca0743a691', -- Motor (was under Motor System)
  '27428ffd-e9ef-44fe-bb39-89636a04fb6d', -- Motor Cover (was under Motor System)
  '8180cb11-7ebd-422f-9b58-44e71e1579d0', -- Motor Controller (was under Motor System)
  '2efd70c1-e875-4ffd-9d54-1f5c0f62709a', -- Charger (was under Battery System)
  '7498c59a-56e1-4ba3-b739-7cf416141db2', -- Brake Disc (was under Front Brake)
  'e229f43d-a54e-4f01-9684-18f404025b5c', -- Crank Arms (was under Crank Set)
  '20375e45-291f-41f9-b8c5-90bac25b900a'  -- Front Hub Accessories (was under Front Hub)
);

-- ----------------------------------------------------------------------------
-- 4. Rename + reorder existing categories to match Dennis's spec
-- ----------------------------------------------------------------------------
UPDATE part_categories SET name_da = 'Stel',           sort_order = 10  WHERE id = '6914afdd-eeb0-4276-8c92-de253a402d18';
UPDATE part_categories SET name_da = 'Forladforsvajer',sort_order = 20  WHERE id = 'e772bfbb-c2cc-46ae-8fc7-9dca8166ddc9';
UPDATE part_categories SET name_da = 'Forgafler',     sort_order = 30  WHERE id = '4c0dadc1-37fb-4133-bbf5-8d45db9a560e';
UPDATE part_categories SET name_da = 'Lakering',      sort_order = 40  WHERE id = '08338622-f15b-48b3-ae79-55660b587476';
UPDATE part_categories SET name_da = 'Fittings',      sort_order = 50  WHERE id = '83c682af-bec7-4c9f-9f28-4972853be800';
UPDATE part_categories SET name_da = 'Styr',          sort_order = 60  WHERE id = 'e679dda4-1bfd-4b1a-a907-d0d7d79322ec';
UPDATE part_categories SET name_da = 'Frempinde',     sort_order = 70  WHERE id = '3c315532-6524-4760-9aaa-dda0c917cff6';
UPDATE part_categories SET name_da = 'Håndtag',       sort_order = 80  WHERE id = 'f8e32e9b-6e25-47e0-9f43-4f23cb02da31';
UPDATE part_categories SET name_en = 'Shifter',       name_da = 'Skifter', sort_order = 90  WHERE id = '5ecf3fbd-2e4a-4b0a-b8cc-dff68877eefa';
UPDATE part_categories SET name_da = 'Klokke',        sort_order = 100 WHERE id = '6aeaa3ba-0a86-4c48-9256-9dfc1b614c6e';
UPDATE part_categories SET name_da = 'Bremsegreb',    sort_order = 110 WHERE id = '1e588354-bf54-45c5-a14b-48c70259c6d0';
UPDATE part_categories SET name_da = 'Display',       sort_order = 120 WHERE id = '30ab75cd-20c0-4c06-8d4e-ca58fc460b0b';
UPDATE part_categories SET name_da = 'Displaykabel',  sort_order = 130 WHERE id = 'a2d0f3ce-e4f0-4546-bbb2-6891ac120d82';
UPDATE part_categories SET name_en = 'Saddle',        name_da = 'Sadel',   sort_order = 140 WHERE id = '5fee3c7e-c886-49a8-ac9f-df161e5e869a';
UPDATE part_categories SET name_en = 'Seat Post',     name_da = 'Sadelpind', sort_order = 150 WHERE id = '1fd2ef12-55b7-48ed-8ba4-6b81f42f9b45';
UPDATE part_categories SET name_en = 'Saddle Clamp',  name_da = 'Sadel Klampe', sort_order = 160 WHERE id = 'e82c4526-b027-4a9d-bbb7-628688cb7fb5';
UPDATE part_categories SET name_da = 'Krankboks',     sort_order = 170 WHERE id = '2e9a0f19-a795-4583-9bf7-cea31c529dac';
UPDATE part_categories SET name_da = 'Kranksæt',      sort_order = 180 WHERE id = '09fe7378-c9f8-4d5d-8226-8f399417b496';
UPDATE part_categories SET name_da = 'Krankarme',     sort_order = 190 WHERE id = 'e229f43d-a54e-4f01-9684-18f404025b5c';
UPDATE part_categories SET name_da = 'Tandhjul For',  sort_order = 200 WHERE id = 'f5784cc3-85c2-43c7-b46f-5229594bfe12';
UPDATE part_categories SET name_da = 'Motor',         sort_order = 210 WHERE id = 'cb6dec2b-bbd4-4aeb-9456-09ca0743a691';
UPDATE part_categories SET name_da = 'Motor Cover',   sort_order = 220 WHERE id = '27428ffd-e9ef-44fe-bb39-89636a04fb6d';
UPDATE part_categories SET name_da = 'Motor Kabel',   sort_order = 230 WHERE id = '62826a84-c5c0-4816-af9d-66b1a6356c35';
-- Gates @ 240 (already set on INSERT)
UPDATE part_categories SET name_da = 'Kæde',          sort_order = 250 WHERE id = '1052409a-db29-4533-9c33-65071449cabd';
UPDATE part_categories SET name_da = 'Kædeskærm',     sort_order = 260 WHERE id = 'c8434651-abee-4e56-b451-e1b004dbf674';
-- Gear @ 270 (new)
UPDATE part_categories SET name_da = 'Kabler',        sort_order = 280 WHERE id = '0390074e-a3a8-491a-8b19-2b220dbda1a8';
UPDATE part_categories SET name_da = 'Støtteben',     sort_order = 290 WHERE id = '3ee4f1ae-26c7-4718-8fa7-4d23db4cc41b';
UPDATE part_categories SET name_da = 'Bagnav',        sort_order = 300 WHERE id = 'a77c5b99-fe56-4586-9a64-e7f1b9974234';
UPDATE part_categories SET name_da = 'Tilbehør',      sort_order = 310 WHERE id = '6730bdfc-061f-4dd1-8166-f4d796d995e5';
UPDATE part_categories SET name_da = 'Fælge',         sort_order = 320 WHERE id = 'c3851f87-ae14-418a-b796-74672f8f7127';
UPDATE part_categories SET name_da = 'Eger',          sort_order = 330 WHERE id = '83716efd-32c2-4aff-9def-1cd01cb1c43f';
UPDATE part_categories SET name_da = 'Dæk',           sort_order = 340 WHERE id = '954a6cf5-b503-4c10-821b-0e858f5a0980';
UPDATE part_categories SET name_da = 'Slanger',       sort_order = 350 WHERE id = '9992d94c-af40-4287-b493-649fc9143493';
UPDATE part_categories SET name_da = 'Fælgbånd',      sort_order = 360 WHERE id = '8bf8d9f9-cc97-4b2f-95d5-ccf596d87680';
UPDATE part_categories SET name_da = 'Fornav',        sort_order = 370 WHERE id = '029c52c0-45de-489a-a8a4-3a32b15853d6';
UPDATE part_categories SET name_da = 'Tilbehør Fornav', sort_order = 380 WHERE id = '20375e45-291f-41f9-b8c5-90bac25b900a';
UPDATE part_categories SET name_en = 'Mudguards', name_da = 'Skærme', sort_order = 390 WHERE id = 'a14d6fe8-1830-4783-bb19-b96c1e2c2f6d';
-- Bremser @ 400 (new)
UPDATE part_categories SET name_da = 'Bremseskive',   sort_order = 410 WHERE id = '7498c59a-56e1-4ba3-b739-7cf416141db2';
UPDATE part_categories SET name_en = 'Rear Carrier',  name_da = 'Bagagebære',  sort_order = 420 WHERE id = '41ea8d4a-df47-49b1-b537-538940d83b60';
UPDATE part_categories SET name_en = 'Controller',    name_da = 'Controller',  sort_order = 430 WHERE id = '8180cb11-7ebd-422f-9b58-44e71e1579d0';
UPDATE part_categories SET name_en = 'Batteries',     name_da = 'Batterier',   sort_order = 440 WHERE id = '3a34c826-675c-460e-add7-831aa72d5d55';
UPDATE part_categories SET name_da = 'Lader',         sort_order = 450 WHERE id = '2efd70c1-e875-4ffd-9d54-1f5c0f62709a';
UPDATE part_categories SET name_da = 'Pedaler',       sort_order = 460 WHERE id = '0b68de02-17bb-43e0-a921-e4ade44a93a5';
UPDATE part_categories SET name_en = 'Cassette',      name_da = 'Kassette',    sort_order = 470 WHERE id = '8a7804d6-ddb2-495b-ac8c-5f7735d3f6a1';
-- Forskifter @ 480 (new), Bagskifter @ 490 (new)
UPDATE part_categories SET name_en = 'Basket',        name_da = 'Kurve',       sort_order = 500 WHERE id = '2c9f9842-cc86-46a0-9d80-3ec1388c7fe1';
-- Kurvebeslag @ 510, Kurve Tilbehør @ 520 (new)
UPDATE part_categories SET name_en = 'Lights',        name_da = 'Lygter',      sort_order = 530 WHERE id = '8093cbfb-c862-4504-bbd3-5783f208b065';
UPDATE part_categories SET name_da = 'Låse',          sort_order = 540 WHERE id = '4c0bb15c-a73e-46fe-a7a1-ef299ebdd65f';
-- Pumper @ 550, Værktøj @ 560, Diverse @ 570 (new)

-- ----------------------------------------------------------------------------
-- 5. Archive dropped categories
-- ----------------------------------------------------------------------------
UPDATE part_categories
SET is_active = false,
    deleted_at = NOW(),
    updated_at = NOW()
WHERE id IN (
  '86f3a951-06c5-4e99-87cf-f1eea4ed6d2f', -- Headsets (empty)
  'e3b4ff66-2ca9-423a-990a-ff14cdee593a', -- Front Brake (merged to Brakes)
  'bb2310f5-1a6e-4049-bce7-c2130eebd4f5', -- Rear Brake (merged to Brakes)
  'fa6420bf-12a7-443e-9ad9-0ff66ea78b97', -- Stabilizer (empty)
  '8da11d74-ffba-491f-b1eb-69d0073c1315', -- Front Carrier (empty)
  'c55708ae-a742-41d0-ba53-9d6456e4a459', -- Reflectors (→ Tilbehør)
  'ee5a0f24-7a93-4809-8bd4-4e3cef461f5c', -- Screws and Nuts (empty)
  'ee68826d-110b-4382-b59c-277ee5506e96', -- Sensor Cable (→ Kabler)
  'ed5437bc-e29d-4b9c-a056-c5ba3781b69a', -- Cable Set (→ Kabler)
  '75ddba2a-d08e-4601-be06-2e4a1e9436ed', -- Wiring (→ Kabler)
  '8724beb6-f406-412a-875b-47650fe0320c', -- Front Chainwheel (→ Tandhjul For)
  'bdaec114-b812-4903-856a-2a25bedb159f', -- Motor System parent (children promoted)
  '8cde3468-735c-49a7-b750-7dfe0ea20029'  -- Speed/Torque Sensor (→ Diverse)
);

-- 28_customer_country_codes.sql
--
-- Data correction after the Kunder.xlsx import (migration 27 + loaders).
-- The export's "Land" column was blank for many foreign customers, so the
-- importer defaulted them to country_code = 'DK'. DAWA then (correctly)
-- failed to geocode them as Danish addresses, which surfaced the mislabels.
--
-- These nine are the foreign customers whose Land was blank (5–6 digit
-- postcodes or foreign cities give them away). Country inferred from city /
-- postcode — best-guess, editable in the customer admin. Coordinates are
-- cleared so a future non-DK geocoder (Nominatim fallback) re-runs them.
-- Already applied via execute_sql; this file is the canonical record and is
-- idempotent (safe to re-run).

UPDATE organizations SET country_code='US', latitude=NULL, longitude=NULL, geocoded_at=NULL
  WHERE legal_name IN ('Biria USA','Revolution Rickshaws');
UPDATE organizations SET country_code='DE', latitude=NULL, longitude=NULL, geocoded_at=NULL
  WHERE legal_name IN ('Claus Wiese Fahrräder','E. Meyer GmbH','Engelbert Meyer GmbH',
                       'GWW - Gemeinnützige Werkstätten und Wohnstätten GmbH');
UPDATE organizations SET country_code='CN', latitude=NULL, longitude=NULL, geocoded_at=NULL
  WHERE legal_name='Changzhou Eastek International Co Ltd';
UPDATE organizations SET country_code='SE', latitude=NULL, longitude=NULL, geocoded_at=NULL
  WHERE legal_name IN ('MGB StarBridge','Timeway / Cargobike');

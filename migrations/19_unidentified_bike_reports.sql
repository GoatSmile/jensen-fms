-- 19_unidentified_bike_reports.sql
--
-- Customer-facing /report flow grew a third path: "I don't know which
-- bike — please call me." These reports land as maintenance tickets
-- without a bike link, for staff to triage. The original schema required
-- bike_id; relax that here, and add a structured phone column so
-- callback requests don't disappear into description prose.
--
-- bike_id stays NOT NULL on rows we already have (none of them are NULL
-- because the constraint hasn't been dropped yet). Staff-created tickets
-- and bike-sticker reports continue to populate bike_id as before; only
-- the new /report/help path leaves it NULL.

ALTER TABLE maintenance_tickets
  ALTER COLUMN bike_id DROP NOT NULL;

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS reported_by_phone TEXT;

COMMENT ON COLUMN maintenance_tickets.bike_id IS
  'Bike this ticket is about. NULL only for "unidentified bike" customer reports submitted via /report/help — staff triage these and either link to a bike or close them.';

COMMENT ON COLUMN maintenance_tickets.reported_by_phone IS
  'Customer phone, captured on /report/help when they ask for a callback. Free-text, no normalization — Danish + international formats both arrive here.';

-- public_report_attempts is the rate-limit ledger. We log every attempt
-- including the ones that didn't end in a ticket; the bike-less path
-- needs a NULL-allowed bike_id too.
ALTER TABLE public_report_attempts
  ALTER COLUMN bike_id DROP NOT NULL;

COMMENT ON COLUMN public_report_attempts.bike_id IS
  'Bike the report attempt targeted. NULL for unidentified-bike submissions via /report/help.';

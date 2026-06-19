-- Delivery precision on the manufacturing order, mirroring the sales order.
--
-- Dennis expresses the MO's "expected ready" as a week ("expected manufacturing
-- week 28"), not an exact day. Same design as migration 40: keep
-- planned_completion_date as the source of truth (the Monday of the chosen ISO
-- week) and add a precision flag so the UI renders "week 28 2026". NULL = exact.
-- When an MO is spawned from a sales order, the SO's delivery precision rides
-- along with its date.
ALTER TABLE manufacturing_orders
  ADD COLUMN IF NOT EXISTS planned_completion_precision text
  CHECK (planned_completion_precision IS NULL
         OR planned_completion_precision IN ('exact', 'week'));

COMMENT ON COLUMN manufacturing_orders.planned_completion_precision IS
  'How to read planned_completion_date: ''week'' = the date is the Monday of an ISO week, show "week N YYYY"; ''exact'' / NULL = a specific day.';

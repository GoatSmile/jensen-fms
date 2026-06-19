-- Delivery precision on the sales order.
--
-- Dennis often commits delivery as a week ("expected week 28"), not an exact
-- day. The locked design keeps the existing requested_delivery_date column as
-- the single source of truth (storing the Monday of the chosen ISO week) and
-- adds a precision flag so the UI knows to render "week 28 2026" instead of a
-- specific date. NULL = exact (every legacy row keeps its meaning).
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS requested_delivery_precision text
  CHECK (requested_delivery_precision IS NULL
         OR requested_delivery_precision IN ('exact', 'week'));

COMMENT ON COLUMN sales_orders.requested_delivery_precision IS
  'How to read requested_delivery_date: ''week'' = the date is the Monday of an ISO week, show "week N YYYY"; ''exact'' / NULL = a specific day.';

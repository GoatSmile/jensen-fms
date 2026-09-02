-- 93 · A saved message per supplier, pre-filling the email dialog
--
-- Both outbound documents (purchase order, paint order) already carry ONE piece
-- of free text that reaches the supplier: the optional message in the email
-- dialog. Order and line notes stay internal — that is PO doctrine and the
-- paint order inherited it. So the greeting a supplier gets was retyped every
-- send, or forgotten.
--
-- ONE column, shared by both document types (owner's call 2026-09-02): most
-- suppliers are either a painter or a parts vendor, and a second column per
-- document type is a form field nobody fills. The cost is that the text has to
-- stay generic — "here is our next order", not "our next paint order" — since
-- the same message rides on a PO. The dialog seeds from it and stays editable;
-- an edit there never writes back here.
--
-- Email only. The printed document keeps carrying the order alone, so paper and
-- mail cannot disagree about what was ordered.
alter table suppliers
  add column if not exists default_email_message text;

comment on column suppliers.default_email_message is
  'Pre-fills the message box when emailing this supplier a purchase order or a paint order. Plain text, no placeholders. Editable per send; edits do not write back.';

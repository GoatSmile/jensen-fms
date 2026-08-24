-- Local-copy anonymisation. Runs as the last section of supabase/seed.sql, so
-- `supabase db reset` rebuilds a real-workflow / safe-contact state every time
-- rather than anonymising once and hoping nobody restores the raw dump again.
--
-- SCOPE (owner's call, 2026-08-24): phone numbers and email addresses only.
-- Names, parts, prices, templates, bikes, orders, invoices and stock stay
-- exactly as production has them — those are what the copy exists to test.
--
-- WHY THESE FIELDS AND NOT NAMES: an address or a number is the only thing in
-- here that can REACH a real person if something in the app sends. A supplier
-- email is the sharpest edge — the PO flow really does send mail — so those go
-- first even though suppliers are companies.
--
-- KEPT REAL, deliberately: the `Nazar Taras` customer organisation and the
-- `Nazar Taras` person, which are the owner's own test account and need to
-- receive what the app sends.
--
-- `.invalid` is reserved by RFC 2606 and can never resolve, so a stray send
-- fails at DNS rather than arriving somewhere. Phone numbers become +45
-- followed by an 8-digit string starting 00, which is not an assignable Danish
-- prefix.


-- Keep these two rows untouched.
CREATE TEMP TABLE _keep_org AS
SELECT 'e50ff44b-c99a-456f-8633-113f97bd6293'::uuid AS id;
CREATE TEMP TABLE _keep_person AS
SELECT '4e9b43d2-428a-4ce6-b61e-068948cd62be'::uuid AS id;

UPDATE organizations o
   SET email = ('org-' || left(o.id::text, 8) || '@example.invalid')::citext,
       phone = '+4500' || lpad((abs(hashtext(o.id::text)) % 1000000)::text, 6, '0')
 WHERE o.id NOT IN (SELECT id FROM _keep_org)
   AND (o.email IS NOT NULL OR o.phone IS NOT NULL);

-- Contacts under the kept organisation stay real; they are the test account's
-- own people.
UPDATE contacts c
   SET email = ('contact-' || left(c.id::text, 8) || '@example.invalid')::citext,
       phone = '+4500' || lpad((abs(hashtext(c.id::text)) % 1000000)::text, 6, '0')
 WHERE (c.organization_id IS NULL OR c.organization_id NOT IN (SELECT id FROM _keep_org))
   AND (c.email IS NOT NULL OR c.phone IS NOT NULL);

UPDATE organization_units u
   SET email = ('unit-' || left(u.id::text, 8) || '@example.invalid')::citext,
       phone = '+4500' || lpad((abs(hashtext(u.id::text)) % 1000000)::text, 6, '0')
 WHERE (u.organization_id IS NULL OR u.organization_id NOT IN (SELECT id FROM _keep_org))
   AND (u.email IS NOT NULL OR u.phone IS NOT NULL);

-- Suppliers: no exceptions. The PO email flow is the one place this app sends
-- to a business address on purpose.
UPDATE suppliers s
   SET email_primary = CASE WHEN s.email_primary IS NULL THEN NULL
         ELSE ('supplier-' || left(s.id::text, 8) || '@example.invalid')::citext END,
       email_secondary = CASE WHEN s.email_secondary IS NULL THEN NULL
         ELSE ('supplier-' || left(s.id::text, 8) || '-2@example.invalid')::citext END,
       phone = CASE WHEN s.phone IS NULL THEN NULL
         ELSE '+4500' || lpad((abs(hashtext(s.id::text)) % 1000000)::text, 6, '0') END;

UPDATE people p
   SET email = CASE WHEN p.email IS NULL THEN NULL
         ELSE 'staff-' || left(p.id::text, 8) || '@example.invalid' END,
       phone = CASE WHEN p.phone IS NULL THEN NULL
         ELSE '+4500' || lpad((abs(hashtext(p.id::text)) % 1000000)::text, 6, '0') END
 WHERE p.id NOT IN (SELECT id FROM _keep_person);

UPDATE maintenance_tickets
   SET reported_by_phone = '+4500' || lpad((abs(hashtext(id::text)) % 1000000)::text, 6, '0')
 WHERE reported_by_phone IS NOT NULL;

UPDATE purchase_orders
   SET emailed_to = 'supplier-po-' || left(id::text, 8) || '@example.invalid'
 WHERE emailed_to IS NOT NULL;

-- Inbound: the caller's number is a phone number like any other. Transcripts
-- (`body_text`) are left alone per the scope above — they are the content the
-- pipeline is tested against.
UPDATE inbound_messages
   SET from_identity = '+4500' || lpad((abs(hashtext(id::text)) % 1000000)::text, 6, '0')
 WHERE from_identity IS NOT NULL
   AND from_identity ~ '^\+?[0-9]';

-- Operational config: a local copy must not be able to mail or SMS anywhere
-- real, whatever a provider is pointed at.
UPDATE app_settings
   SET outbound_from_email     = 'local-from@example.invalid',
       outbound_reply_to_email = 'local-reply@example.invalid',
       outbound_test_email     = 'local-test@example.invalid',
       workshop_phone          = '+4500000001',
       inbound_phone_number      = '+4500000002',
       inbound_phone_number_test = '+4500000003'
 WHERE id = 1;


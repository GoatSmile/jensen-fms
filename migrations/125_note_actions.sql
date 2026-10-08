-- 125 · The ledger accepts the note actions (plan-inbox-notes.md, slice 3)
--
-- A spoken note's suggestions add two kinds: `attach_note` (link the note to
-- a bike / customer / contact, so it shows in that record's history) and
-- `save_contact` (a new or changed phone or email). command_actions checks
-- its action_type against a list; without them, applying one is refused
-- before anything is written (found 8 Oct, testing slice 3 locally).

ALTER TABLE command_actions DROP CONSTRAINT IF EXISTS command_actions_action_type_check;
ALTER TABLE command_actions ADD CONSTRAINT command_actions_action_type_check
  CHECK (action_type IN (
    'draft_customer', 'draft_offer', 'draft_sales_order', 'draft_ticket',
    'draft_visit', 'draft_event', 'draft_purchase_order',
    'attach_note', 'save_contact'
  ));

insert into public.schema_migrations (version, name)
  values (125, '125_note_actions') on conflict (version) do nothing;

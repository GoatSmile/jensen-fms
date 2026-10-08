-- 126 · The ledger accepts calendar moves and deletions (plan-inbox-notes.md, slice 4)
--
-- A note can now MOVE or DELETE an appointment already in the calendar
-- (`move_event`, `delete_event`) — applied by a person, or by *act right away*
-- for someone who has it switched on. command_actions checks action_type
-- against this list (migration 125's lesson: a new kind needs it here first).

ALTER TABLE command_actions DROP CONSTRAINT IF EXISTS command_actions_action_type_check;
ALTER TABLE command_actions ADD CONSTRAINT command_actions_action_type_check
  CHECK (action_type IN (
    'draft_customer', 'draft_offer', 'draft_sales_order', 'draft_ticket',
    'draft_visit', 'draft_event', 'draft_purchase_order',
    'attach_note', 'save_contact', 'move_event', 'delete_event'
  ));

insert into public.schema_migrations (version, name)
  values (126, '126_calendar_change_actions') on conflict (version) do nothing;

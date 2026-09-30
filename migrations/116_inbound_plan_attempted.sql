-- 116 · Suggested actions are drafted for a call by themselves (owner,
-- 2026-09-30). The import job's planner pass picks calls that were read and
-- carry a request, and runs the command agent on each ONCE: this stamp is what
-- makes it once, so a call the agent could not plan (API down, nothing to
-- propose) is not retried every five minutes. A person can still ask for
-- suggestions again from the call's page.

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS plan_attempted_at TIMESTAMPTZ;

-- The two new suggestion kinds a call drafts — an offer and a repair ticket —
-- must be allowed in the apply ledger, or applying one fails AFTER its draft
-- was written (found testing, 2026-09-30).
ALTER TABLE command_actions DROP CONSTRAINT IF EXISTS command_actions_action_type_check;
ALTER TABLE command_actions ADD CONSTRAINT command_actions_action_type_check
  CHECK (action_type IN (
    'draft_customer', 'draft_offer', 'draft_sales_order', 'draft_ticket', 'draft_purchase_order'
  ));

insert into public.schema_migrations (version, name)
  values (116, '116_inbound_plan_attempted') on conflict (version) do nothing;

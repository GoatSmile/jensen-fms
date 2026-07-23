-- ============================================================================
-- 76 — Voice commands VC-1: command fork on the inbound trunk (in-app slice)
-- ============================================================================
-- docs/plan-voice-commands.md + DECISIONS 2026-07-23 (Option A, text-first).
-- Staff dictate / type a task → a Claude tool-use agent grounds every
-- reference against the DB and proposes a PLAN of DRAFT actions
-- (`command_plan`) → a human reviews + applies in the Inbox → each applied
-- draft is logged in `command_actions` (provenance). The phone ingress
-- (audio → Gladia, staff-number fork) folds in with VC-3.
--
-- Honesty note (same truth as the rest of the inbound trunk + gate.ts): RLS
-- stays anon_all; the model PROPOSES, deterministic code + a human DISPOSE;
-- nothing auto-applies (the inbound shadow-mode philosophy).

ALTER TABLE inbound_messages
    -- 'customer' (a customer-facing message — the pipeline default) vs
    -- 'command' (a staff-dictated task the command agent plans). The phone
    -- webhook forks on staff-number match in VC-3; in-app commands set it
    -- explicitly at insert. Default keeps every existing/voicemail row a
    -- 'customer' with zero backfill.
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'customer'
        CHECK (kind IN ('customer', 'command')),
    -- The agent's proposed plan: grounded entities, open slots, draft actions
    -- (shape = CommandPlan in src/lib/inbound/command/plan.ts). Read/written
    -- only on the command path; NULL for customer messages.
    ADD COLUMN command_plan JSONB,
    -- WHO dictated (provenance). NULL until a person is on the session
    -- (post-P3 login) or the phone fork lands.
    ADD COLUMN commanded_by UUID REFERENCES people(id) ON DELETE SET NULL;

-- One row per APPLIED action (not per proposal) — the provenance ledger the
-- "drafted from a voice command — review" banners read. entity_table /
-- entity_id point at what got created; payload keeps the applied field values.
CREATE TABLE command_actions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id     UUID NOT NULL REFERENCES inbound_messages(id) ON DELETE CASCADE,
    -- Stable id of the plan action this applied (command_plan.actions[].id) —
    -- lets the review panel mark an action done + blocks double-apply.
    plan_action_id TEXT NOT NULL,
    action_type    TEXT NOT NULL
        CHECK (action_type IN ('draft_customer', 'draft_sales_order', 'draft_purchase_order')),
    entity_table   TEXT,
    entity_id      UUID,
    payload        JSONB,
    applied_by     UUID REFERENCES people(id) ON DELETE SET NULL,
    applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_command_actions_message ON command_actions(message_id);
-- Idempotent apply: at most one applied row per plan action.
CREATE UNIQUE INDEX uq_command_actions_plan_action
    ON command_actions(message_id, plan_action_id);

ALTER TABLE command_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON command_actions
    FOR ALL TO anon USING (true) WITH CHECK (true);

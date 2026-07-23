-- ============================================================================
-- 73 — People & roles: workforce model + role-scoped config (P1)
-- ============================================================================
-- docs/plan-people-roles.md (agreed with owner-dev 2026-07-17). Four concepts,
-- never collapsed:
--   PERSON      who (deliberately NOT contacts — those are customer-side
--               people; mixing the two poisons both)
--   ROLE        the hat (controlled vocab + auth-lite + landing page)
--   CREDENTIAL  the key (one scrypt password PER ROLE in v0.5; moves to the
--               person at M1 — people.user_id is the bridge)
--   ASSIGNMENT  the work (the dangling day-one assignee columns, FK'd here)
--
-- Capability and notification-event keys are validated against CODE
-- REGISTRIES (src/lib/people/capabilities.ts / notifications.ts) — the
-- provider-registry doctrine applied to permissions: config can only grant
-- what code enforces.
--
-- Honesty note (same truth as src/lib/auth/gate.ts): role passwords are a
-- UX/scoping wall, NOT a security boundary. RLS stays anon_all and the real
-- perimeter remains Vercel SSO until M1. At M1: roles.password_hash dies,
-- everything else survives (RLS policies get written against
-- role_capabilities).

-- ---------------------------------------------------------------------------
-- WHO
-- ---------------------------------------------------------------------------
CREATE TABLE people (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           TEXT NOT NULL,
    email               TEXT,
    phone               TEXT,
    preferred_language  CHAR(2) NOT NULL DEFAULT 'da'
                        CHECK (preferred_language IN ('da', 'en')),
    engagement          TEXT NOT NULL DEFAULT 'employee'
                        CHECK (engagement IN ('owner', 'employee', 'temp', 'contractor')),
    engaged_from        DATE,
    -- Past-dated → hidden from pickers; nothing else (locked: no automation).
    engaged_until       DATE,
    notify_email        BOOLEAN NOT NULL DEFAULT TRUE,
    notify_sms          BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    -- ★ M1 bridge → auth.users. NULL until real per-user auth lands.
    user_id             UUID,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_people_updated_at
    BEFORE UPDATE ON people
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON people
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- THE HAT
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Machine name used by code (seed fallbacks, login resolution). Never
    -- edited after create — display names are the bilingual pair below.
    key           TEXT NOT NULL UNIQUE,
    name_en       TEXT NOT NULL,
    name_da       TEXT,
    -- Where this role lands after login; middleware bounces uncapable
    -- routes here (P2).
    home_path     TEXT NOT NULL DEFAULT '/',
    -- scrypt 'salt:hash' (hex), set/rotated in admin, write-only in the UI.
    -- NULL = this role can't log in. Dies at M1.
    password_hash TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON roles
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Person ↔ role (M-N) — a person holds several hats.
-- ---------------------------------------------------------------------------
CREATE TABLE person_roles (
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role_id   UUID NOT NULL REFERENCES roles(id)  ON DELETE CASCADE,
    PRIMARY KEY (person_id, role_id)
);

CREATE INDEX idx_person_roles_role ON person_roles(role_id);

ALTER TABLE person_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON person_roles
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- WHAT THE HAT OPENS — coarse area-level capabilities, keyed to the shared
-- nav ids (+ scan). No field-level permissions (locked: workshop sees costs).
-- ---------------------------------------------------------------------------
CREATE TABLE role_capabilities (
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    capability TEXT NOT NULL,
    PRIMARY KEY (role_id, capability)
);

ALTER TABLE role_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON role_capabilities
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- WHO GETS TOLD — event subscriptions per role. Delivery hooks land in P4;
-- editing subscriptions before that is safe (inert config).
-- ---------------------------------------------------------------------------
CREATE TABLE role_notifications (
    role_id   UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    PRIMARY KEY (role_id, event_key)
);

ALTER TABLE role_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON role_notifications
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- THE WORK — FK the dangling day-one assignee columns to people.
-- Both verified all-NULL in prod (2026-07-23) and unreferenced by app code;
-- the MO column is renamed so both tables speak `assigned_to` when the
-- assignee pickers land (P3).
-- ---------------------------------------------------------------------------
ALTER TABLE work_orders
    ADD CONSTRAINT work_orders_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE manufacturing_orders
    RENAME COLUMN assigned_to_user_id TO assigned_to;
ALTER TABLE manufacturing_orders
    ADD CONSTRAINT manufacturing_orders_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES people(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Seed roles (owner-agreed 2026-07-17). Starting points — capabilities and
-- subscriptions are admin-editable per role. password_hash is NEVER seeded;
-- passwords are set in admin.
-- ---------------------------------------------------------------------------
INSERT INTO roles (key, name_en, name_da, home_path, sort_order) VALUES
    ('owner',      'Owner',      'Ejer',             '/',             10),
    ('it_admin',   'IT admin',   'IT-administrator', '/',             20),
    ('accountant', 'Accountant', 'Bogholder',        '/invoices',     30),
    ('workshop',   'Workshop',   'Værksted',         '/work',         40),
    ('sales',      'Sales',      'Salg',             '/sales-orders', 50)
ON CONFLICT (key) DO NOTHING;

-- owner + it_admin: every area.
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c
FROM roles r
CROSS JOIN unnest(ARRAY[
    'dashboard','bikes','templates','parts','maintenance','inbox','work',
    'scan','mo','po','so','paint','invoices','agreements','customers','admin'
]) AS c
WHERE r.key IN ('owner', 'it_admin')
ON CONFLICT DO NOTHING;

-- accountant: everything except admin (locked decision).
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c
FROM roles r
CROSS JOIN unnest(ARRAY[
    'dashboard','bikes','templates','parts','maintenance','inbox','work',
    'scan','mo','po','so','paint','invoices','agreements','customers'
]) AS c
WHERE r.key = 'accountant'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c
FROM roles r
CROSS JOIN unnest(ARRAY[
    'dashboard','bikes','parts','maintenance','inbox','work','scan'
]) AS c
WHERE r.key = 'workshop'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c
FROM roles r
CROSS JOIN unnest(ARRAY[
    'dashboard','bikes','templates','parts','mo','so','paint',
    'invoices','agreements','customers'
]) AS c
WHERE r.key = 'sales'
ON CONFLICT DO NOTHING;

INSERT INTO role_notifications (role_id, event_key)
SELECT r.id, e
FROM roles r
CROSS JOIN unnest(ARRAY['invoice.overdue','agreement.expiring']) AS e
WHERE r.key IN ('owner', 'accountant')
ON CONFLICT DO NOTHING;

INSERT INTO role_notifications (role_id, event_key)
SELECT r.id, 'inbound.failed' FROM roles r WHERE r.key = 'it_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_notifications (role_id, event_key)
SELECT r.id, e
FROM roles r
CROSS JOIN unnest(ARRAY['ticket.created','wo.assigned']) AS e
WHERE r.key = 'workshop'
ON CONFLICT DO NOTHING;

INSERT INTO role_notifications (role_id, event_key)
SELECT r.id, 'inbound.order_inquiry' FROM roles r WHERE r.key = 'sales'
ON CONFLICT DO NOTHING;

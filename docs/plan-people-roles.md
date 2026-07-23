# People & roles — design reference

**Date:** 2026-07-17 · **Status:** P1 (schema + admin) SHIPPED 2026-07-23
— migration 73 + `/admin/people`; P2–P4 not yet built.
The workforce/identity model: employees, owners, temps, contractors —
role-scoped access, per-role dashboards, task notification routing, and a
role-password auth v0.5 that becomes real per-user auth (M1) without rework.

## Locked decisions (owner-dev, 2026-07-17)

- **Workshop sees purchase costs.** No cost-redaction pass, no
  `sensitive:costs` capability — capabilities stay coarse area-level.
- **Sales is a real fifth role** (seeded alongside owner / it_admin /
  accountant / workshop).
- **Person identity within a shared role login is self-claimed
  tap-your-name** (Netflix-profile pattern). No per-person PIN.
- **Temps past `engaged_until`**: no automation — past-dated people just
  drop out of pickers. Nothing else.
- Accountant role: **everything except `admin`**.

## The core insight: four concepts, never collapsed

```
PERSON      "Nazar, contractor, +45 …, prefers English"        — who
ROLE        "workshop / accountant / owner / it_admin / sales"  — the hat
CREDENTIAL  one password per role (v0.5) → per-user login (M1)  — the key
ASSIGNMENT  "WO-2026-0142 is Mikkel's"                          — the work
```

A person holds several roles (M-N). Credentials attach to the ROLE today
and move to the PERSON at M1 — because they're a separate concern, that
swap touches nothing else.

## What exists to build on

- **Today's gate** (`src/lib/auth/gate.ts` + middleware + `/login`):
  `SITE_PASSWORD` env → hashed token in the `fms_auth` cookie → Edge
  middleware check. Role passwords generalize this mechanism, not replace it.
- **Dangling day-one columns**: `work_orders.assigned_to` and
  `manufacturing_orders.assigned_to_user_id` (bare UUIDs, unused by app
  code) — waiting to be FK'd to `people`.
- **Shared `nav-items.ts`** (both navs render from it) → capability keys =
  nav item ids → nav filtering falls out for free.
- Notification transports: Resend (live, with test-mode reroute via
  `loadCommunicationSettings`), GatewayAPI SMS (planned), Web Push (planned).
- The July-plan "device-role cookie + `can()` helper shaped for M1" item —
  this design supersedes and generalizes it.

## Schema (one migration)

```sql
-- WHO. Deliberately NOT contacts (customer-side people; mixing poisons both).
CREATE TABLE people (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  email               TEXT,
  phone               TEXT,
  preferred_language  CHAR(2) NOT NULL DEFAULT 'da' CHECK (preferred_language IN ('da','en')),
  engagement          TEXT NOT NULL DEFAULT 'employee'
                      CHECK (engagement IN ('owner','employee','temp','contractor')),
  engaged_from        DATE,
  engaged_until       DATE,      -- past-dated → hidden from pickers; nothing else
  notify_email        BOOLEAN NOT NULL DEFAULT TRUE,
  notify_sms          BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  user_id             UUID,      -- ★ M1 bridge → auth.users; NULL until then
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THE HAT. Controlled vocab (bilingual) + auth-lite + landing page.
CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL UNIQUE,      -- 'owner','workshop','accountant','it_admin','sales'
  name_en       TEXT NOT NULL,
  name_da       TEXT,
  home_path     TEXT NOT NULL DEFAULT '/',
  password_hash TEXT,                      -- scrypt(salt‖hash); NULL = not loginable
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Person ↔ role (M-N).
CREATE TABLE person_roles (
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role_id   UUID NOT NULL REFERENCES roles(id)  ON DELETE CASCADE,
  PRIMARY KEY (person_id, role_id)
);

-- WHAT THE HAT OPENS. Capability keys validated against a CODE REGISTRY
-- (the provider-registry doctrine applied to permissions: config can only
-- grant what code enforces).
CREATE TABLE role_capabilities (
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  PRIMARY KEY (role_id, capability)
);

-- WHO GETS TOLD. Event keys from a code registry too.
CREATE TABLE role_notifications (
  role_id   UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,                 -- 'ticket.created','invoice.overdue',…
  PRIMARY KEY (role_id, event_key)
);

-- THE WORK. FK the dangling columns to people (+ assignee pickers in UI).
-- work_orders.assigned_to            → REFERENCES people(id)
-- manufacturing_orders.assigned_to_user_id → repoint/rename → people(id)
```

## Capabilities — coarse, by design

One capability = one app area, keyed to `nav-items.ts` ids:
`dashboard, bikes, templates, parts, maintenance, inbox, work, mo, po, so,
paint, invoices, agreements, customers, admin` (+ `scan`). Registry in
`src/lib/people/capabilities.ts`; the table maps roles onto it; admin UI =
checkboxes. `can(role, capability)` gates: nav items (shared nav-items),
routes (middleware prefix → capability map), dashboard bands (money band
requires `invoices`). Field-level redaction is explicitly OUT (workshop
sees costs — locked above).

## Seed roles

| key | capabilities | home_path | notified on |
|---|---|---|---|
| `owner` | all | `/` | `invoice.overdue`, `agreement.expiring` |
| `it_admin` | all | `/` | `inbound.failed` |
| `accountant` | all except `admin` | `/invoices` | `invoice.overdue`, `agreement.expiring` |
| `workshop` | `work, maintenance, inbox, bikes, parts, scan, dashboard` | `/work` | `ticket.created`, `wo.assigned` |
| `sales` | `dashboard, bikes, templates, parts, so, mo, paint, customers, agreements, invoices` | `/sales-orders` | `inbound.order_inquiry` |

Seeds are starting points — capabilities are admin-editable per role.

## Auth v0.5 — role passwords

1. **Login**: one password field, no role picker — the entered password is
   scrypt-checked against every active role's hash; **the password IS the
   role selector**. scrypt from `node:crypto` (zero new deps). Hashes are
   set/rotated in admin (write-only; shown as set/missing, the env-secret
   status pattern). `SITE_PASSWORD` stays as owner-role fallback during
   cutover, then retires.
2. **Cookie**: extends `fms_auth` — HMAC-signed `{role, person}` payload,
   verified in the same Edge middleware.
3. **Tap-your-name**: after role login, a person picker (people holding
   that role) stores `person` in the cookie. Self-claimed (locked above) —
   same trust level as the shared password; becomes verified identity at
   M1. Enables per-person to-dos ("my work" on /work), assignee stamping,
   and audit-lite (`person_id` on writes → the dormant audit_log).
4. **Routing**: login lands on `home_path`; middleware bounces uncapable
   routes there; both navs filter via `can()`.
5. **Falls out for free**: the person's `preferred_language` supersedes the
   per-surface `worker_language` — the "per-user at M1" i18n note arrives
   early.

## Notifications

Event registry in code — ONLY events with real hooks: `ticket.created`,
`wo.assigned` (person-targeted, not role-broadcast), `inbound.failed`,
`invoice.overdue`, `agreement.expiring`, `inbound.order_inquiry`.
Fire → subscribed roles (`role_notifications`) → active people in them →
deliver per person channel flags (`notify_email` via Resend THROUGH the
test-mode reroute; `notify_sms` when GatewayAPI lands; Web Push later).
Inbound v2 hook: "ring the workshop" can become *ring the people currently
holding the workshop role* instead of the single `workshop_phone`.

## What this is NOT (honesty)

Same truth already written in `gate.ts`: **a UX/scoping wall, not a
security boundary.** RLS is `anon_all` and the publishable key ships to the
browser — the real perimeter remains Vercel SSO until M1. Role passwords
make the app fit each person's job; they don't defend against them. Same
trust level as today's single shared password, deliberately.

## The M1 bridge (nothing here is throwaway)

At M1: people invited as Supabase users → `people.user_id` links them →
role `password_hash` columns die (credential moves to the person) → cookie
session becomes a Supabase session carrying person + roles as claims →
`can()` reads claims → **RLS policies are written against the same
`role_capabilities` table**. People, roles, capabilities, notifications,
assignments, dashboards all survive. The interim is M1 minus
passwords-per-human, not a detour.

## Phasing (each shippable alone)

1. ✅ **Schema + admin** — SHIPPED 2026-07-23. Migration 73 (tables per
   this doc, assignee FKs incl. the `assigned_to_user_id` → `assigned_to`
   rename, seed roles); registries in `src/lib/people/`; admin at
   `/admin/people` (people CRUD, roles CRUD, capability + event
   checkboxes, write-only password set/rotate). Browser-verified en+da;
   scrypt round-trip verified.
2. **Role login + gating** — password→role resolution, signed cookie,
   `can()`, nav/route/dashboard gating, home_path landing. ~½–1 day.
   *Visible payoff: accountant logs in, sees everything but admin.*
3. **Person picker + assignment** — tap-your-name; FK + assignee pickers on
   WOs/tickets; "my work" filter on /work. ~½ day.
4. **Notifications** — event registry + first two hooks (`ticket.created` →
   workshop email; `invoice.overdue` → accountant). ~½ day.
5. **M1** — swap the credential layer, keep the world.

## Deliberately NOT building

Field-level permissions / cost redaction (locked: workshop sees costs) ·
per-person PINs (locked: self-claimed) · temp auto-archival (locked: picker
filtering only) · per-person passwords before M1 · any RLS tightening now
(that IS M1).

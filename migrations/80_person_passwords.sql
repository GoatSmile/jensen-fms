-- ============================================================================
-- 80 — The credential moves from the role to the person
-- ============================================================================
-- DECISIONS 2026-08-23 (supersedes the credential half of 2026-07-17). Migration
-- 73 kept four concepts apart — person / role / credential / assignment — and
-- hung the credential on the ROLE: one scrypt password per role, and the
-- password you typed WAS the role selector. That separation still stands; only
-- the credential moves.
--
-- Why it moves: a role password can't say who did the work. It sent everyone
-- through a second screen (/whoami, "tap your name") to self-claim a person
-- after login, which is a claim, not an identity, and which nobody has to
-- answer honestly. Login now asks for a NAME and that person's own password,
-- so `assigned_to` and every future actor column mean something from the first
-- login onward.
--
-- The shared password stays as ONE named account. `SITE_PASSWORD` authenticates
-- the seeded `Admin` person (is_system) — full capabilities, no role rows — so
-- work done on the shared login is attributed to "Admin" rather than to nobody.
--
-- Honesty note, unchanged from 73: this is a UX/scoping wall, NOT a security
-- boundary. RLS stays anon_all and the perimeter stays Vercel SSO until M1,
-- when people.user_id bridges to Supabase auth and password_hash dies here too.
-- ---------------------------------------------------------------------------

-- The credential, now on the person. scrypt 'saltHex:hashHex', write-only in
-- admin. NULL = this person can't log in (they still take assignments).
ALTER TABLE people ADD COLUMN password_hash TEXT;

-- The one shared account. Authenticated by SITE_PASSWORD, never by a hash of
-- its own — so it is deliberately excluded from the password rules above.
ALTER TABLE people ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX idx_people_one_system ON people (is_system) WHERE is_system;

INSERT INTO people (full_name, is_system, preferred_language, notify_email, is_active)
VALUES ('Admin', TRUE, 'da', FALSE, TRUE);

-- Role passwords are gone, not deprecated: nothing reads this column after
-- this migration, and leaving a write-only admin field that logs nobody in is
-- exactly the footgun this change removes.
ALTER TABLE roles DROP COLUMN password_hash;

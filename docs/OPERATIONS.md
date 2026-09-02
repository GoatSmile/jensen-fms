# Operations — accounts, secrets, deploy, runbooks

The bus-factor document: every external system the app depends on, where
every secret lives, and how to rebuild or hand over the whole thing.
**No secret values here — names and locations only.**

## External systems

| System | Role | Identifiers / notes | Secrets (name → location) |
|---|---|---|---|
| GitHub | Source of truth | `GoatSmile/jensen-fms` (private) | — |
| Vercel | Hosting + deploy | push-to-`main` → prod; prod gated behind Vercel SSO | mirrors all server env vars below |
| Supabase | Postgres + storage | EU West (Ireland), project ref `jzlphajunfrqvpogzsiz` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser-safe with RLS), `SUPABASE_SECRET_KEY` (server-only, bypasses RLS) → `.env.local` + Vercel |
| Resend | Outbound email | domain `valent.dk` VERIFIED (EU region); all mail reroutes while `outbound_test_mode` is on | `RESEND_API_KEY` → `.env.local` + Vercel |
| Dynadot | DNS for `valent.dk` | Resend DKIM (`resend._domainkey`) + `send` subdomain MX/SPF; Google MX/SPF rows untouched; reference copy in the `/admin/settings` "Sending domain (DNS)" card | Dynadot account (dev's) |
| Google Workspace | `valent.dk` mail | `orders@valent.dk` alias/catch-all **still to create** — direct replies bounce until it exists | Google account (dev's) |
| Twilio | Telephony (inbound trunk) | US trial number `+1 762 500 0850` → Jensen prod webhooks; recordings are fetch-and-delete. `+45 9370 3111` belongs to Munin (since 2026-07-17) | per the inbound provider registry (below) |
| Gladia | Transcription (selected provider) | EU | per the inbound provider registry |
| Anthropic API | Extraction LLM + command agent (`claude-sonnet-5`) | Model is admin-selected from the live `GET /v1/models` list at `/admin/settings`, with a Test probe; free text still allowed | `ANTHROPIC_API_KEY` → `.env.local` + Vercel |
| GatewayAPI | SMS ack (Danish alphanumeric sender) | planned/partial | per the inbound provider registry |
| e-conomic | Accounting push | currently a TRIAL agreement 2446940 ("Din virksomhed"); production grant still outstanding as of September 2026 — chase it; see the STATUS landmine before switching | `ECONOMIC_APP_SECRET_TOKEN`, `ECONOMIC_AGREEMENT_GRANT_TOKEN` → `.env.local` (+ Vercel at prod cutover). The public demo/demo pair is READ-ONLY — never default to it silently |
| ECB | FX reference rates | consumed by the FX refresh cron below (no account) | — |
| OpenStreetMap Nominatim | Geocoding (`src/lib/geocode/nominatim.ts`) | Public endpoint, keyless, but their policy requires a contact address in the User-Agent — falls back to a hardcoded address if unset | `NEXT_PUBLIC_NOMINATIM_CONTACT` → `.env.local` + Vercel |

The inbound provider registries (`TRANSCRIPTION_PROVIDERS` etc. in
`src/lib/inbound/settings.ts`) are the authoritative list of which env
secret each provider needs; the admin card shows present/missing per the
config doctrine in CLAUDE.md.

### Full env-var inventory

The table above defers some secrets to the provider registry. For bus-factor
purposes, here is every variable the code actually reads:

| Variable | For |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio trunk + webhook signature validation |
| `GLADIA_API_KEY` | transcription (selected provider) |
| `AZURE_SPEECH_KEY` | fallback transcription adapter |
| `ANTHROPIC_API_KEY` | extraction LLM |
| `RESEND_API_KEY` | outbound email |
| `ECONOMIC_APP_SECRET_TOKEN`, `ECONOMIC_AGREEMENT_GRANT_TOKEN` | e-conomic |
| `CRON_SECRET` | authenticates all three cron routes; **the FX route 503s without it** on any non-dev deploy |
| `SITE_PASSWORD` | the opt-in shared-password gate (`middleware.ts`, `/whoami` person claim). Unset = gate locks nothing — prod relies on Vercel SSO |
| `NEXT_PUBLIC_APP_URL` | base URL baked into bike QR codes (`src/lib/qr.ts`) |
| `NEXT_PUBLIC_NOMINATIM_CONTACT` | geocoding User-Agent contact |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel Protection-Bypass propagation on inbound webhooks |

`NODE_ENV` and `VERCEL` are platform-provided.

## Scheduled jobs

Three Vercel crons (`vercel.json`), all authenticating with
`Authorization: Bearer ${CRON_SECRET}`:

| Job | Schedule (UTC) | What breaks silently if it stops |
|---|---|---|
| `/api/cron/refresh-fx-rates` | `0 17 * * 1-5` — weekdays, after the ECB daily fix | New PO lines freeze a **stale FX rate** onto cost basis. Money math degrades quietly, and frozen-at-purchase means it is not retroactively fixable |
| `/api/cron/inbound-retention` | `0 3 * * *` | Call audio outlives its retention window (GDPR exposure); transcripts are unaffected |
| `/api/cron/notify-overdue-invoices` | `0 6 * * *` | Overdue-invoice notifications stop |

The FX route deliberately **fails closed**: on any non-dev deployment a missing
`CRON_SECRET` returns 503 rather than running unauthenticated.

## Dev-environment tooling (not app dependencies)

Nothing here is required for the app to run or deploy — it is the assistant
harness the repo carries. Kept separate from the table above on purpose: a
system in that table is one the app breaks without, and none of these are.

- **`.claude/hooks/`** (tracked, shared with Munin) — `gates.sh` refuses a
  `git commit` unless `tsc --noEmit` + `next build` pass; `git-add-guard.sh`
  blocks `git add -A/--all/.`; `worklog-row-budget.sh` flags WORKLOG rows whose
  summary cell runs past ~300 characters. (A `claude-md-budget.sh` line-count
  nudge lived here 2026-07-25 → 07-28; deleted, see DECISIONS.md 2026-07-28.)
  **They need `jq` and `lsof` on PATH** — without `jq` every hook exits
  silently and the gates stop gating, with no warning. Rationale:
  DECISIONS.md 2026-07-25.
- **`.claude/skills/`** (tracked) — `/session-start`, `/ship-it`,
  `/log-decision` hold the session rituals.
- **`.claude/settings.json`** (tracked) — durable read-only permissions +
  the hook wiring. **`.claude/settings.local.json` is gitignored** and holds
  personal grants; it is not part of a cold start and nothing depends on it.
- **Trello — removed 2026-07-25, deliberately.** The boards ("Jensen 1"
  kanban, "Jensen – Phase 2" roadmap, both shared with Dennis) are still
  live and still used **by humans in the browser**; what was removed is the
  API integration — no credentials on this machine, no scripted access.
  Nothing in the app ever touched it. If it is ever rewired, scope the token
  and give it an expiry: the old one was non-expiring and account-wide
  read/write. See DECISIONS.md 2026-07-25.

## Secrets — where they live
- **App runtime**: `.env.local` locally (leading dot — Next.js won't
  auto-load any other name; read at startup, not via HMR — restart the dev
  server after edits) + the same vars in Vercel project settings.
- **Never in the DB or UI** (config doctrine tier 1). Admin surfaces may
  show a present/missing boolean, never the value.
- **Backup secrets**: `~/.backup/secrets.env`; the encrypted-image password
  is in macOS Keychain (`backup-kit-secure-image`) + Bitwarden.

## Cold start (rebuild from nothing)
1. Clone `GoatSmile/jensen-fms`; `npm install`.
2. Create a Supabase project (EU) and apply `/migrations/*.sql` in numeric
   order via the SQL editor (never modify already-applied files; once the
   local copy exists, every migration lands on both — see below). Seeds
   (controlled vocab, the `app_settings` singleton row id = 1) are in the
   migrations.
3. Create `.env.local` with the variables above.
4. `npm run dev`.
5. Deploy: create a Vercel project on the repo, set the env vars, enable
   Vercel SSO protection, push to `main`.

## Backups
`~/workspace/code/backup-kit`. Three moving parts:
- **Nightly** (launchd 02:30, no drive) — Supabase `pg_dump` ×3 + storage sync
  to `~/Backups`. Notifies **on failure only**. Does not catch up: a Mac asleep
  or off-network at 02:30 misses that night (happened 2026-07-21 / 07-23).
- **On drive mount** (launchd `StartOnMount`) — plugging in NT_ARCHIVE runs
  `backup-all` by itself and notifies when it's safe to eject; `backup-all`
  still works by hand. Git bundles of every repo + plain mirrors of
  `~/workspace/code` + `~/Documents/1-Projects` + DB dumps/storage/env files
  into an AES-256 sparsebundle under `BACKUP/` at the drive root.
- **Owner's copy** — `handoff.sh` builds Jensen's cross-platform AES-256 `.7z`
  (headers encrypted, checksum sidecar, plain `README-FIRST.txt`), **Jensen
  material only**. Monthly + before the handover. Per DECISIONS 2026-07-26.

**Everyday card: `backup-kit/MANUAL.md`. Full handoff doc:
`backup-kit/HANDBOOK.md`** (a copy lives on the drive) — incl. §7f, the
quarterly restore drill that tests whether the *Bitwarden* password actually
opens the encrypted image. Nothing else tests that; every automatic run uses
the Keychain.

## Go-live switches (deliberately OFF today — sequencing in docs/STATUS.md)
- `outbound_test_mode` (`app_settings`, `/admin/settings`) — while TRUE,
  ALL outbound mail reroutes to the test inboxes and messages say who they
  were meant for; unticking is the supplier-email AND painter-email go-live.
  **Before unticking: Metacoat A/S's `email_primary` is deliberately the
  owner's test address (`nazar@valent.dk`, set 2026-09-02) — replace it with
  the painter's real address, or the first real paint order goes to Nazar.**
- `inbound_shadow_mode` — the voicemail pipeline creates review-bannered
  tickets; graduation criteria in `docs/plan-inbound-triage.md`.
- `app_language` / `worker_language` → `da` — the 1-click Danish go-live.
- e-conomic: `economic_enabled` is ON but pointed at the TRIAL — production
  cutover = swap the grant token + clear any trial-stamped IDs (STATUS
  landmine) + revisor confirmation of the config numbers.

## Off-repo knowledge index
- Call transcripts: `~/Documents/1-Projects/Jensen/Misc - Transcripts/`
- Strategy/planning chats: claude.ai (see CLAUDE.md "Strategy escalation")
- Backup kit + handbook: `~/workspace/code/backup-kit`
- Munin (separate product; owns +45 9370 3111): `~/workspace/code/munin`,
  github.com/GoatSmile/munin — own repo/Supabase/Vercel/worklog; session
  handoff in `munin/CLAUDE.md`
- Owner's legacy Excel register ("Bikes and customers.xlsx") — source of
  the dashboard history backfill (migration 59)

## Local database copy (added 2026-08-24)

A full local Supabase stack, so testing never touches the database Dennis is
using. Prompted by two `TEST-SEED-DELETE-ME` bikes appearing in production
during a verification run.

**Start / stop**

    supabase start          # first run pulls ~12 images; after that, seconds
    supabase stop           # keeps the volume; data survives
    supabase db reset       # rebuild from supabase/ seed files (see below)

**Which database am I on?** Two independent answers, and they can disagree:

    scripts/use-db.sh              # what .env.local says NOW
    scripts/use-db.sh local|prod   # switch (then RESTART the dev server)

and the dev-only banner at the bottom of every page — green *Local database*,
red *PRODUCTION database*. The banner reflects what the running server actually
loaded, the script reflects the file. **Disagreement means: restart.**

**Local URLs** — the app stays on `http://localhost:3000` either way, which is
exactly why the banner exists.

| API | `http://127.0.0.1:54321` |
|---|---|
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (browse/edit tables, no login) | `http://127.0.0.1:54323` |
| Mailpit | `http://127.0.0.1:54324` |

`psql` is installed via Homebrew's `libpq` but unlinked:
`/opt/homebrew/opt/libpq/bin/psql`.

**How the copy is built.** `supabase/config.toml` seeds from three files in
order: `schema.sql` → `data.sql` → `anonymise.sql`. The first two are dumps of
production (`supabase db dump` / `--data-only`) and are **gitignored — data.sql
holds real customer data**. `anonymise.sql` IS committed: it is the recipe, and
running it as part of the seed means `supabase db reset` always rebuilds to the
safe state rather than anonymising once and hoping.

**What anonymisation does** (owner's scope, 2026-08-24): emails and phone
numbers only, everywhere they appear, including `app_settings` outbound config.
Names, parts, prices, orders and stock stay real — they are what the copy is
for. Addresses become `@example.invalid` (RFC 2606, cannot resolve). **Kept
real on purpose:** the `Nazar Taras` customer organisation and person — the
owner's own test account. Refresh the copy by re-running the two dumps and
`supabase db reset`.

**Outbound secrets are absent from `env/local.env`** (Resend, Twilio,
e-conomic). Those features read as "not configured" locally, which is the
correct local state. `SITE_PASSWORD=local-dev` IS set, so the login gate
behaves like production — without a session there is no person, and nothing to
attribute work to.

**Trap — the Supabase MCP tools stay bound to PRODUCTION** (`jzlphajunfrqvpogzsiz`)
no matter what the app points at. When work is being verified locally, query
with `psql` against `127.0.0.1:54322`; `execute_sql` would confirm the change in
the wrong database.

**Trap — divergence.** Every new migration must be applied to both — production
BEFORE the push that deploys code reading the new columns. `/migrations` stays
the source of truth; `supabase db reset` after a fresh dump re-syncs local.

**Trap — types.** `supabase gen types typescript --local` does NOT reproduce the
committed `src/lib/types/database.ts` (it drops `__InternalSupabase` and the
`Relationships` arrays). After a migration, hand-patch the affected tables (Row +
Insert + Update), or regenerate through the MCP against production once the
migration is applied there.

### Signing in from a script (added 2026-08-24)

The login gate blocks anything scripted, which is why `npm run smoke` reported
4 pass · 106 redirect the first time it met a gated environment.

    node scripts/dev-session.mjs                    # cookie for Admin
    node scripts/dev-session.mjs "Lars"            # by name fragment, or a uuid
    node scripts/dev-session.mjs "Lars" --curl     # a ready -b flag
    curl -b "$(node scripts/dev-session.mjs Dennis)" http://localhost:3000/bikes

It mints a REAL session with the same HMAC as `src/lib/auth/session.ts` — no
bypass branch anywhere in app code, and it only works where SITE_PASSWORD is
already known, i.e. locally. It will mint for ANY person, including one the
login screen would refuse (no password, no roles): the mechanic who never logs
in is exactly who attribution needs testing with.

`npm run smoke` now signs itself in automatically when the gate is on, and
`AS="Lars" npm run smoke` sweeps as one person — which is how you check what a
role actually opens (as Lars, `/invoices` correctly bounces to `/work`).
The baseline lives in `docs/STATUS.md` — it moves whenever a route is added or a
table is emptied — and the gate itself changes nothing about it.

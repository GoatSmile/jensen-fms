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
| Anthropic API | Extraction LLM (haiku) | — | `ANTHROPIC_API_KEY` → `.env.local` + Vercel |
| GatewayAPI | SMS ack (Danish alphanumeric sender) | planned/partial | per the inbound provider registry |
| e-conomic | Accounting push | currently a TRIAL agreement 2446940 ("Din virksomhed"); production grant expected ~end of July 2026 — see the STATUS landmine before switching | `ECONOMIC_APP_SECRET_TOKEN`, `ECONOMIC_AGREEMENT_GRANT_TOKEN` → `.env.local` (+ Vercel at prod cutover). The public demo/demo pair is READ-ONLY — never default to it silently |
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
   order via the SQL editor (never modify already-applied files). Seeds
   (controlled vocab, the `app_settings` singleton row id = 1) are in the
   migrations.
3. Create `.env.local` with the variables above.
4. `npm run dev`.
5. Deploy: create a Vercel project on the repo, set the env vars, enable
   Vercel SSO protection, push to `main`.

## Backups
`~/workspace/code/backup-kit` — `backup-all` (one command, NT_ARCHIVE drive
plugged in) = git bundles of every repo + plain mirrors of
`~/workspace/code` + `~/Documents/1-Projects` + DB dumps/storage/env files
into an AES-256 sparsebundle under `BACKUP/` at the drive root. A launchd
agent runs nightly Supabase `pg_dump` ×3 + storage sync to `~/Backups`.
**Full handoff doc: `backup-kit/HANDBOOK.md`** (a copy lives on the drive).

## Go-live switches (deliberately OFF today — sequencing in docs/STATUS.md)
- `outbound_test_mode` (`app_settings`, `/admin/settings`) — while TRUE,
  ALL outbound mail reroutes to the test inboxes and messages say who they
  were meant for; unticking is the supplier-email go-live.
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

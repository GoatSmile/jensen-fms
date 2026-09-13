# Status — Jensen FMS

**Last updated: 2026-09-13 (session end).** One thing shipped: **dictation no
longer depends on the browser's speech service.** The Dictate button used the
Web Speech API, which streams audio to Google's servers on desktop Chrome and
returned a bare `network` error on the owner's own laptop with nothing app-side
able to fix it. It now records 16 kHz mono WAV locally, PUTs it straight to
storage with a signed upload URL, and transcribes through the provider the
inbound pipeline already uses (Gladia). Verified end to end against production:
200 in 3.7 s, correct Danish transcript, audio deleted after. tsc + lint + build
clean; smoke 92 pass / 0 fail (against production — the offers/invoice/agreement
routes skip for want of rows). **The owner then dictated into WO-2026-0007 in
production and both fields took the text**, so the whole chain — mic, encoder,
signed upload, provider, delete — is verified by a run, not by reasoning.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`, parked
ideas in `docs/BACKLOG.md`.

## The frame
The 31 August cutover **did not happen** and no new date is set. The owner's
choice (DECISIONS 2026-09-01): **parallel running** — the old system stays the
system of record while the workshop does small things in the FMS as it is
fine-tuned. Targets: **core functionality by October, go-live by Christmas.**
Nazar acts as project manager: **weekly Tuesday-morning check-ins**, Dennis
spends 15–20 min in the system each morning so every meeting has findings.
Scope is **modules** (bike templates + parts) and **processes** (sales order →
paint order first). **Dennis's app is Danish** (person language), so a screen
demoed in English looks different on his tablet.

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod).
- **Migration 101 is the latest, and BOTH databases are verified at it.**
  `npm run check:prod` and `npm run check:local` each report *all 101 applied*.
  That command is the answer to "is production up to date?" — ask it, do not
  reason about it. **This session added no migration.**
- **Query production with `supabase db query --linked`** (Management API, CLI
  token in the keychain; no DB password, works when the MCP does not; `-f` for a
  whole migration). Neither an owner's report nor a route answering
  `307 → /login` is verification — that redirect fires in middleware, before the
  page runs a query.
- **Schema drift is mechanised** — `public.schema_migrations` written by each
  migration, `check:prod`/`check:local` diffing it against `migrations/*.sql`,
  and `.claude/hooks/prod-schema-gate.sh` denying `git push` while production is
  behind, *including when it cannot check at all*. Override: `SKIP_SCHEMA_GATE=1`.
- **The Supabase CLI is pre-approved for WRITES** (owner, 2026-09-04) — a
  migration applies to production with no prompt, and so would any other SQL.
- **`docs/plan-sep3-meeting.md` is still the live plan.** Tier 0/1 items remain;
  Tier 2 item 9 (a picture on the offer) has not shipped. Do not archive it yet.

## Landmines
- **Docker was not running this session, so the local Supabase stack is DOWN.**
  `supabase status` fails at the docker socket. `scripts/use-db.sh` says LOCAL,
  which is true of the pointer and false of the stack — start Docker and
  `supabase start` before assuming a local dev server works at all.
- **The DA/EN chip is a HINT, not a constraint.** English dictated with the chip
  on DA came back as clean English (production, 2026-09-13). Gladia evidently
  treats a pinned language as a preference rather than a filter, so the chip
  cannot be relied on to *force* a language — one sample, so do not build on the
  inverse either.
- **The local Supabase can never transcribe.** The provider FETCHES the signed
  audio URL, so `127.0.0.1` is unreachable to it. Exercising dictation end to
  end means `scripts/use-db.sh prod` + restart, which is how it was verified
  today. Switch back afterwards.
- **No production session can be minted from this machine.** `SITE_PASSWORD`
  lives only in Vercel, and there is no Vercel CLI here — so any check that
  needs an authenticated production page (dictation's own button, `/offers`)
  needs a human with a browser. `/api/dictate` is behind the same gate.
- The e-conomic trial-vs-production grant remains as previously recorded.

## Next actions
0. **Click `/offers` in production and confirm it renders.** Unchanged from the
   4 Sep session: everything below the UI is verified, but the authenticated
   page itself has never been seen, and it cannot be from here (the gate needs
   `SITE_PASSWORD`, which lives only in Vercel). One human click closes it.
1. **Send Dennis the two documents. Still not sent, still the bottleneck.**
   `docs/PRODUCTION-CHECKLIST-DENNIS-2026-09.md` and
   `docs/COLOUR-LISTS-DENNIS-2026-09.md`. Three answers are needed from him and
   nothing moves without them.
2. **A picture per TEMPLATE** — the cheap 80%, not blocked on colour. Seven
   templates, studio shots already on logocykler.dk (`/lovable-uploads/…`).
   Store as `bike_template` attachments (no migration — `attachments.entity_type`
   is free text), show on the template page, use as the default on an offer line
   with no picture of its own. Blocked only on Dennis mapping the public models
   to the FMS templates, and on a clean Svajer shot.

## Data-entry debts (owner/admin work, not code)
- Unchanged from 2026-09-04. Production still carries test rows that predate the
  TEST-marker rule — `Jp -test 1` (the bike on WO-2026-0007) and
  TKT-2026-0010's "TEST" message are the visible ones. They are exactly what
  that rule exists to make a query rather than an argument; renaming them is a
  small, separate job.

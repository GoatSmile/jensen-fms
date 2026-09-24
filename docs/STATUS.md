# Status — Jensen FMS

**Last updated: 2026-09-15 (session end).** Two things, **no code shipped and no
migration added.** The local copy was refreshed from production for the first
time since 2 September. Then a **full test chain found in production was purged**
— an offer → SO → MO → build → paint run done that morning: 20 documents, 9
bikes, 108 movements, 97 units (14 908,38 kr.) of stock. Dry-run first, all 423
rows snapshotted to `~/Backups/jensen-fms-test-purge-2026-09-15/snapshot.json`,
then deleted. Stock 62 902 → 62 999; the invariant audit is back to its two
standing hits. **Local and production are in step** — the refresh was taken
before that test data existed, and it is now gone from production too.

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
  reason about it.
- **The local copy is fresh as of 2026-09-15** and matches production row for
  row: 25 bikes · 196 parts · 533 organisations · 0 offers · 937 movements.
  Refreshed per the OPERATIONS runbook — two `supabase db dump --linked` files
  into `supabase/{schema,data}.sql` (gitignored), then `supabase db reset`,
  which re-runs `anonymise.sql` as part of the seed. Anonymisation verified:
  every email is `@example.invalid` except the deliberate `Nazar Taras`
  organisation + person.
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
- **Docker is stopped, and so is the local stack.** Both were running this
  session and were shut down at the end. `supabase stop` keeps the volume, so
  `supabase start` brings the refreshed copy straight back — but Docker Desktop
  must be launched first, and `scripts/use-db.sh` will say LOCAL whether or not
  the stack is actually up. That pointer is true of the file and says nothing
  about the containers.
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — `__variable_4ac2f6` vs `__variable_246ccd`, deterministically,
  across builds and routes, and not reproducible locally. It put the whole app
  in Times on 2026-09-13. Worked around by declaring the font variables on
  `:root` ourselves (DECISIONS 2026-09-13 evening); **the mismatch is still
  there in the deployed HTML** — the app simply no longer depends on it. If
  fonts ever look wrong again, check `--font-geist-sans` in the browser before
  suspecting anything else.
- **The DA/EN chip is a HINT, not a constraint.** English dictated with the chip
  on DA came back as clean English (production, 2026-09-13). Gladia evidently
  treats a pinned language as a preference rather than a filter, so the chip
  cannot be relied on to *force* a language — one sample, so do not build on the
  inverse either.
- **The local Supabase can never transcribe.** The provider FETCHES the signed
  audio URL, so `127.0.0.1` is unreachable to it. Exercising dictation end to
  end means `scripts/use-db.sh prod` + restart. Switch back afterwards.
- **No production session can be minted from this machine.** `SITE_PASSWORD`
  lives only in Vercel, and there is no Vercel CLI here — so any check that
  needs an authenticated production page (dictation's own button, `/offers`)
  needs a human with a browser. `/api/dictate` is behind the same gate.
- The e-conomic trial-vs-production grant remains as previously recorded.

## Next actions

### Tuesday 29 Sep, 13:00 — office visit with Dennis and Finn (from the 24 Sep call)
Goal: run the service phone line end to end with Finn, and put him on the
system. Decisions: DECISIONS 2026-09-24. Calendar: `docs/plan-service-calendar.md`.

**Before Tuesday — Nazar**
- [ ] **Danish Twilio number, today/tomorrow** — the account still has only the
      US trial number: upgrade it, file Twilio's Danish regulatory bundle (a +45
      *mobile*-range number needs only name + address, no documents — fastest,
      and fine as a forwarding target). It can take days; nothing else can be
      tested without it.
- [ ] **Relatel admin access** (Dennis is sending it) — ask for an
      *administrator user of your own*, not his login. Then point **option 2** at
      the Twilio number and check whether the caller's number comes through.
- [ ] Switch `inbound_bridge_number` to Finn's mobile on the day (mode is
      already `bridge`, shadow mode on).
- [ ] **Create Finn and Glenn** as people, Danish language, role **Workshop**
      (lands on `/work`) — confirm with Dennis who Glenn is and that Workshop fits
      him too.
- [ ] **Service calendar slice 0** — free Google account on the service mailbox,
      calendar "Servicebesøg", service account, sharing, "Open calendar" link.
      Blocked on the address (notes say `service@yensen.dk` — no such mail
      domain; probably `service@jensenproduction.dk`).
- [ ] **Danish user guide (PDF)** — Finn's repair flow first; the paint-order
      flow for Dennis.
- [ ] Send Dennis the calendar invite for Tuesday 13:00.
- [ ] Proposal to Renee (not app work; due ~26 Sep).
- [ ] Ask Relatel: can call recordings be fetched by API / is a recording
      webhook event planned? Which subscription does Jensen have?

**Dennis**
- [ ] Send the **Trello export** of the bikes (frame, battery, service status,
      community — cleaned by John). It replaces the fleet spreadsheet template.
- [ ] Relatel login → Nazar; Finn's email address → Nazar; tell Finn the time.
- [ ] Check whether Finn's phone supports eSIM — **but change no phone or SIM
      before Tuesday**: nothing in the design needs an eSIM (BACKLOG).
- [ ] The service-agreement papers (scans) — Trello's "service status" won't
      say what is covered.

**On the day**
1. Test calls on option 2: answered, missed → voicemail; read them in `/inbox`.
2. Finn logs in on his own phone; one repair end to end (find bike, work,
   parts, photos).
3. Dennis's paint order together — `PNT-2026-0012` was received with no parts on
   its lines, so no painted stock was posted (BACKLOG hardening).
4. Collect the Trello export and agreement papers.

**Needs a small decision:** how imported bikes are marked (a fixed notes marker
like `IMPORT Trello 2026-09`, or a `source` column) — same argument as the TEST
rule.

**Finn on the system — gaps to close before he uses it for real:** labour time
on the `/work` screen (only editable on the office WO page today); start a work
order from a scanned bike with no ticket; confirm a provisional frame number /
add identifiers on site; search by customer fleet number + customer name. Open
questions for Finn: on-site vs workshop, van stock (a second location), signal
where he works (offline is a real project), how he records time today.

### Carried over from 15 Sep
0. **Click `/offers` in production and confirm it renders.** Unchanged since 4
   Sep: everything below the UI is verified, but the authenticated page itself
   has never been seen, and it cannot be from here (the gate needs
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

## Checks — the baselines to match
- **Smoke**: 92 pass · 19 redirect · 7 skip · 0 fail against production. **The
  local baseline is now the same 92, not the old 93** — that extra pass came
  from `/offers/[id]` having a row to render, and the refreshed copy mirrors
  production, which has no offers. A SKIP is not a pass.
- **Smoke has NOT been run since the 15 Sep refresh** — the dev server had died
  by session end and was not restarted to chase it. Run it first thing next
  session; it is the outstanding verification on the rebuilt copy.
- **The invariant audit WAS run against production after the purge** and matched
  the baseline above exactly — that is the verification that the delete broke
  nothing.
- **Invariant audit**: two standing hits, both pre-existing. Check 17
  (`JP-BasJen`, 500 units with no known cost) and check 18 (legacy
  `unit_cost_basis = 'none'`, **9 rows** — re-counted on the refreshed copy; it
  can only shrink). "Clean" means matching these, not an empty result.

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes, not three.** `JP-2026-E_BIKE-030/031/032/033` and
  `035/036/037` are all `planning`, no owner, nothing consumed, no TEST marker —
  so nobody can say whether they are real bikes or leftovers. Earlier STATUS
  entries listed only `035/036/037`. They are the entire argument for the TEST
  rule. One answer from the owner settles them. (`038…046` were the 15 Sep test
  chain and are gone.)
- **The 13 Sep test-data purge is now reflected locally.** The `Jp -test 1`
  bike, its 44 `bike_parts`, 45 inventory movements, MO-2026-0014, WO-2026-0007,
  all three tickets and two archived test families are gone from both databases.
  Snapshot of all 145 rows kept outside the repo; mechanism and what was
  deliberately spared in DECISIONS 2026-09-13 (night).

# Status — Jensen FMS

**Last updated: 2026-09-27 (session end, Sunday evening).** Every code item
from the 15 Sep meeting that needed no answer from Dennis has shipped (paint
seeding, build screen, offers, the paged bikes list, the refresh sweep —
`docs/archive/HISTORY.md`, 2026-09-27; decision: DECISIONS 2026-09-27). What
remains is waiting on **Tuesday 29 Sep** (the Relatel test, the calendar,
Dennis's answers) and on **one modelling decision** — service agreements per
bike, briefed for the planning chat.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`, parked
ideas in `docs/BACKLOG.md`.

## The frame
The 31 August cutover did not happen. **Parallel running** (DECISIONS
2026-09-01): the old system stays the system of record while the workshop does
small things in the FMS. Targets: **core functionality by October; Dennis wants
the system fully in use by 1 January** (15 Sep, 02:52) — money is tight and he
needs "something proven" for investors. Weekly Tuesday check-ins; Dennis's app
is Danish (person language).

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod).
- **Migration 103 is the latest; production verified at it** (`npm run
  check:prod`, 27 Sep). Nothing on 27 Sep needed a migration.
- **Production with `supabase db query --linked`** (writes pre-approved, owner
  2026-09-04; `-f` takes a whole file). **The local copy: `docker exec -i
  supabase_db_jensen-fms psql …`** — `--local` takes one statement per call.
- **Everything shipped on 27 Sep was verified in the browser against the LOCAL
  copy only** — nobody has clicked it in production yet.
- **Service agreements:** the app models them per customer; reality is per bike.
  Production holds one test agreement and no agreement invoices, so nothing
  needs migrating. Brief: `docs/BRIEF-SERVICE-AGREEMENTS-2026-09.md` (+ PDF).
- **Relatel (read 27 Sep, nothing changed):** plan *Omstilling Professional*;
  Finn's mobile has *Mobilfeatures*; *Ny medarbejder* is locked until the
  company is MitID-validated; an existing employee can be made admin directly;
  two-factor login is off. OPERATIONS has the API and the menu paths.
- **Fleet register review files** (no database written):
  `~/Documents/1-Projects/Jensen/Fleet/import-review-2026-09-26/`. Re-run:
  `python3 scripts/import_fleet.py review`.
- **Finn Nysom and Glenn exist in production** — Danish, role *Workshop*, no
  password yet. Finn's email is `service@jensenproduction.dk` (his Relatel login).

## In flight — waiting on someone
- **Nazar, before or on Tuesday:**
  - Click the 27 Sep changes in production: a paint order from a real SO, a
    build screen, an offer line's VAT, and a few saves on different pages — a
    page that no longer updates after a save is a revalidation the refresh
    sweep misjudged. Also still: Dennis-level logins see prices and *Adjust
    stock*; `/offers` renders.
  - Send or bring: `FLEET-IMPORT-DENNIS-2026-09.pdf`,
    `QUESTIONS-DENNIS-2026-09-24.pdf` (A = phone, B = Finn, C = the twelve
    agreement questions), the production checklist and colour lists; print
    `RELATEL-FINN-2026-09.pdf`.
  - Take the agreement brief to the planning chat.
  - The Google calendar gets set up on Tuesday (Calendar ID +
    `GOOGLE_CALENDAR_SA_KEY` in Vercel + `.env.local` — secret, never in chat).
- **Dennis:** the fleet answers (unclear customers, rules, 0-kr prices…), the
  agreement answers (section C), the recording notice on the main greeting,
  the seven unclassified bikes, the label printer model, the agreement papers.
- **Owner decisions:** (1) service agreements per bike (plan §2A, the brief);
  (2) paint lifecycle vs "emailing IS the send" (plan §2C); (3) identifier
  overwrite for frames + quantity-driven identifier counts (plan §2D).

## Landmines
- **Docker Desktop is running; the local stack and dev server are stopped.**
  `supabase start` brings the copy back with its data (TEST rows from 27 Sep:
  *TEST Lakflow ApS*, `SO-2026-0001`, `SO-2026-9901`, `PNT-2026-0009`,
  `OFF-2026-9901`/`0001` — all marked TEST). The local document counters lag
  production's.
- **With the browser pane hidden, streamed sections never reveal** — a button
  inside one looks broken. `window.$RV(window.$RB)` (CLAUDE.md caveats).
- **Charger "numbers" on newer bikes are model codes** (`FY2010001` on dozens of
  bikes) — never import them as unique identifiers.
- **Version-1 sessions get `costs` if they hold `invoices`**
  (`src/lib/auth/session.ts`). Delete after 2026-10-27 (BACKLOG).
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — worked around on `:root` (DECISIONS 2026-09-13).
- **The local Supabase can never transcribe** (the provider fetches the signed
  URL) — end-to-end dictation means `use-db.sh prod`.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions — `docs/plan-go-live.md`
1. **Tuesday 29 Sep, 13:00 (§1):** the Relatel test — Finn's two steps, then
   `RELATEL_TOKEN=… node scripts/relatel-probe.mjs --watch=20` during the four
   calls and `--download` after (delete the audio when done); passwords for
   Finn and Glenn; Finn walks one repair; the calendar; `PNT-2026-0012`.
2. **Buildable now, no answers needed:** `/work` gaps (labour time, a work
   order from a scanned bike, search by code / customer); the *Assigned* label
   on delivered bikes; extra battery/charger on an SO; create a missing part
   from the picker; templates Dennis-only; Finn's Danish user guide.
3. **After Dennis answers:** `import_fleet.py sql` → the bike data migration;
   after the agreement decision: the agreement model, its import, renewal
   invoicing (§2A).
4. **Next big slice (§2B):** the delivery process — SO delivery contact,
   delivery note, finger signature.

## Checks — the baselines to match
- **Smoke, local (2026-09-27): 89 pass · 20 redirect · 9 skip · 0 fail.** The
  skips are invoices, tickets, work orders, agreements and `/work/[woId]` (no
  rows in the local copy).
- **Lint: 0 errors, 14 warnings** (all pre-existing).
- **Invariant audit** (not re-run 27 Sep): two standing hits — check 17
  (`JP-BasJen`, 500 units with no known cost) and check 18 (legacy
  `unit_cost_basis = 'none'`, 9 rows; can only shrink).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` (planning, no owner,
  no TEST marker) — real or test? One answer from Dennis.
- **Recognition prefixes per customer** (BK, GK, …) — editable on the customer
  form; the register implies most; Dennis confirms.
- Glenn's surname, email, phone; whether Dennis's Trello export replaces the
  register; the service-agreement papers.

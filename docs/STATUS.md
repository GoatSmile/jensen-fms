# Status — Jensen FMS

**Last updated: 2026-09-28 (Monday, session end).** Today's bundle shipped:
paint orders split the paperwork from where the goods are (migration 106), the
delivery process — SO readies itself, a finger signature delivers it (107),
the identifier rules (108), the recognition code asked at build, five small
ones (TEST marker to children, parts-only SOs skip production, the floor can't
change a customer, command-action capability checks, WO → identifiers link),
and Dennis's paint-order guide. What remains waits on **Tuesday 29 Sep** and
on **the service-agreement model** (planning chat).

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
- **Migration 108 is the latest; production verified at it** (`npm run
  check:prod`, 28 Sep). 106 = paint lifecycle, 107 = delivery fields + private
  `signatures` bucket + `so.ready` for Owner, 108 = identifier uniqueness and
  counting (and JP-BH CWF1 refiled Batteries → Rear Carrier, owner).
- **Production with `supabase db query --linked`** (writes pre-approved, owner
  2026-09-04; `-f` takes a whole file). **The local copy: `docker exec -i
  supabase_db_jensen-fms psql …`** — `--local` takes one statement per call.
- **Everything shipped on 27 and 28 Sep was verified in the browser against
  the LOCAL copy only** — nobody has clicked it in production yet.
- **A new daily cron**, `/api/cron/paint-drop-offs` (04:00 UTC, `vercel.json`),
  moves confirmed paint orders to *at painter* on their drop-off date. It uses
  the same `CRON_SECRET` as the other crons — check it runs once in Vercel.
- **Guides (PDF):** `GUIDE-FINN-DA-2026-09.pdf` (+ EN) for Finn's repairs,
  `GUIDE-DENNIS-PAINT-DA-2026-09.pdf` for paint orders. Screens are shot from a
  production build on port 3100 (headless Chrome: 500 px minimum width, and it
  never exits on its own — the shot loop kills it).
- **Service agreements:** per-customer model in the app; reality is per bike.
  Brief `BRIEF-SERVICE-AGREEMENTS-2026-09` + `SERVICE-AGREEMENTS-HANDLING-2026-09`
  (PDFs). **Dennis answered on 28 Sep:** 3–4 signed documents, they list frame
  numbers, 1 704 kr is the real price every year, no older template — so no
  document extraction and no price steps.
- **Finn Nysom and Glenn exist in production** — Danish, role *Workshop*, no
  password yet. Finn's email is `service@jensenproduction.dk`.

## In flight — waiting on someone
- **Nazar, before or on Tuesday:**
  - Click the 27–28 Sep work in production: `/work` search, *New work order*
    from a bike, time spent; a paint order through confirmed → at painter →
    ready (the cron's first run); `/work/deliveries` and a signature on a TEST
    order; an identifier move; the recognition-code question at build; a
    template as Dennis.
  - Print `GUIDE-FINN-DA`, `GUIDE-DENNIS-PAINT-DA`, `RELATEL-FINN`; bring the
    fleet letter and the question sheets.
  - The agreement brief + handling document to the planning chat.
  - e-conomic: someone with admin rights approves our app's install link →
    the production grant token (settings only, never chat).
  - The Google calendar (Calendar ID + `GOOGLE_CALENDAR_SA_KEY` in Vercel +
    `.env.local`).
- **Dennis:** what 0 kr means (311 rows) and each customer's contract type
  (sent 28 Sep); the fleet answers; the recording notice; the seven
  unclassified bikes; the label printer model.
- **Owner decision:** the service-agreement model (plan §2A).

## Landmines
- **Finn cannot see paint orders** (Workshop has no `paint`): drop-off and
  pickup dates are the office's until a floor surface or the calendar exists.
- **Counting identifiers by category needs clean categories**: Batteries and
  Charger must hold only batteries and chargers, or bikes get asked for extra
  numbers (CLAUDE.md, identifier rule).
- **The local stack runs WITHOUT analytics** — `supabase start -x
  logflare,vector` (the analytics port would not bind after a Docker restart).
  Local TEST data: people *TEST Finn*, *TEST Tech EN*, *TEST Sælger*; bikes
  `TEST-WCK-REPAIR-001/002`, `TEST-FRAME-TAKE-1` (was PEDAL-003); `SO-2026-9902`
  and `9903` (delivered, signed), `SO-2026-0001` (ready); `PNT-2026-0008`
  (ready, notes TEST); parts `TEST-FRAME-Q1`, `TEST-BAT-Q2`; TEST Lakflow has
  prefix `TL`.
- **With the browser pane hidden**, streamed sections never reveal and real
  clicks fail: `window.$RV(window.$RB)`, synthetic `pointerdown` for Radix
  menus, `requestSubmit()` for forms.
- **Charger "numbers" on newer bikes are model codes** — never import them as
  unique identifiers.
- **Pre-v3 sessions are upgraded** in `src/lib/auth/session.ts`. Delete after
  2026-10-27 (BACKLOG).
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — worked around on `:root` (DECISIONS 2026-09-13).
- **The local Supabase can never transcribe** — end-to-end dictation means
  `use-db.sh prod`.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions — `docs/plan-go-live.md`
1. **Tuesday 29 Sep, 13:00 (§1):** the Relatel test (`scripts/relatel-probe.mjs
   --watch=20`, then `--download`; delete the audio after); passwords for Finn
   and Glenn; Finn walks one repair with his guide; the calendar; the e-conomic
   grant; `PNT-2026-0012`.
2. **After the agreement decision:** the agreement model, its import from the
   register, renewal invoicing (§2A). **After Dennis's fleet answers:**
   `import_fleet.py sql` → the bike data migration.
3. **Next without anyone:** the loading scan (QR on the delivery note), box
   labels once the printer is known, the builder's iPad view (§2D).

## Checks — the baselines to match
- **Smoke, local (2026-09-28): 94 pass · 20 redirect · 6 skip · 0 fail.** The
  skips are invoices, tickets and agreements (no rows locally).
- **Lint: 0 errors, 14 warnings** (all pre-existing).
- **Invariant audit** (not re-run): two standing hits — check 17 (`JP-BasJen`,
  500 units with no known cost) and check 18 (legacy `unit_cost_basis =
  'none'`, 9 rows; can only shrink).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` — real or test?
- **Recognition prefixes per customer** (BK, GK, …) and **department codes**
  (`organization_units.code`) — the build screen's suggestion uses both.
- Glenn's surname, email, phone; whether Dennis's Trello export replaces the
  register; the signed agreement PDFs.

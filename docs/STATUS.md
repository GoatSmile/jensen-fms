# Status — Jensen FMS

**Last updated: 2026-09-27 (session end, Sunday night).** The whole no-Dennis
build list shipped this evening: the `/work` gaps (search by code, a work order
from a scanned bike, time spent — and a save bug that wiped labour), *Delivered*
instead of *Assigned*, a part sold on an SO leaving stock (migration 105), a
missing part created from the picker, templates changeable by Dennis only
(migration 104), and Finn's repair guide in Danish and English. What remains
is waiting on **Tuesday 29 Sep** and on **one modelling decision** — service
agreements per bike, briefed for the planning chat.

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
- **Migration 105 is the latest; production verified at it** (`npm run
  check:prod`, 27 Sep night). 104 = `templates_edit` (Owner + IT admin),
  105 = movement type `sold`.
- **Production with `supabase db query --linked`** (writes pre-approved, owner
  2026-09-04; `-f` takes a whole file). **The local copy: `docker exec -i
  supabase_db_jensen-fms psql …`** — `--local` takes one statement per call.
- **Everything shipped on 27 Sep was verified in the browser against the LOCAL
  copy only** — nobody has clicked it in production yet.
- **Finn's guide:** `docs/GUIDE-FINN-DA-2026-09.pdf` (use this one) and
  `…-EN-…`. Screens in `docs/images/guide-finn/`, shot from a production build
  on port 3100 as TEST technicians (headless Chrome's minimum width is 500px,
  hence that width; it also never exits on its own — the shot loop kills it).
- **Service agreements:** the app models them per customer; reality is per bike.
  Production holds one test agreement and no agreement invoices. There is **no
  way to scan or upload agreement papers** — no attachments on agreements, no
  document extraction. Brief: `docs/BRIEF-SERVICE-AGREEMENTS-2026-09.md` (+ PDF); how
  to import and handle them (spreadsheet = billing, documents = terms, e-conomic
  = proof; Dennis's templates found and read): `docs/SERVICE-AGREEMENTS-HANDLING-2026-09.pdf`.
- **Relatel (read 27 Sep, nothing changed):** plan *Omstilling Professional*;
  Finn's mobile has *Mobilfeatures*; *Ny medarbejder* is locked until the
  company is MitID-validated; two-factor login is off. OPERATIONS has the API.
- **Fleet register review files** (no database written):
  `~/Documents/1-Projects/Jensen/Fleet/import-review-2026-09-26/`. Re-run:
  `python3 scripts/import_fleet.py review`.
- **Finn Nysom and Glenn exist in production** — Danish, role *Workshop*, no
  password yet. Finn's email is `service@jensenproduction.dk`.

## In flight — waiting on someone
- **Nazar, before or on Tuesday:**
  - Click the 27 Sep changes in production: `/work` search + *New work order*
    from a bike + time spent (as a Workshop login once Finn has a password);
    a template as Dennis (edit still works) — a Dennis session from before
    tonight is upgraded to `templates_edit` because it holds `admin`; a paint
    order from a real SO; an offer line's VAT; a few saves on different pages.
    Also still: Dennis-level logins see prices; `/offers` renders.
  - Print or send `GUIDE-FINN-DA-2026-09.pdf`, `RELATEL-FINN-2026-09.pdf`,
    `FLEET-IMPORT-DENNIS-2026-09.pdf`, `QUESTIONS-DENNIS-2026-09-24.pdf`, the
    production checklist and colour lists.
  - Take the agreement brief AND `SERVICE-AGREEMENTS-HANDLING-2026-09.pdf` to
    the planning chat.
  - Find out how the existing agreements exist (its §7): how many as documents,
    which format, whether they list frame numbers, whether the stepped price is
    really charged, the template version; and chase e-conomic's production
    grant — the invoice-history cross-check needs it.
  - The Google calendar on Tuesday (Calendar ID + `GOOGLE_CALENDAR_SA_KEY` in
    Vercel + `.env.local` — secret, never in chat).
- **Dennis:** the fleet answers, the agreement answers (section C), the
  recording notice on the main greeting, the seven unclassified bikes, the label
  printer model, the agreement papers.
- **Owner decisions:** (1) service agreements per bike (plan §2A, the brief);
  (2) paint lifecycle vs "emailing IS the send" (plan §2C); (3) identifier
  overwrite for frames + quantity-driven identifier counts (plan §2D).

## Landmines
- **The local Supabase stack is running; the dev server is stopped** (Docker
  Desktop was started tonight). TEST rows in the local copy: people *TEST Finn*, *TEST Tech EN*
  (Workshop), *TEST Sælger* (Sales); bikes `TEST-WCK-REPAIR-001/002` (codes
  TLKUL07/08) with `WO-2026-0008` in progress; parts `TEST-FRAME-Q1`,
  `TEST-BAT-Q2`; `SO-2026-9902` (delivered, sold 2 batteries); plus 27 Sep's
  *TEST Lakflow ApS*, `SO-2026-0001/9901`, `PNT-2026-0009`, `OFF-2026-9901/0001`.
- **A technician's bike page still shows *Skift kunde* and *Flyt til*** — the
  Workshop role holds `bikes`, and those controls are not capability-gated.
  Not fixed tonight; decide whether a technician may change owner or status.
- **With the browser pane hidden, streamed sections never reveal** and real
  clicks fail — `window.$RV(window.$RB)`, and Radix menus open with a synthetic
  `pointerdown` (CLAUDE.md caveats).
- **Charger "numbers" on newer bikes are model codes** — never import them as
  unique identifiers.
- **Pre-v3 sessions are upgraded** in `src/lib/auth/session.ts` (`costs` for
  v1, `templates_edit` for pre-v3 holding `admin`). Delete after 2026-10-27
  (BACKLOG).
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — worked around on `:root` (DECISIONS 2026-09-13).
- **The local Supabase can never transcribe** — end-to-end dictation means
  `use-db.sh prod`.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions — `docs/plan-go-live.md`
1. **Tuesday 29 Sep, 13:00 (§1):** the Relatel test — Finn's two steps, then
   `RELATEL_TOKEN=… node scripts/relatel-probe.mjs --watch=20` during the four
   calls and `--download` after (delete the audio when done); passwords for
   Finn and Glenn; Finn walks one repair **with the guide in hand**; the
   calendar; `PNT-2026-0012`.
2. **Still buildable without answers:** confirm a provisional frame / add
   identifiers on site from `/work`; the paint-order guide for Dennis; gating
   the technician's bike-page controls (landmine above) once decided.
3. **After Dennis answers:** `import_fleet.py sql` → the bike data migration;
   after the agreement decision: the agreement model, its import (register +
   papers — scanning papers would be new work), renewal invoicing (§2A).
4. **Next big slice (§2B):** the delivery process — SO delivery contact,
   delivery note, finger signature.

## Checks — the baselines to match
- **Smoke, local (2026-09-27 night): 92 pass · 20 redirect · 6 skip · 0 fail.**
  The skips are invoices, tickets and agreements (no rows in the local copy).
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

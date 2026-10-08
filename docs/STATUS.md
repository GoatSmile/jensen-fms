# Status — Jensen FMS

**Last updated: 2026-10-08 (Thursday, evening).** **Spoken notes and the Inbox
are built, all four slices** (`docs/plan-inbox-notes.md`, migrations 124–126,
DECISIONS 2026-10-08): the floating button's mode per person (ask / note saved
on a second press / on a pause); notes transcribed and READ for suggestions
(*Put on record*, *Save contact*, visits, calendar moves/deletes), addressed
to whoever handles the task; `/inbox` with a column of open notes per person
above the calls, Done / Mark all done / Undo; *Calls and notes* on bike and
customer pages; *Act right away* per person (booking and moving only —
deleting stays a press). Also: payment terms follow a rule (123), dictation
detects its language, the app opts out of browser translation, a sales
order's delivery has *Move* / *Remove*. All in production.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`, parked
ideas in `docs/BACKLOG.md`.

## The frame
The 31 August cutover did not happen. **Parallel running** (DECISIONS
2026-09-01): the old system stays the system of record while the workshop does
small things in the FMS. Targets: **core functionality by October; Dennis wants
the system fully in use by 1 January** — money is tight and he needs
"something proven" for investors. Weekly Tuesday check-ins; Dennis's app is
Danish (person language).

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod).
- **Migration 126 is the latest; production AND local at it** (`check:prod` /
  `check:local`, 8 Oct). 126 / 125 = the action ledger accepts move_event,
  delete_event, attach_note, save_contact; 124 = spoken notes (channel `note`,
  addressee, context, due day, Done columns, `command_actions.auto_applied`,
  `people.assistant_mode` + `assistant_auto_apply`); 123 = payment terms rule
  (default dropped, the unchosen 14s → NULL); 122 = calendar kinds visit +
  delivery. Older: see git log `migrations/`.
- **Production with `supabase db query --linked`** (writes pre-approved);
  **the local copy with `docker exec -i supabase_db_jensen-fms psql …`**.
- **Spoken notes + Inbox** — verified: a real recording in PRODUCTION (Nazar,
  desktop Chrome, 8 Oct: saved, English detected, 98 % clarity); locally the
  board (desktop + 360 px, as Nazar and as Finn), Done/Undo/Mark all/Reopen,
  the planner on the real model ("G K O K nul et" → GKOK01; number words →
  21 19 77 10 on the existing contact, applied; "we need to invoice" →
  Dennis; "remind me Monday" → 12 Oct), *Act right away* on the REAL
  calendar (book ✓ auto, move ✓ auto, cancel suggested only — it had found a
  real entry in the wrong week). **Not verified: Finn's Android** — silence
  detection with road noise, and whether a web app shows on a car screen.
- **Calls** — live in production at `/inbox` (`/calls` redirects; a call's
  page stays `/calls/<id>`). Lines on: *Finn Nysom* (`RELATEL_TOKEN_FINN`),
  *Mathilde / Nazar* (`RELATEL_TOKEN_NAZAR`), *Dennis Jensen* 42 49 15 51
  (`RELATEL_TOKEN_DENNIS`, set up by the owner 8 Oct — first calls not yet
  checked). A main-number call is recorded when it lands on a mobile with
  recording on (DECISIONS 2026-10-07); option 1 → *Oprettelse* still imports
  as *Answered · not recorded*. A call's repair ticket is optional (13d3fab).
- **Calendar** — `/calendar` reads Google live; calls, notes and commands
  suggest visits/deliveries; notes can move/delete entries; a confirmed SO has
  *Add* / *Move* / *Remove* for its delivery, its time read live from Google.
  Calendar titles from TEST sources start with TEST (`inheritTestTitle`).
  **TEST entries in *Servicebesøg* now:** only two past ones from 30 Sep (a
  visit 10:00 and an all-day entry). The Gladsaxe entry Fri 9 Oct 13:03 was
  made in the 7 Oct meeting test, has no TEST marker, and was left alone.
- **The assistant** — one floating button (⌘K), Haiku 4.5, scoped by role;
  its panel also holds *Save as note* and the person's button mode.
  **Transcription:** ElevenLabs Scribe v2 on the global host (EU key = a
  go-live gate). **Extraction model:** `claude-sonnet-5` in production.
- **Service agreements** — per bike, built 29 Sep (verified locally, not yet
  used in production). Dennis's answers: handling doc §7 items 1–23.
  **Register import is PLANNED** (`docs/plan-register-import.md`); **renewal
  invoicing is PLANNED** (`docs/plan-renewal-invoicing.md`) and on hold until
  imported data is checked.
- **Payment terms** — a customer's own figure, else 30 days public (EAN /
  municipality / hospital), else 8 (`resolvePaymentTermsDays`, migration 123).
- **Finn Nysom and Glenn exist in production** (role *Workshop*).

## In flight — waiting on someone
- **Finn's Android, the real test:** set his button to "saves on a pause",
  record a note in the car; check the pause detection with road noise and
  whether the app can be on the car screen. Then a *Notes* section in his
  guide (PDF). His *Act right away* switch is OFF until he has used notes.
- **Register import — the pilot:** Dennis's cleaned spreadsheet (due Fri 9
  Oct); **Nazar names the pilot municipality** (Allerød cleanest, but no 0-kr
  rows); goal: all bikes + agreements in by the end of the week of 12 Oct.
  Owner decisions before later batches: **GPS-only lines** (recommended: an
  agreement kind `service | gps`; the register's GPS sheet is keyed by battery
  number), **departments that exist as their own customer** (31; recommended:
  convert to units case by case). Fleet-letter answers A / C2 / C12 open.
  **Production's only agreement, "Test agreement" on Nazar Taras, lacks the
  TEST marker** — the fee button would bill it; rename or cancel.
- **Owner decisions pending:** the 3 % yearly increase on NEW agreements (can
  wait for Dennis's new agreement text); contacts from calls on a DEPARTMENT
  (contacts have no unit column); renewals by EAN (parked in BACKLOG).
- **Dennis:** the cleanup; customers + departments; one contact list (from
  Finn's phone + the spreadsheet); part sales prices; assembly notes on
  template lines; the basket's *Paintable as*; what his sales calls should
  trigger; the seven unclassified bikes; the label printer model.
- **Nazar:** e-conomic admin approval → the production grant token; move the
  Google key file out of the project folder (`jensen-fms-38357d206d22.json`,
  gitignored); click the 27–28 Sep work in production; sign in as Finn with
  him at the next visit. An uncommitted change to `public/icon-mark.svg` sits
  in the working copy — not from these sessions; commit or discard.

## Landmines
- **A spoken note's audio is KEPT** under `notes/` in the inbound bucket
  (retention applies); a dictation's is deleted. Don't sweep `notes/` as
  stray dictation audio.
- **The apply core is `applyPlanAction`** (server-only, takes the actor) —
  never export it from a `"use server"` file. A NEW action kind also needs
  `command_actions_action_type_check` (migrations 125/126 — found the hard way).
- **Deleting a calendar entry is never automatic** — a note's "Friday"
  resolved to the wrong week in testing.
- **Testing in the browser pane:** the mic is blocked there; Chrome Translate
  in a real Chrome used to crash the app (now opted out). The Claude-in-Chrome
  automation tab could not upload to local storage (503 from the browser
  itself) — test recordings in a normal browser.
- **Finn drives paint runs from `/work/paint-runs`**, not the paint-order pages.
- **Counting identifiers by category needs clean categories** (Batteries,
  Charger hold only those).
- **The local copy:** production's data (anonymised) from 1 Oct + migrations
  through 126. **Redo the `storage.*` swap in `data.sql` after every re-dump**
  (local storage schema is older). Keep disk free (`.next` grows to 10+ GB).
  **Stopped at session end, 8 Oct** (dev server, `supabase stop`, Docker
  Desktop). To resume: `open -a Docker`, `supabase start`, the dev server.
  **Local TEST data from 8 Oct:** TEST notes for Finn / Nazar (some closed);
  contact *TEST Christina Holm* (Gladsaxe Hjemmepleje, phone now 21 19 77
  10); bike `JP-2026-E_BIKE-035` owned by Gladsaxe Hjemmepleje with code
  GKOK01 (local only); `SO-TEST-0001` / `SO-TEST-0002` (no calendar entries).
- **Charger "numbers" on newer bikes are model codes** — never import as unique.
- **Pre-v3 sessions are upgraded** in `src/lib/auth/session.ts`. Delete after
  2026-10-27 (BACKLOG).
- **Test sizes at 360 px**, not only the 375 px preset.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions
1. **Finn's Android** (above), then the *Notes* section of his guide (PDF).
2. **The register pilot** as soon as the cleaned spreadsheet and the pilot
   choice arrive — `docs/plan-register-import.md` §9 (schema migration +
   `import_fleet.py` plan/sql/verify/rollback generators can be built against
   the old register now).
3. **Renewal invoicing** after the import is checked (`plan-renewal-invoicing`,
   phase A).
4. **Next without anyone:** the loading scan (QR on the delivery note), box
   labels once the printer is known, the builder's iPad view.

## Checks — the baselines to match
- **Smoke, local (2026-10-08): 98 pass · 22 redirect · 9 skip · 0 fail.** Run
  it AFTER `build:check`, not alongside — overlapping them gave 30 transient
  failures on 8 Oct.
- **Lint: 0 errors, 14 warnings** (all pre-existing).
- **Invariant audit** (not re-run): two standing hits — check 17 (`JP-BasJen`)
  and check 18 (legacy `unit_cost_basis = 'none'`).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` — real or test?
- **Recognition prefixes per customer** and **department codes**
  (`organization_units.code`) — the build screen and the names list use both.
- Glenn's surname, email, phone; the signed agreement PDFs.

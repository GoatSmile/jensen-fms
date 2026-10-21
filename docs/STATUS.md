# Status — Jensen FMS

**Last updated: 2026-10-21 (Wednesday).** **The floating button is THE
SECRETARY** (migrations 127–132, DECISIONS 2026-10-21): one press, then a
hands-free spoken conversation in the person's language — it answers from the
Inbox, the calendar and every area the person's role may see (the whole
database, read-only, for Owner and IT admin), carries out safe things at once
for people with *Act right away* (book a visit or delivery, move an entry,
save a note), asks for a spoken yes before cancelling, says what it did, and
remembers the conversation so "move it" means the entry it just read out.
The round button is its End (a dark X). Also: every question to the assistant
had failed since 8 Oct (a duplicate tool name) — fixed; a note that fails to
save now reports why (`client_failures`). All in production.

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
- **Migration 132 is the latest; production AND local at it** (`check:prod`
  / `check:local`, 21 Oct). 132 = ElevenLabs model + a voice per language;
  131 = `speech_provider` (elevenlabs | google); 130 = `ask_voice` default,
  `save_note` action; 129 = `assistant_read_query` + role `assistant_reader`
  + capability `data_query`; 128 = `ask_voice` mode; 127 = `client_failures`.
  Older: see git log `migrations/`.
- **Production with `supabase db query --linked`** (writes pre-approved);
  **the local copy with `docker exec -i supabase_db_jensen-fms psql …`**.
- **The secretary** — verified LOCALLY by voice as Finn (spoken Danish fed in
  place of the mic, since the browser pane has none), on the real
  *Servicebesøg* calendar with TEST entries: book → "when is it?" → "flyt den
  til mandag" → "aflys den" → "ja"; deliveries and unknown customers book;
  no double booking; hands-free listening; End. **NOT verified on a phone** —
  opening the mic without a tap is exactly what iPhone Safari may refuse.
  Production settings: assistant model **Sonnet 5.5** (Haiku said "deleted"
  for a delete that waited); voice **ElevenLabs Multilingual v2**, voice still
  the default English "George"; Finn and Nazar on `ask_voice`; **Finn's *Act
  right away* is ON** (set 21 Oct on the owner's instruction). Finn's first
  real attempts (12:11–12:13) booked nothing — the cause is fixed (DECISIONS
  2026-10-21 "Finn's failed booking").
- **Spoken notes + Inbox** (8 Oct) — still there; notes are now also a thing
  the secretary does when asked (`save_note`), and the note modes stay as
  options.
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
- **Voices:** transcription ElevenLabs Scribe v2 on the global host (EU key =
  a go-live gate); the secretary's voice ElevenLabs too (the answer TEXT goes
  to the same global host). Google Cloud TTS is built as an option but
  Google answers 403 until the Text-to-Speech API is enabled on the service
  account's project (963901193248). **Extraction model:** `claude-sonnet-5`.
- **Service agreements** — per bike, built 29 Sep (verified locally, not yet
  used in production). Dennis's answers: handling doc §7 items 1–23.
  **Register import is PLANNED** (`docs/plan-register-import.md`); **renewal
  invoicing is PLANNED** (`docs/plan-renewal-invoicing.md`) and on hold until
  imported data is checked.
- **Payment terms** — a customer's own figure, else 30 days public (EAN /
  municipality / hospital), else 8 (`resolvePaymentTermsDays`, migration 123).
- **Finn Nysom and Glenn exist in production** (role *Workshop*).

## In flight — waiting on someone
- **Both phones, the real test of the secretary:** Android Chrome and iPhone
  Safari — press once, ask, wait: it must speak, then show *Lytter — tal nu*
  and hear the next question with no press; the X ends it. Then Finn in the
  van. Then a *Secretary* section in his guide (PDF).
- **A Danish voice:** the ElevenLabs key needs `voices_read`; add a native
  Danish voice to *My Voices*; pick it at /admin/settings → Phone & inbox →
  Speech (*Listen* to compare).
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
  in the working copy — not from these sessions; commit or discard. Optional:
  enable Google's Text-to-Speech API if Google should be the voice.

## Landmines
- **The secretary acts on the SHARED calendar.** In tests never say "my next
  appointment / move it" — the next entry may be a real one (a real Helsingør
  visit sits on Thu 22 Oct). Name a TEST customer.
- **A spoken "TEST" arrives lowercase**, so an entry from a spoken test request
  does NOT inherit the TEST marker — type test requests, or check the
  calendar after.
- **`assistant_reader` reads every public table by default** — a new
  secret-shaped column must be revoked from it (migration 129).
- **Testing voice in the browser pane:** replace `navigator.mediaDevices.getUserMedia`
  with a stream built from a `say -v Sara … --data-format=LEI16@16000` WAV
  served from `public/__test_*.wav` (delete after); click the round button by
  screenshot coordinates, not ref.
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
  through 132. **Redo the `storage.*` swap in `data.sql` after every re-dump**.
  Keep disk free. **Stopped at session end, 21 Oct** (dev server, `supabase
  stop`). To resume: `open -a Docker`, `supabase start`, the dev server.
  Local differs from prod: Finn's *Act right away* on, Finn on `ask_voice`,
  assistant model Sonnet 5.5. TEST data from 8 Oct as before; today's TEST
  calendar entries were all deleted.
- **Charger "numbers" on newer bikes are model codes** — never import as unique.
- **Pre-v3 sessions are upgraded** in `src/lib/auth/session.ts`. Delete after
  2026-10-27 (BACKLOG).
- **Test sizes at 360 px**, not only the 375 px preset.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions
1. **The phone test** (above), then Finn uses the secretary for real; watch
   his `/commands` and `client_failures` for what goes wrong.
2. **The register pilot** as soon as the cleaned spreadsheet and the pilot
   choice arrive — `docs/plan-register-import.md` §9.
3. **Renewal invoicing** after the import is checked (`plan-renewal-invoicing`,
   phase A).
4. **Next without anyone:** the spoken-TEST marker; Deepgram as a recognition
   option only if ElevenLabs proves weak on names; the loading scan, box
   labels once the printer is known, the builder's iPad view.

## Checks — the baselines to match
- **Smoke, local (2026-10-08): 98 pass · 22 redirect · 9 skip · 0 fail** —
  not re-run 21 Oct. Run it AFTER `build:check`, not alongside.
- **Lint: 0 errors, 14 warnings** (all pre-existing, 21 Oct).
- **Invariant audit** (not re-run): two standing hits — check 17 (`JP-BasJen`)
  and check 18 (legacy `unit_cost_basis = 'none'`).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` — real or test?
- **Recognition prefixes per customer** and **department codes**
  (`organization_units.code`) — the build screen and the names list use both.
- Glenn's surname, email, phone; the signed agreement PDFs.

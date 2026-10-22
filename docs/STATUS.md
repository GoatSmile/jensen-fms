# Status — Jensen FMS

**Last updated: 2026-10-22 (Thursday).** **The secretary was measured and
made faster and more accurate** (no migrations; DECISIONS 2026-10-22, four
entries). Every turn is now TIMED (`assistant_answer.timings` + the phone's
`client_timings`). Prompt caching, the answer in one round trip and parallel
lookups make a lookup take ~3–4 s on the server. Missing answers were closed
with TOOLS (`paint`, `recent_work`, a bike's full picture, past calendar
entries, table layouts for the database tool) and the open PAGE rides with
every request. The voice is **Flash v2.5** and starts on the FIRST SENTENCE
while the model still writes (`/api/secretary` streams; ~1 s sooner, a 5.6 s
wait measured end to end in the browser). A transcription stalled past 8 s
gets a second attempt. **Long answers are counted, shown and opened**
(`bike_overview`, rows on screen never read aloud, list pages opened under the
conversation). All pushed to production (last commit 01b7ab5 + this docs
commit).

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
- **Migration 134 is the latest; production AND local at it** (`check:prod` /
  `check:local`, 22 Oct; nothing new today). 134 = import provenance on agreements, departments and customers +
  `service_agreements_imported_no_fee`; 133 = everyone on `ask_voice` (the secretary);
  132 = ElevenLabs model + a voice per language;
  131 = `speech_provider` (elevenlabs | google); 130 = `ask_voice` default,
  `save_note` action; 129 = `assistant_read_query` + role `assistant_reader`
  + capability `data_query`; 128 = `ask_voice` mode; 127 = `client_failures`.
  Older: see git log `migrations/`.
- **Production with `supabase db query --linked`** (writes pre-approved);
  **the local copy with `docker exec -i supabase_db_jensen-fms psql …`**.
- **The secretary** — verified LOCALLY by voice as Finn (spoken Danish fed in
  place of the mic): booking, moving, cancelling with a spoken yes, the
  language it hears, hands-free listening, End (21 Oct); sentence-by-sentence
  speech, the conversation staying open over a list page it opened, and a
  follow-up "ja" opening what was offered (22 Oct). **NOT verified on a
  phone** — opening the mic without a tap, and playing one sentence after
  another without a tap, are exactly what iPhone Safari may refuse.
  Production settings (queried 22 Oct): assistant model **Sonnet 5.5**;
  voice **ElevenLabs Flash v2.5**, voice still the default "George" in both
  languages; **everyone on `ask_voice`**; **Finn's *Act right away* is ON**.
  **No spoken turn has been timed in production yet** — the first real ones
  answer "how long does it take" (`select assistant_answer->'client_timings'
  … where kind='command'`).
  Known weak spots: Gladsaxe's bikes took 10 s once locally (not looked
  into); spoken replies may still read a recognition code or an MO number
  when asked for it.
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
  **The register import is BUILT and tested locally** (`import_fleet.py plan`
  / `sql`, plan §1 — waits for Dennis's cleaned file); **renewal
  invoicing is PLANNED** (`docs/plan-renewal-invoicing.md`) and on hold until
  imported data is checked.
- **Call summaries are written in the READER's language** (21 Oct late, e2da198):
  the call's person, else the app default. Calls read before keep English.
- **Payment terms** — a customer's own figure, else 30 days public (EAN /
  municipality / hospital), else 8 (`resolvePaymentTermsDays`, migration 123).
- **Finn Nysom and Glenn exist in production** (role *Workshop*).

## In flight — waiting on someone
- **Both phones, the real test of the secretary:** Android Chrome and iPhone
  Safari — press once, ask "Hvad er status på cykel 35?", wait: it must speak
  EVERY sentence with no silence in the middle, then show *Lytter — tal nu*
  and hear the next question with no press; "Vis mig cyklerne på lager" must
  open the list with the conversation still on top; the X ends it. Then Finn
  in the van. Then a *Secretary* section in his guide (PDF).
- **A Danish voice:** the ElevenLabs key needs `voices_read`; add a native
  Danish voice to *My Voices*; pick it at /admin/settings → Phone & inbox →
  Speech (*Listen* to compare).
- **Register import — the pilot:** Dennis's cleaned spreadsheet (due Fri 9
  Oct, still being finished — Dennis was on it 21 Oct); **the pilot is
  Allerød** (agreed with Dennis 21 Oct; he fixes the three "Special deal,
  Thomas" bikes — in service since 1 Jan — and writes which date wins when
  the sheet and the municipality tab disagree, before the import).
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
- **Nazar, from the 21 Oct meeting with Dennis** (recorded in Munr, action
  items sent to Dennis by mail): call Dennis back about the secretary (it now
  answers and speaks); **change Finn's password** — it was said aloud while
  installing the app and is in the Munr transcript; check whether a part's
  internal note / the supplier's drawing or item number can reach the PO
  Dennis sends John; why a call's suggestion said *pickup* for the
  Lyngby-Taarbæk delivery; decide with Dennis what Finn's app shows (start
  page, access, language).
- **Nazar:** e-conomic admin approval → the production grant token; move the
  Google key file out of the project folder (`jensen-fms-38357d206d22.json`,
  gitignored); click the 27–28 Sep work in production; sign in as Finn with
  him at the next visit. An uncommitted change to `public/icon-mark.svg` sits
  in the working copy — not from these sessions; commit or discard. Optional:
  enable Google's Text-to-Speech API if Google should be the voice.

## Landmines
- **The secretary acts on the SHARED calendar.** In tests never say "my next
  appointment / move it" — the next entry may be a real one. Name a TEST
  customer, and delete what a test booked (`deleteCalendarEntry` from a
  script with `process.loadEnvFile(".env.local")` — the key is multi-line).
- **A spoken "TEST" arrives lowercase**, so an entry from a spoken test request
  does NOT inherit the TEST marker — type test requests, or check the
  calendar after.
- **`assistant_reader` reads every public table by default** — a new
  secret-shaped column must be revoked from it (migration 129).
- **Testing voice in the browser pane:** make the spoken question with the
  app's own voice in the page (`fetch('/api/speak', {method:'POST', body:
  {text, lang}})` → `arrayBuffer`), replace `navigator.mediaDevices.getUserMedia`
  with a stream that plays it (`AudioContext.decodeAudioData` →
  `createMediaStreamDestination`), one clip per call so hands-free turns run by
  themselves; click the round button by screenshot coordinates; wrap
  `HTMLMediaElement.prototype.play` to see what was played and when. The
  stored `client_timings` of the turn are the proof.
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
  through 134, plus **150 TEST bikes (`TEST-LIST-001…150`) and five TEST
  customers** added 22 Oct to test lists — delete with `frame_number like
  'TEST-LIST-%'` and `legal_name like 'TEST %'` when they are in the way. **Redo the `storage.*` swap in `data.sql` after every re-dump**.
  Keep disk free. **Stopped at session end, 22 Oct** (dev server, `supabase
  stop`). To resume: `open -a Docker`, `supabase start`, the dev server.
  Local differs from prod: Finn's *Act right away* on, assistant model
  Sonnet 5.5, voice Flash v2.5 in both. TEST data from 8 Oct as before; the
  22 Oct TEST calendar entry was deleted.
- **Charger "numbers" on newer bikes are model codes** — never import as unique.
- **Pre-v3 sessions are upgraded** in `src/lib/auth/session.ts`. Delete after
  2026-10-27 (BACKLOG).
- **Test sizes at 360 px**, not only the 375 px preset.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions
1. **The phone test** (above), then Finn uses the secretary for real; watch
   his `/commands` and `client_failures` for what goes wrong.
2. **The register pilot (Allerød)** as soon as the cleaned spreadsheet
   arrives: `python3 scripts/import_fleet.py plan --batch
   register-2026-10-pilot-allerod --sheets "ALLERØD KOMMUNE" --src <file>`,
   confirm the mapping (which EAN is *Hjemmeplejen*), review PDF to Dennis,
   then plan §5 steps 3–6.
3. **Renewal invoicing** after the import is checked (`plan-renewal-invoicing`,
   phase A).
4. **Next without anyone:** read the first production timings and act on the
   slowest stage; the spoken-TEST marker; Deepgram as a recognition
   option only if ElevenLabs proves weak on names; the loading scan, box
   labels once the printer is known, the builder's iPad view.

## Checks — the baselines to match
- **Smoke, local (2026-10-22): 98 pass · 22 redirect · 9 skip · 0 fail.**
  Run it AFTER `build:check`, not alongside.
- **Lint: 0 errors, 14 warnings** (all pre-existing, 22 Oct).
- **Invariant audit** (not re-run): two standing hits — check 17 (`JP-BasJen`)
  and check 18 (legacy `unit_cost_basis = 'none'`).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` — real or test?
- **Recognition prefixes per customer** and **department codes**
  (`organization_units.code`) — the build screen and the names list use both.
- Glenn's surname, email, phone; the signed agreement PDFs.

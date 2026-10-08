# Status — Jensen FMS

**Last updated: 2026-10-07 (Wednesday, evening).** **Deliveries go in the
calendar** (migration 122, DECISIONS 2026-10-07): a call drafts a *delivery*
for a date both sides agreed, next to its offer; a confirmed sales order has
*Add delivery to calendar*, one per order (an entry on the offer it came from
counts). **Reminders are parked** — only visits and deliveries. Every applied
suggestion now says what it made and links there; the calendar opens on the
entry. On the call page, Transcript and Extraction fold away once filled. All
in production; verified locally only.

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
- **Migration 126 is the latest; production AND local verified at it**
  (126 = ledger accepts move_event / delete_event; 125 = attach_note /
  save_contact; both queried 8 Oct).
  Before it: **124**
  (queried 8 Oct: the `note` channel, the six note columns, the two people
  columns, ledger 124). 124 = spoken notes (channel, kind, addressee, context,
  due day, Done columns, `command_actions.auto_applied`,
  `people.assistant_mode` + `assistant_auto_apply`). 123 =
  payment terms follow the rule (default dropped, the unchosen 14s → NULL).
  122 = calendar kinds
  visit + delivery, `calendar_events.sales_order_id` + `offer_id`;
  121 = `search_organizations_fuzzy`;
  120 = `inbound_assistant_model`;
  119 = `assistant_answer`; 118 = calendar kinds. 117 = calendar settings +
  `calendar_events` + `draft_visit`; 116 = `plan_attempted_at` + the new
  suggestion kinds in the ledger check; 115 = `inbox` for Sales, not the
  Accountant. 113 = `inbound_elevenlabs_region`, 114 = its default `global`.
  **Migration 112 before that** (queried the
  table, the stamped calls, the grant and the constraint, 30 Sep). 112 =
  `phone_lines` (Finn's line mapped to Finn; `Employee#74332` "Mathilde /
  Nazar" came across as an unnamed shared line — map it or switch it off),
  `inbound_messages.phone_line_id` + `handled_by_person_id`, disposition
  `needs_action`, `calls_own` for Workshop. 111 = call import settings + the
  unique `channel_meta.external_id` index. 110 = agreement lines,
  agreement documents, private `agreement-documents` bucket, the WO line stamp,
  `dashboard_monthly_stats()` counting lines (prod had one test agreement with
  no bikes, so the backfill wrote nothing). 106 = paint lifecycle, 107 = delivery fields + private
  `signatures` bucket + `so.ready` for Owner, 108 = identifier uniqueness and
  counting (and JP-BH CWF1 refiled Batteries → Rear Carrier, owner),
  109 = `cron_runs` + `jobs` + `paint.received_incomplete` for Owner.
- **Production with `supabase db query --linked`** (writes pre-approved, owner
  2026-09-04; `-f` takes a whole file). **The local copy: `docker exec -i
  supabase_db_jensen-fms psql …`** — `--local` takes one statement per call.
- **Everything shipped on 27 and 28 Sep was verified in the browser against
  the LOCAL copy only** — nobody has clicked it in production yet.
- **Calls — live in production** (DECISIONS 2026-09-29 + 09-30; CLAUDE.md
  inbound rule). `/calls` (`/inbox` redirects), `/commands`, Dictate a command in
  the app chrome. Production state: lines *Finn Nysom* → `RELATEL_TOKEN_FINN` and
  *Mathilde / Nazar* → Nazar Taras, `RELATEL_TOKEN_NAZAR`, both on and both
  tokens accepted (the 00:25 run on 30 Sep); the other six stored with import off
  (their numbers mark internal calls). Four real calls are in, both outgoing ones
  repaired (mixed-format MP3) and transcribed. **Not yet seen by a human in
  production:** `/calls` as Dennis and as Finn, and a call on Nazar's line
  (voicemails arrive; triage now reads content first — DECISIONS 2026-09-30).
  **A main-number call IS recorded when it lands on a mobile with recording
  on** (verified 7 Oct: Main #1 → 5 → Nazar at 10:28 and Main #1 → 2 → Finn on
  6 Oct both arrived with audio and a transcript; DECISIONS 2026-10-07). The
  mobile records, not the switchboard, so no plan upgrade is needed. The gap is
  wherever a call lands on a number without recording — option 1 → Oprettelse
  — which still imports as *Answered · not recorded*; missed calls as *to do*.
- **Spoken notes — slice 1 built 8 Oct** (`docs/plan-inbox-notes.md`,
  DECISIONS 2026-10-08): the button's mode per person (ask / note on second
  press / note on a pause), *Save as note* in the panel, notes saved then
  transcribed and shown on the Calls page as their speaker's to-do.
  Verified locally: a typed note as Finn, the mode switch (button becomes
  *Notat*), the blocked-mic message, phone width 360 px, and a spoken note's
  transcription end to end (a `say`-generated Danish WAV, 96 % clarity).
  **NOT verified: a real recording** — the browser pane blocks the mic, so
  silence detection, the beeps and the upload need a real phone (Finn's
  Android). **A real recording WAS verified in production on 8 Oct** (Nazar,
  desktop Chrome: saved, English detected with no toggle, 98 % clarity).
- **The Inbox — slice 2 built 8 Oct**: `/inbox` (nav *Inbox*; `/calls`
  redirects, a call's page stays `/calls/<id>`) — notes in a column per person
  (yours first, empty people as chips, older open notes folded with their age),
  side panel / full-screen sheet on a phone, Done + Mark all done + Undo +
  Reopen, calls below (notes no longer mixed into them). Verified locally as
  Nazar (desktop + 360 px) and as Finn (360 px): fold, Done → DB closed by
  Nazar, Undo → reopened, Mark all done → 4 closed, Reopen, side panel, the
  `/calls?tab=` redirect. Smoke 98 · 22 · 9 · 0 (baseline).
- **Notes are read — slice 3 built 8 Oct** (migration 125 = the ledger's
  action list): the note planner suggests *Put on record* / *Save contact* /
  a visit / an offer, sets who a note is for and its day; suggestions apply
  from the Inbox side panel; a note closes itself when they are applied;
  *Calls and notes* on bike and customer pages. Verified locally against the
  real model (4 TEST notes): "G K O K nul et" → bike GKOK01 + its customer;
  "enogtyve nitten syvoghalvfjerds ti" → 21 19 77 10 on the existing contact
  (old → new shown, applied, contact updated, note closed); "we need to
  invoice" → Dennis; "remind me Monday" → Finn, 12 Oct.
- **Act right away + calendar move/delete — slice 4 built 8 Oct** (migration
  126 = ledger accepts move_event / delete_event): a switch on the person
  page; safe kinds apply as the speaker, marked *automatically*. Tested on the
  REAL *Servicebesøg* calendar with Finn's switch on: book (Thu 15 Oct 10:00)
  ✓ auto, move (→ Fri 16 Oct 13:00, same entry) ✓ auto, cancel ✗ — found a
  real entry in the wrong week → **deleting made press-only** (DECISIONS
  2026-10-08). The test visit was deleted afterwards; the planner had dropped
  TEST from its title. The real Gladsaxe entry Fri 9 Oct 13:03 (from the 7 Oct
  meeting) is untouched. **The plan-inbox-notes slices are all built**; the car
  test on Finn's Android is the one still open.
- **Sales order delivery: *Move* / *Remove* (8 Oct)** beside "In the calendar",
  the time read live from Google; calendar titles from TEST sources now start
  with TEST. Verified locally on the real calendar: SO-TEST-0001 moved Tue 13
  → Wed 14 Oct 11:00 (length and title kept, link row followed) and back;
  SO-TEST-0002 removed (gone from Google and the link table, *Add* returned)
  and re-added as "TEST Nazar Taras — delivery SO-TEST-0002". TEST entries now
  in *Servicebesøg*: Mon 12 Oct 09:00 (SO-TEST-0002) and Tue 13 Oct 09:00
  (SO-TEST-0001) — removable from their orders' pages.
- **Calls come with suggested actions** (migration 116, DECISIONS 2026-09-30):
  the import job drafts an offer / repair ticket / visit per read call with a
  request. In production since 30 Sep: the first run planned the 28 Sep Finn
  voicemail (ticket) and the 15:48 test voicemail. **Garbled customer names
  fixed** (migration 121): a call never creates a customer; its offer now asks
  "Which customer?" with Frederiksberg Kommune first. Verified locally end to
  end and the fuzzy search in production; the 15:48 voicemail's card in
  production is not yet SEEN (no production session from this machine).
- **The assistant — live, behind ONE floating button** (migration 119,
  DECISIONS 2026-10-01): bottom right on phone and desktop (⌘K), its panel
  answers ("what's in the calendar on 30 Sep?" + follow-ups), opens ("show me
  bike 36" → straight there; "bike 3" → a list), drafts (deliveries, visits,
  tickets, offers) with one-tap cards, and holds Scan. Scoped by role. Verified
  locally as Nazar and as Finn at 360 px and desktop (no prices, no customer
  pages, Danish). **Not yet seen in production.** Model:
  **Claude Haiku 4.5** (`inbound_assistant_model`, prod verified 1 Oct; the
  call reader stays on Sonnet 5.5). Measured on Haiku, local dev server: 2–6 s
  Send → answer; relative dates verified (Fri/tomorrow → 2 Oct, next Tue → 6
  Oct, "mandag den 12." → 12 Oct). Scan is only in the panel — the Workshop
  floor header lost its own button.
- **Calendar — visits and deliveries** (migrations 117–118, 122; DECISIONS
  2026-10-01 + 10-07): `/calendar` lists entries read live from Google,
  filter by kind; calls and dictated commands suggest visits and deliveries,
  applied with one press; a confirmed SO adds its own delivery. Verified
  locally end to end against the real *Servicebesøg* calendar (a call copy →
  offer + delivery, the SO button, the converted-order guard). **Testing may
  write to *Servicebesøg* with TEST in the title** (owner, 7 Oct). TEST
  entries there now: a visit Wed 30 Sep 10:00, an all-day entry Wed 30 Sep,
  "TEST Nazar Taras — delivery of 3 red bikes" Mon 12 Oct 09:00, "TEST
  Leveringskunde ApS — delivery SO-TEST-0001" Tue 13 Oct 09:00 — the app
  cannot delete; Finn or the owner removes them in Google. **The 7 Oct
  production call `2d99e1ca…` was planned before deliveries existed** — press
  *Re-run* on its suggestions to get the delivery card. Live settings:
  provider google + the *Servicebesøg* id (saved 1 Oct). Not built: plan
  slices 2–4 (sync-back webhook, approval queue, reschedule intent) —
  `docs/plan-service-calendar.md`; moving/deleting an entry from the app
  (BACKLOG).
- **Extraction model: pick any current Claude model safely** (DECISIONS
  2026-09-30): the Test runs the real jobs and saving refuses a model that
  fails them. Production is on `claude-sonnet-5`; Sonnet 5.5 passed locally and
  extracted a real test call — switch in admin when wanted.
- **Transcription: ElevenLabs Scribe v2, global host** (DECISIONS 2026-09-30).
  Verified locally: dictation 4 s; the two test calls re-heard at clarity
  0.98/0.97 against Gladia's 0.50/0.22, names right from the names list.
  Production: `ELEVENLABS_API_KEY` in Vercel and both providers switched to
  ElevenLabs (30 Sep); the first production call through it was a 1-second
  voicemail on Nazar's line (nothing said — which also proves that line
  imports).
- **Scheduled jobs are watched at `/admin/jobs`** (capability `jobs`, Owner +
  IT admin; migration 109): list from `vercel.json`, last runs from
  `cron_runs`, *Run now*. The new `paint-drop-offs` job runs 04:00 UTC — check
  its first run on the page (a run appears only after this deploy).
- **Guides (PDF):** `GUIDE-FINN-DA-2026-09.pdf` (+ EN) for Finn — repairs,
  §8 paint runs (*Lakture*), §9 deliveries (*Leveringer*);
  `GUIDE-DENNIS-PAINT-DA-2026-09.pdf` for paint orders. Screens are shot from a
  production build on port 3100 (headless Chrome: 500 px minimum width, and it
  never exits on its own — the shot loop kills it).
- **Service agreements: per bike, built 29 Sep** (DECISIONS 2026-09-29; CLAUDE.md
  rule). Upload on the customer page → `/service-agreements/documents/<id>`
  (read → confirm); lines on the agreement page (*Add bikes*, *End*).
  Verified locally end to end (photo and PDF, new + existing agreement, move,
  near-miss suggestion, delete, WO stamp, phone width) — **not yet in
  production**. **Not built:** the register import (after the fleet answers
  and the switch-over month), renewal invoicing (the fee engine still bills
  `monthly_fee` in arrears), the SA- number, sales-order link. Open questions
  to Dennis: handling doc §7. **Dennis's guide:**
  `GUIDE-DENNIS-AGREEMENTS-DA-2026-09.pdf`. **Renewal invoicing is planned**
  (`docs/plan-renewal-invoicing.md` + PDF), waiting for go-ahead and five
  decisions — the big one: how a renewal reaches a municipality by EAN when
  FMS invoices go to e-conomic as vouchers.
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
  - Try the agreement upload in production on a TEST customer with a real
    photo of a page (the local copy reads, but only production has real bikes).
  - e-conomic: someone with admin rights approves our app's install link →
    the production grant token (settings only, never chat).
  - **Move the Google key file out of the project folder**
    (`jensen-fms-38357d206d22.json` — gitignored now, never committed; the
    key already lives in `.env.local` and Vercel) → password manager or delete.
- **The register import is PLANNED** (`docs/plan-register-import.md`, 8 Oct):
  bikes + agreement lines together per batch, pilot municipality first
  (Allerød recommended — cleanest, but no 0-kr rows), main batch by Fri 16
  Oct. Blocked on: the cleaned spreadsheet (B1), the pilot choice (B2); later
  batches also on GPS-only (D1), departments that exist as their own customer
  (D2), and fleet-letter answers A/C2/C12. **Production's only agreement,
  "Test agreement" on Nazar Taras, lacks the TEST marker** — the fee button
  would bill it; rename or cancel.
- **Agreements — the pilot (7 Oct meeting; handling doc §7 items 17–23):**
  Dennis finishes the spreadsheet cleanup by Fri 9 Oct; **Nazar names the ONE
  municipality** imported first (Dennis cleans its rows first); goal: all bikes
  and agreements in by the end of the week of 12 Oct, Dennis off the
  spreadsheet. **Invoicing is on hold** until the imported data is checked.
  Before the pilot: decide where the register's **GPS-only (480 kr) rows** go —
  today every line hangs on a service agreement.
- **Dennis, after the cleanup:** customers + departments (a municipality has no
  EAN, each department does; many municipalities are empty shells in
  `/organizations`); one contact list gathered from Finn's phone and the
  spreadsheet (any mess — it gets imported); part sales prices; add assembly
  notes on template lines (e.g. the chain-guard holder drilled for the 410
  mid-motor) — check they reach the pick list; mark test data TEST; the fleet
  answers; the seven unclassified bikes; the label printer model.
- **Owner decisions pending:** the **GPS-only line** (recommendation given
  7 Oct, not yet chosen — blocks only municipalities with 480 kr rows); the
  3 % yearly increase on NEW agreements (can wait for Dennis's new agreement
  text); **the one dictation button** — how Ask and "just log it" share it and
  where the log lives (options laid out 7 Oct); contacts from calls on a
  DEPARTMENT (contacts have no unit column today). Parked: renewals by EAN
  (BACKLOG). **Decided 7 Oct:** payment terms 30 public / 8 standard
  (migration 123); a call's repair ticket is optional.
- **Calls, from the 7 Oct meeting:** import **Dennis's business line**
  ("Dennis Jensen", 42 49 15 51 — owner confirmed) — needs Dennis's OWN
  Relatel token (`RELATEL_TOKEN` is Finn's), made logged in as him →
  `RELATEL_TOKEN_DENNIS` in Vercel, then the line on at *Settings → Phone &
  inbox*. *Oprettelse* (option 1) is wanted too, but rings an unrecorded
  phone: whether that phone can record decides it. Spoken numbers and
  recognition codes are ALREADY extracted and matched (`callbackNumber`,
  `fleetNumber` in `match.ts`) — what is missing is data (contacts, codes)
  and `organization_units.phone` as a probe. The names list now has the
  shop's own names and recognition prefixes/codes (7 Oct). A dictated "put X
  in the calendar" was not found afterwards — check `/commands`. Dennis to
  decide what his sales calls should trigger. Next visit: sign in as Finn
  together. Dennis fixes the basket's *Paintable as* himself.

## Landmines
- **Finn drives paint runs from `/work/paint-runs`**, not the paint-order pages
  (those show prices; Workshop has no `paint`).
- **Counting identifiers by category needs clean categories**: Batteries and
  Charger must hold only batteries and chargers, or bikes get asked for extra
  numbers (CLAUDE.md, identifier rule).
- **The local copy was REBUILT on 1 Oct** from fresh production dumps, after
  a full disk (473 MB free) wrecked Docker's disk image and the Docker update
  started empty. **All earlier local TEST data is gone** (TEST Finn, the TL
  agreements, TEST bikes/SOs/paint orders) — recreate what a test needs.
  Local now: production's data (anonymised), migration 117, the calendar
  settings, one TEST voicemail `7eda1122…` with an applied visit. `data.sql`
  had its `storage.*` rows swapped for core-column bucket inserts: the local
  Supabase is older than production's storage schema (`lifecycle_configuration`)
  — **redo that swap after every re-dump**, or the seed fails. Keep disk free:
  `.next` had grown to 18 GB; `supabase stop` before updating Docker.
  **Everything is STOPPED at session end, 7 Oct** (`supabase stop`, data
  kept; `docker desktop stop`). To resume: `open -a Docker`, then `supabase
  start`, then the dev server. Local TEST rows from 7 Oct: call copy
  `b7221007…` (offer OFF-2026-0004, delivery applied), customer *TEST
  Leveringskunde ApS*, `SO-TEST-0001` and `SO-TEST-0002` (the latter
  converted from that offer).
- **With the browser pane hidden**, streamed sections never reveal and real
  clicks fail: `window.$RV(window.$RB)`, synthetic `pointerdown` for Radix
  menus, `requestSubmit()` for forms.
- **Charger "numbers" on newer bikes are model codes** — never import them as
  unique identifiers.
- **Pre-v3 sessions are upgraded** in `src/lib/auth/session.ts`. Delete after
  2026-10-27 (BACKLOG).
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — worked around on `:root` (DECISIONS 2026-09-13).
- **Test sizes at 360 px, not only the 375 px preset** — Android at 360 is
  where the dashboard overflowed and pushed the command sheet off-screen.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions — `docs/plan-go-live.md`
1. **Calls, first human pass:** open `/calls` as Dennis and as Finn; a test call
   on Nazar's line; a main-number call pressing 2. Decide the transcription
   question (Gladia's slow spells — see the options discussed 30 Sep; BACKLOG).
   Add a *Calls* section to Finn's guide (PDF). **Still from Tuesday (§1):**
   passwords for Finn
   and Glenn; Finn walks one repair with his guide; the e-conomic
   grant; `PNT-2026-0012`. **Calls follow-ups:** the customer picker on
   whether Oprettelse (option 1) gets mobile recording switched on.
2. **Agreements next (§2A):** renewal invoicing per line — plan in
   `docs/plan-renewal-invoicing.md` (phase A buildable on go-ahead); the
   register import waits on the fleet answers. **After Dennis's fleet
   answers:** `import_fleet.py sql` → the bike data migration, then the
   agreement lines (0 kr → ended).
3. **Next without anyone:** the loading scan (QR on the delivery note), box
   labels once the printer is known, the builder's iPad view (§2D).

## Checks — the baselines to match
- **Smoke, local (2026-10-07): 98 pass · 22 redirect · 9 skip · 0 fail.**
  The skips are detail pages with no matching rows in the local copy
  (invoices, tickets, WOs, deliveries, agreement documents).
- **Lint: 0 errors, 14 warnings** (all pre-existing; re-counted 1 Oct — the
  "2" recorded the day before was the *fixable* line, not the total).
- **Invariant audit** (not re-run): two standing hits — check 17 (`JP-BasJen`,
  500 units with no known cost) and check 18 (legacy `unit_cost_basis =
  'none'`, 9 rows; can only shrink).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` — real or test?
- **Recognition prefixes per customer** (BK, GK, …) and **department codes**
  (`organization_units.code`) — the build screen's suggestion uses both.
- Glenn's surname, email, phone; whether Dennis's Trello export replaces the
  register; the signed agreement PDFs.

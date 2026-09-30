# Status — Jensen FMS

**Last updated: 2026-09-30 (Wednesday, midday).** **Finn's calls reach the app
from Relatel, and the inbox became Calls** (migrations 111–112): every recorded
call on a mapped phone line is imported every 5 minutes, transcribed, sorted into
to do / check / no action / done, and shown by day — Finn sees his own, the
office everyone's. Live in production and running. Also: the whole app now shows
Danish time (it read 1–2 h early), and phones at 360 px no longer overflow.

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
- **Migration 112 is the latest; production verified at it** (queried the
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
  (none recorded yet — check Mobilfeatures recording is on for that number).
  Unproven: a main-number call forwarded with option 2 arrives recorded.
- **Dictation hit a slow Gladia** (30 Sep 09:17 UTC, 98 s for 28 s of audio;
  2 s otherwise) and showed "took too long" — BACKLOG has the resume-the-job fix.
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
  - The Google calendar (Calendar ID + `GOOGLE_CALENDAR_SA_KEY` in Vercel +
    `.env.local`).
- **Dennis:** the agreement questions left in the handling document §7; the
  fleet answers; the recording notice; the seven
  unclassified bikes; the label printer model.

## Landmines
- **Finn drives paint runs from `/work/paint-runs`**, not the paint-order pages
  (those show prices; Workshop has no `paint`).
- **Counting identifiers by category needs clean categories**: Batteries and
  Charger must hold only batteries and chargers, or bikes get asked for extra
  numbers (CLAUDE.md, identifier rule).
- **The local stack is STOPPED** (30 Sep). Start Docker, then
  `supabase start -x logflare,vector` — the analytics port will not bind
  otherwise. Local phone lines: Finn's (→ *TEST Finn*, `RELATEL_TOKEN`) plus the
  other seven off; `.env.local` holds only `RELATEL_TOKEN`.
  Local TEST data: people *TEST Finn*, *TEST Tech EN*, *TEST Sælger*; bikes
  `TEST-WCK-REPAIR-001/002`, `TEST-FRAME-TAKE-1` (was PEDAL-003),
  `TEST-WCK-DELIV-001/002` (TL11/12, in stock on `MO-2026-9904`);
  `SO-2026-9902`/`9903` (delivered, signed), `SO-2026-0001` and `9904` (ready);
  `PNT-2026-0008`/`9901` (received back), `9902` (confirmed), `9903` (ready);
  agreements *TEST Lakflow ApS – Hjemmeplejen Nord* (K3, 5 lines, 2 confirmed
  papers), *TEST Lakflow ApS – Plejecenter Syd* (K10, 4 lines — the guide's
  screenshots) and *TEST Lakflow – anden aftale* (its line moved away);
  `WO-2026-0009` (covered);
  parts `TEST-FRAME-Q1`, `TEST-BAT-Q2`; TEST Lakflow has prefix `TL`.
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
   and Glenn; Finn walks one repair with his guide; the calendar; the e-conomic
   grant; `PNT-2026-0012`.
2. **Agreements next (§2A):** renewal invoicing per line — plan in
   `docs/plan-renewal-invoicing.md` (phase A buildable on go-ahead); the
   register import waits on the fleet answers. **After Dennis's fleet
   answers:** `import_fleet.py sql` → the bike data migration, then the
   agreement lines (0 kr → ended).
3. **Next without anyone:** the loading scan (QR on the delivery note), box
   labels once the printer is known, the builder's iPad view (§2D).

## Checks — the baselines to match
- **Smoke, local (2026-09-30): 101 pass · 22 redirect · 4 skip · 0 fail.** The
  skips are invoices and tickets (no rows locally); the two new redirects are
  `/inbox` and `/inbox/<id>`.
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

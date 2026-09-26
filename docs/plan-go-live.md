# Plan — every open to-do, in order, to go-live

**Written 2026-09-26.** One list for everything that is open: `STATUS.md`, `BACKLOG.md`, the
live plans, the **15 Sep meeting** (2 h 53 min with Dennis; every item extracted with its
timestamp and a quote in `~/Documents/1-Projects/Jensen/Misc - Transcripts/… 2026-09-15 10-08
to-dos (extracted 2026-09-26).md`), and two findings from today: **Relatel can probably replace
Twilio for Finn**, and **the fleet register is importable, including the service-agreement
renewal schedule**. Tick or delete lines as they ship; when the list is done, archive this file.
Timestamps like `02:23` point into the meeting transcript.

## 0 · What decides the order

1. **Tuesday 29 Sep, 13:00** — office visit with Dennis and Finn. The next hard date.
2. **Money.** The municipal service contracts pay about half the company's running costs
   (00:07:40); renewals are invoiced by hand from a spreadsheet, 12 months ahead. No sales in
   Aug/Sep; Dennis needs "something proven" for investors (00:08:34).
3. **Go-live 1 January** ("first of first", 02:52) — core functionality by October (STATUS).
4. **Dennis's own number ones:** the *next real order* goes end to end through the system
   (00:15:43); the *delivery process* with a signature ("the number one", 02:23:58); *Finn works
   from his phone by talking to it* (02:51:12).
5. **Dependencies.** The fleet import unblocks Finn's repairs, recognition codes, service
   agreements and renewal invoicing. The Relatel test decides the phone route.

**How we work it:** vertical slices that each ship in one session (gates → browser check →
commit); **Tuesday check-ins** demo what shipped and collect Dennis's answers; architecture
questions get decided before code and land in `DECISIONS.md`. Small independent bugs can be
split into separate sessions while a big workstream runs.

---

## 1 · Now — before Tuesday 29 Sep

### 1A · Finn's phone line: test Relatel before buying a Twilio number *(proposed)*
Dennis's Relatel account (read 2026-09-26, nothing changed): switchboard plan **Omstilling
Professional** (includes the REST API and personal access tokens; no webhooks — those need
Contact Center/Unlimited). **Finn Nysom, 42 47 15 51, already has *Mobilfeatures*** — the add-on
that records a mobile number's calls in AND out, network-side. The main number 70 21 05 46 runs
a phone menu whose **option 2 already rings Finn** (1 → Oprettelse, 3 → Dennis, 4 → a message).
Finn's Relatel login is `service@jensenproduction.dk`. Munr's research (26 Sep) found the API
exposes `GET /calls` with `recording.sound.url`, voicemail MP3s for mobile numbers, and SMS sent
as the employee — the one unknown is whether Mobilfeatures recordings of *mobile* calls show up
in `GET /calls` for the user's own token. **That costs nothing to test: everything is paid for.**
If it passes, Relatel replaces Twilio for Finn: no Danish number, no regulatory bundle, no
forwarding — and it captures every call he makes or takes on his own dialer, which the Twilio
bridge (option-2 calls only) and a "Call customer" button (app-started calls only) never could.
- [ ] Owner: agree to test Relatel first and pause the Twilio number (DECISIONS entry — this
      revisits 2026-09-24).
- [ ] One-page Danish instruction for Finn (PDF): switch on *Optag indgående / udgående
      opkald* in Mobilfeatures; create a personal access token at
      `app.relatel.dk/account/authorized_applications` **logged in as himself** (only the
      number's own user may hear its recordings — an admin token will not do). The token goes
      to Nazar out of band and lives in env only (secrets doctrine). ~45 human-dev-min
- [ ] Probe script: list `/calls` and `/voice_mails` with the token — recording present? audio
      format? mono or two channels? how long after hang-up? ~45 human-dev-min
- [ ] On the day: a call via option 2, a call straight to his mobile, an outbound call from his
      dialer, one voicemail → run the probe.
- [ ] Consent: recording notice on the main number's welcome greeting; decide what Finn says on
      calls to/from his mobile (no operator plays a notice — Datatilsynet requires informing).
- **Pass →** Relatel adapter (§3). **Fail →** the Twilio route as decided 2026-09-24 (number +
  bundle, days of lead time).

### 1B · Fleet import, slice 1 — real bikes in the system *(stretch for Tuesday)*
The register (`KOMMUNE og VIRKSOMHEDS OVERSIGT(1).xlsx`, 59 sheets) — findings in §6.
- [x] Owner decisions (2026-09-26): provenance column; recognition code = the relabelled
      `fleet_number` identifier + a customer prefix. Scope and status mapping: §7.
- [x] Migration 102 (both databases): `import_batches` + `bikes.import_batch_id` +
      `bikes.import_row`; `organizations.recognition_prefix`; `fleet_number` relabelled
      *Recognition code / Genkendelseskode*.
- [x] **Nav: *Imported bikes*** under *Bikes* = `/bikes?origin=imported`; query-aware nav
      matching (fixes *Families* lighting up *Admin*); recognition-code column + *Imported*
      badge on the bikes list.
- [ ] `scripts/import_fleet.py` → review CSVs (duplicate frames, unmatched customers,
      departments) → generated data migration: bikes at the **customer** level (department
      where confident, the rest refined later), identifiers (frame, recognition code, battery,
      charger, key, battery key), delivered date → `assigned_at`, site → `current_location_text`.
      Applied to production and local, verified by query.
- [ ] Recognition code on the customer page and the bike page header (the list has it now);
      teach the call extraction the code's shape (BKTM01, LTKUL11 — it still says "the
      customer's own number"); paginate the bikes list before it passes 1000 rows.

### 1C · Finn on the system
- [ ] **Technicians see no money — before Finn and Glenn log in** (owner, 2026-09-26; Dennis,
      02:39:47). The *Workshop* role today holds `bikes, dashboard, inbox, maintenance, parts,
      scan, work`, and ~20 screens under those show costs or prices: part prices, stock value
      and the Stock value page, a bike's build cost, work-order part prices and totals, the
      dashboard's money, the build workbench. Proposed: one new capability (`costs` — see
      costs, prices, margins, stock value) granted to Owner, IT admin, Accountant and Sales, not
      Workshop; every money figure and the Stock value nav item render only with it. Stock
      *inbound* adjustments ask for a cost, so they become an office task (or the prevailing
      cost applies silently) — decide. ~0.5–1 day.
      **Reassess the role first (owner, 2026-09-26) — proposed:** keep `work`, `scan`,
      `bikes`, `parts` (Kits lives under parts; Glenn labels boxes); **drop** `dashboard`
      (office KPIs, money), `inbox` (call triage is office work; Finn's calls reach him as
      jobs) and `maintenance` (the office ticket/WO pages — techs work jobs from `/work/[woId]`,
      whose gaps get closed instead). Then the cost gate covers only parts, bike detail, the
      floor repair screen and the build workbench.
- [ ] **Bug: a Workshop user cannot open the build workbench.** `/work`'s *To build* links to
      `/manufacturing-orders/<mo>/bikes/<bike>/build`, and `routes.ts` gates every
      `/manufacturing-orders/*` path on `mo`, which Workshop lacks — Glenn would be bounced
      from his own queue. Gate the workbench, batch build and pick list on `work`.
- [x] **Finn Nysom and Glenn** created (2026-09-26): Danish, role *Workshop*, **no password** — so
      neither can log in until technicians stop seeing costs. Glenn's surname, email, phone: Dennis.
- [ ] **Danish user guide (PDF)** — Finn's repair flow first; the paint-order flow for Dennis.
- [ ] **Service calendar slice 0** — now unblocked: Finn's address is `service@jensenproduction.dk`.
- [ ] `/work` gaps before real use: labour time on `/work`; start a WO from a scanned bike with
      no ticket; confirm a provisional frame / add identifiers on site; search by recognition
      code and customer name.

### 1D · Carried over (small, overdue)
- [ ] Click `/offers` in production and confirm it renders (one human click).
- [ ] Send Dennis `PRODUCTION-CHECKLIST-DENNIS-2026-09` + `COLOUR-LISTS-DENNIS-2026-09`.
- [ ] Calendar invite for Tuesday 13:00. Proposal to Renee (not app work).
- [ ] `npm run smoke` on the refreshed local copy (outstanding since 15 Sep).
- [ ] Walk `PNT-2026-0012` with Dennis (received with no parts on its lines) → warn at
      `received_back` when a stock order's lines name no part (BACKLOG hardening).
- [ ] The seven unclassified bikes (`JP-2026-E_BIKE-030…037`) — Dennis: real or test? (He said
      test bikes "disturb" him on screen, 00:18:02.)

---

## 2 · October — the money and the number ones

### 2A · Service agreements — needs a modelling decision first (escalate)
The app's model was generated and never discussed (Dennis, 02:36). Reality, from the meeting
and the register: **agreements are per bike**, not per customer — in one department some bikes
are covered and others not; each bike renews on the anniversary of its delivery; the yearly
price is per bike (1 704 kr = 142 kr × 12; 2 184 kr = 1 704 + 480 kr GPS; other variants
exist). Contract types **K1 / K3 / K5 / K10** (years; K3 because GPS bikes sign for three
years). Invoiced 12 months ahead, a month before the anniversary, for bikes still in service,
renewing unless cancelled (02:41–02:45). Coverage today is derived from the owner org/unit
(`src/lib/agreements/coverage.ts`), which cannot say "this bike, not that one".
- [ ] **Decide the model** (proposed: an agreement ↔ bikes link; coverage = the bike is linked
      to an active agreement; per-bike price; contract type + term with its year-by-year
      schedule; a number series; statuses draft → confirmed → active → cancelled; signer; the
      written text). DECISIONS entry + CLAUDE.md rule edit in the same commit.
- [ ] Import the agreements from the register's monthly schedule sheets (§6) + Dennis's papers.
- [ ] **Renewal invoicing**: draft invoices a month before each anniversary; Dennis approves;
      → e-conomic. Stolen/retired bikes drop out; cancelling stops renewal.
- [ ] Sales order ↔ agreement link; "wants service contract" pre-fills a contract that is sent
      after the build, once frame numbers exist (02:34–02:36). Record coverage at delivery.
- [ ] Dennis: review the agreement form (02:37:51); send the full written agreement text.
- [ ] Open: digital signing of contracts and extensions (02:43:55). Payment terms for renewals
      (Dennis times them around 30 days; CLAUDE.md says net 14 — check).

### 2B · Delivery process — Dennis's "number one"
- [ ] SO moves to *ready* when its MO completes; notice to **Dennis** (some bikes are collected);
      Dennis hands it to Finn in the system with contact, phone, bike count, order number.
- [ ] SO gets a **delivery contact + phone** (known only after acceptance, 02:17).
- [ ] **Delivery note** (*følgeseddel*) + a *Delivery notes* list for the day in the app; the
      customer **signs with a finger** on phone/iPad → SO *delivered* automatically (02:21–02:24).
- [ ] Loading scan (a QR on the order/delivery note). Delivery appointment into Finn's calendar.
- [ ] "Assigned" status label on delivered bikes reads wrong on the customer page (02:26).

### 2C · Paint orders — bugs first, then the lifecycle
Bugs from the 15 Sep run:
- [ ] Paint order must **inherit the colours** already on the SO/MO (it asked again, twice).
- [ ] Inherit **part names and all paintable parts**, not only frames ("No specific part name";
      one part missing; "two parts need painting" vs a frames-only order; all six shown yellow).
- [ ] **One paint job per sales order**, not one per MO/colour (spawn-MO per line made two).
- [ ] "No bikes available to send" from the SO: explain that the MO comes first, or create it.
- [ ] Rename or explain *Refill from bikes*; surface the painter's preview before sending.
Lifecycle (conflicts with "emailing IS the send" — decide before building):
- [ ] Statuses renamed: planned → confirmed (email + labels) → packed (frames linked) → sent /
      at painter (**automatic on the planned send date**, calendar entry for the drop-off) →
      ready (painter's email forwarded in, routed to Finn + company mail) → pickup planned
      (Finn's day, visible to all) → received back (scan) → on the shelf → planned for build.
- [ ] **Box labels** (≈A6 portrait: colour, SO no., parts + painter item numbers, dates, no
      prices; choose how many; printed on confirm) with an **order QR** (scan = received back)
      and a **QR per frame line**; capture frame numbers at packing by scan + photo (legally
      required, unreadable after powder coating); the box QR shows frames still inside.
- [ ] Dennis: label printer model + label size. Finish (matte/gloss) on a paint colour?

### 2D · Build screen for the iPad + identifiers
- [ ] Builder's view: short tick-off pick list, no editable parts list (office keeps it),
      bike-level **notes** field, frame pre-filled from the box-QR scan, 2–3 **photos** at build.
- [ ] Identifier rules (02:04): frame, battery, charger unique **with an "already exists —
      overwrite?" warning** instead of a hard block; lock and battery-lock never unique; a bike
      with no lock or battery can still finish; identifier count follows quantity (2 batteries →
      2 numbers).
- [ ] **Recognition code at build**: pre-filled with the customer's prefix, continuing their
      sequence (show existing codes), optional, only for bikes with an agreement (02:25–02:32).
- [ ] Bugs: second bike on the MO had no parts; required-identifier count 4/4 vs 4/5;
      **screens stall after a submit** until refresh (Finish build greyed; colour picking) —
      investigate app-wide. MO status *confirmed* means nothing to anyone — rename.

### 2E · Offers, sales orders, parts — small items
- [ ] DK standard VAT as the default on offer lines (01:02:37).
- [ ] Dictation button in the offer's send dialog (00:50:34).
- [ ] Reuse a converted offer → *Duplicate offer* (01:01:09).
- [ ] Extra battery/charger on the SO, or attached to the customer later (01:52:54).
- [ ] Create a missing part without leaving the picker (00:25:29).
- [ ] Template paintwork hint: only recipe parts can be painted; colour is chosen on the order line.

### 2F · Templates, kits, labels (mostly Dennis)
- [ ] Dennis's kit definition, now clear: **a kit = the motor-system parts that must go
      together**, one kit per bike, ≤10 kits; many templates built "kit + click". Update the
      BACKLOG *sub-assemblies* entry with this answer.
- [ ] Only Dennis creates templates → role capability check.
- [ ] Box-label scheme: kit colours + category colour + number (white basics, orange wheels,
      light-blue transmission); supplier pre-labels; label on goods receipt. Open: supplier item
      code or own scheme on the label.
- [ ] Dennis: finish the F-350 template; add handlebars, stems, grips; mark kit parts.

---

## 3 · November — Finn by voice, calls and calendar
- [ ] **Relatel adapter** (if 1A passes): poll `/calls` + `/voice_mails` with Finn's token →
      storage → transcription → the inbound trunk → draft ticket. Mono audio means diarization,
      not channel attribution. Copy audio out before Relatel's retention ends. *(Else: Twilio
      bridge + "Call customer" button, BACKLOG.)*
- [ ] Calls that quote a **recognition code** ("LGKUL11") match the bike (02:32:57); the label on
      the bike carries the code + the service number.
- [ ] **Repair flow on the phone**: common-jobs list (tyre, tube, chain, service, big service,
      battery); say what he did; parts under an agreement logged at value; uncovered work +
      drive charge → an e-conomic order; Dennis presses once to invoice; hours on repairs;
      service techs never see cost or price (02:39–02:50). *Repair was deferred to the next
      session with Dennis — confirm the flow before building.*
- [ ] Service calendar slices 1–4 (`plan-service-calendar.md`), incl. delivery appointments
      and paint drop-offs/pickups.
- [ ] **Email into the system**: forwarding addresses (offers@, painter@, finn@…); link a
      customer's emails to the offer/SO; the painter's "ready" email routed to Finn.
- [ ] Per-employee activity view (02:49:56); decide what else is tracked per person.
- [ ] Inbound: define shadow-mode graduation from real traffic (`plan-inbound-triage.md`).

## 4 · December — go-live readiness
- [ ] Staff introduction plan (a first and a second conversation); what each login sees/does.
- [ ] Flip `app_language` / `worker_language` to `da`; the Danish guides; training.
- [ ] Stock count (today's figures are estimates) + warehouse relabelling.
- [ ] Renewal invoicing cut over from the spreadsheet; the next real order end to end.

## 5 · Later / parked (details stay in `BACKLOG.md`)
Wheels (QR per wheel type, stock check when a job goes to paint, automatic wheel-building order)
· production planning after receive-back · a talking AI agent (Munr's shape, not ours) ·
website configurator + lead-gen · price breakdown on the offer · picture per template · template
retirement flag · a TEST marker that travels down generators · the hardening list (dependency
tree, CI tier 2, rate limits, AudioWorklet, …). Dennis's non-app items: the business plan for
his former bank director; the wheel-machine homepage; supplier box labelling; meet John.

---

## 6 · Fleet register — what is in it (profiled 2026-09-26)
- **26 customer sheets**, one row per bike: recognition code (col A — e.g. `BKTM01`; Jensen's
  own numbering, not the customer's, 02:29), agreement flag (ja/nej/blank/"opsagt"), GPS +
  GPS phone, frame **split over three cells** (`WCK` · digits · year letter), key no., model
  (V1–V8, Svajer V4/V6 — no current template matches), battery and charger (split likewise),
  battery-key no., delivered date (2012 → 2026-03), department, site address, contacts, notes
  (repairs, swaps, *stjålet*, *udgået*), service invoicing dates, **EAN per department** (the
  customer import carried none). Header rows and column letters differ per sheet → parse by
  label. ~960 bike rows, ~915 distinct frames, ~40 frames listed twice (moved/replaced → review).
- **12 monthly sheets = the renewal schedule**: bike, customer, purchase date, years 2/3/4 with
  an X when invoiced, and the yearly price — ~825 bikes, ~690 of them matching the fleet sheets.
  The fleet sheets' ja/nej flag disagrees with the schedule for ~130 bikes: the schedule is what
  gets billed.
- **11 sheets NOT to import**: citizens' loan registers 2013–15 and private buyers (names,
  addresses, emails, km readings) — personal data, stale.
- Also: department contact list, one GPS-only subscription, a battery-swap log, the painter's
  price ladder, the frame **year-letter code** (G=2012 … X=2025, Z=2026), labour and markup tables.
- Matching: 21 of 26 sheets map to an existing customer by name; WOLT, Aleris and KL are not in
  the system; two sheets mix several customers. Departments map poorly by name (28 of 126
  automatically) → bikes land on the customer, departments are refined afterwards.

## 7 · Open questions
**For Nazar — these unblock 1A/1B:**
1. ~~Relatel first~~ — yes (DECISIONS 2026-09-26). 2. ~~Provenance column + *Imported
   bikes*~~ — yes. 3. ~~Recognition code = relabelled identifier + prefix~~ — yes.
4. Import only the 26 customer sheets (skip loan registers and private buyers)?
5. Status mapping: in service by default; *stjålet* → lost or stolen; *udgået* → retired.
6. Old models (V1–V8, Svajer V4/V6): keep the model as text for now, templates later?
7. Service agreements per bike (§2A) — agree, or take it to the planning chat?

**For Dennis — Tuesday:**
- Is this register the source of truth, or does the Trello export John is cleaning replace it?
  Anything delivered after March 2026 missing?
- What a yearly price of **0** means in the schedule (free years? ended? included in the sale?).
- The frames listed twice; which bikes are stolen or retired; WOLT, Aleris and KL as customers.
- Each customer's recognition prefix (the register implies most: BK, GK, HK, …).
- The agreement papers and each customer's contract type (K1/K3/K5/K10).
- The label printer model; Glenn's role; the seven unclassified bikes.

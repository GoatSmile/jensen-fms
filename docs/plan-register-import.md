# Plan — importing the register: the fleet and its service agreements, in one go

**8 October 2026. Status: plan, nothing built.** One operation brings
Dennis's spreadsheet (*KOMMUNE og VIRKSOMHEDS OVERSIGT*, "the register") into
the system: the customers' departments, every bike already out with a customer,
and each bike's service-agreement line. It runs after Dennis has cleaned the
spreadsheet. **The pilot comes first**: ONE municipality, named by Nazar,
imported end to end and checked. Then the rest goes in one batch. **The goal is
everything in by the end of the week of 12 October**; after that, nothing more is
entered in the spreadsheet (handling doc §7, items 13 and 21).

This plan supersedes the "bikes first, agreements later" order in
`SERVICE-AGREEMENTS-HANDLING-2026-09` §4 and §8, and step 1B of
`plan-go-live.md`. Bikes and their lines now go in **together, per batch**.

Builds on:
- migration 102 (`import_batches`, `bikes.import_batch_id` + `import_row`,
  `organizations.recognition_prefix`);
- migration 108 (identifier uniqueness);
- migration 110 (agreement lines; `source = 'import'`, `import_batch_id` and
  `import_row` are already on `service_agreement_bikes`);
- `scripts/import_fleet.py review`.

**Renewal invoicing stays on hold** (§7 item 22). The import must not bill
anything, and must not make anything billable (§6).

## 1 · What is ready and what is blocked

**Ready:**
- The model: agreement lines per bike, coverage = an active started line on an
  active agreement (`src/lib/agreements/coverage.ts`), one active line per bike
  (partial unique index).
- Provenance on bikes and lines.
- Identifier rules: frame, battery and charger numbers unique among ACTIVE
  rows. Lock numbers and recognition codes are never unique.
- The parser and review step (`import_fleet.py review`, last run 26 Sep on the
  uncleaned register): it splits the three-cell frame, battery and charger
  numbers, skips the personal-data sheets, and drops names and phone numbers.
- **Production has nothing in the way** (queried 8 Oct, 12:30):
    - no imported bikes and no `import_batches` rows;
    - three live bikes, all `JP-…` test frames, so no `WCK…` collision;
    - no unit with an EAN or a code;
    - no customer with a recognition prefix;
    - one agreement with no lines (see §6).

**Not built:**
- `import_fleet.py sql`. The script has only `review` today; STATUS and
  plan-go-live call the load step `sql`.
- Provenance on agreements, units and customers (§3).
- Any GPS-only shape (§8, D1).

**Blocked, and what each item blocks:**

| # | Missing | From | Blocks |
|---|---|---|---|
| B1 | **The cleaned spreadsheet.** Expected Fri 9 Oct. Copilot may have changed the shape, so the parser is re-profiled against it. | Dennis | everything |
| B2 | **Which municipality is the pilot.** | Nazar | the pilot |
| B3 | **Where GPS-only (480 kr) rows go** (§8, D1). | owner | every customer with a 480 kr row, and the *GPS ABONNOMENTER UDEN SERVICE* sheet. Not the pilot, if the pilot has none. |
| B4 | **A department that exists as its own customer** (§8, D2). | owner | every municipality where it happens. Not a pilot like Allerød (below). |
| B5 | **Fleet letter A — nine sheets with an unclear customer**: WOLT, Helsingør, Firmaer og Forsyninger, Bolig/Ejendoms Selskaber, Novo, Fredensborg, KL, Aleris, Holbæk. **Not answered** (nothing in DECISIONS or STATUS). | Dennis | those sheets only |
| B6 | **Fleet letter C2 — Høje-Taastrup's *SLUT22*** (agreement ended in 2022? are the bikes still there?). **Not answered.** | Dennis | Høje-Taastrup only |
| B7 | **Questions sheet C12 — customers in the system twice** (Rigshospitalet, Herlev SSP, Nybolig offices …): two departments, or duplicates? **Not answered.** Verified 8 Oct: *Herlev SSP* is two customers, with e-conomic numbers 9017 and 9038. | Dennis | those customers only |
| B8 | **Bikes with no customer written** on the two mixed sheets (fleet letter A). A bike *in service* must have an owner (audit check 2.5). | Dennis (cleanup) | those bikes only |

**Answered, or covered by a stated default.** These do not block:
- **Fleet letter B, the five rules.** They were sent as "what I will do unless
  you say otherwise", so they apply until Dennis objects:
    - an unclear department → the bike goes on the customer;
    - a frame listed twice → the latest delivery wins;
    - a battery or charger number on two bikes → the newest bike gets it;
    - *stjålet* / *kan ikke findes* → lost or stolen, *udgået* → retired;
    - old models keep their model name as text.
- **Fleet letter C1, register or Trello.** Not answered. The handling doc
  (§7) treats the register as the source unless Dennis says otherwise.
- **Fleet letter C3, the prices.** Answered: 1 704 kr is the real price;
  2 184 kr = 1 704 kr + 480 kr GPS; 0 kr = ended (§7, items 3, 6 and 19).
- **Fleet letter C4, the recognition prefixes.** Not answered. Bikes import
  with their codes whatever happens. A prefix or a department code is
  written only where Dennis has confirmed it; until then, the build screen
  simply does not ask (CLAUDE.md, recognition-code rule).
- **Fleet letter D, the personal-data sheets.** They stay out, as stated.
- **The fleet letter's appendices** (frames listed twice, shared battery and
  charger numbers). Rules B2 and B3 apply unless Dennis corrects a row. His
  cleanup may have removed some.
- **The open points to Dennis in handling doc §7**: whether the K-type changes
  the starting price (new agreements only), the GPS-only binding period, and
  C1. None of them changes what gets imported. The GPS binding is moot until
  D1 is decided.

**Pilot candidates.** These come from the 26 Sep review of the UNCLEANED
register, so re-check them on the cleaned file. **Nazar decides.**
- **Allerød Kommune** is the cleanest.
    - 22 bikes. No frame listed twice, no number conflicts, no 480 kr row,
      every schedule row priced.
    - Its two departments already exist as units with e-conomic numbers
      (*Hjemmeplejen* #9007, *Allerød Kommune* #9006), and no standalone
      customer duplicates them.
    - The sheet uses the prefix ALK.
    - It does NOT exercise ended (0 kr) lines.
- **Gentofte Kommune** does exercise ended lines.
    - It has several 0 kr rows, departments that are hard to map, three
      number conflicts, and two units both called *Intern service* (#139 and
      #36), so name matching alone cannot place them.
- **Hørsholm Kommune is not a candidate** while D1 is open: one of its rows
  is 480 kr.

## 2 · The shape of one batch

**One batch = one `import_batches` row.** Every row the batch creates points to
it. Every value the batch fills into an existing row is listed in the batch's
rollback file. A batch can therefore be listed, checked and undone by its id.
Labels: `register-2026-10-pilot-<municipality>`, then `register-2026-10-main`.

The steps run in this order inside ONE generated SQL file (one transaction):

1. **The batch row**: label, source file name and its date, `imported_by` =
   the person running it, and a notes summary.
2. **Customers.**
    - Each sheet maps to an existing customer, through a mapping file that a
      person has checked. Fuzzy matching only *proposes*.
    - A customer is created only where Dennis said "create" (KL and Aleris are
      the expected cases). Created customers carry the batch id.
    - `payment_terms_days` stays NULL, which means the rule applies (DECISIONS
      2026-10-07).
3. **Departments (`organization_units`).**
    - **A municipality has no EAN of its own. Each department has one** (§7
      item 23).
    - Match order:
        1. an existing unit of that customer with the same EAN (none have one
           today);
        2. an existing unit named in the checked mapping file;
        3. otherwise a NEW unit, which carries the batch id. It has a name and
           an EAN, and no address.
    - On a matched unit, the EAN is written only if its `ean_number` is NULL.
      A different EAN already there is a conflict for review, never
      overwritten.
    - The department code (`organization_units.code`, e.g. TM in BKTM) is
      written only where confirmed (C4).
4. **Bikes**, one per distinct frame number (`bikes.frame_number` is unique
   across all rows):
    - `bike_type_id`: e-bike when a battery number is present, else pedal.
      This is a default rule, shown in the review (§8, D5).
    - `status` from the register's words (rule B4): `in_service`,
      `lost_or_stolen` or `retired`.
    - Owner: `owner_organization_id`, plus `owner_unit_id` where the
      department is known; otherwise the customer only (rule B1).
    - `assigned_at` = the delivered date. The site address goes into
      `current_location_text`.
    - **`frame_number_confirmed = true`.** These are real frame numbers, not
      generated ones. Without the flag, `isFrameProvisional` and the
      identifier count would treat them as unregistered.
    - `template_id`, `manufacturing_order_id` and `build_cost_dkk` stay NULL.
      We did not build these bikes in the app, and the CLAUDE.md
      bike-creation rule allows no build cost for them.
    - `import_batch_id`, and `import_row` = the source row minus people's
      names and phone numbers. It keeps the GPS phone, the service-invoicing
      dates, the department text, the EAN, the old model name, and the
      schedule's year marks.
    - Inserting a bike fires `trg_bikes_state_log` (a NULL → status row).
      That is expected.
5. **Identifiers**, one `bike_identifiers` row each:
    - **frame**: always, and equal to `bikes.frame_number` (audit checks 19
      and 20);
    - **recognition code** (`fleet_number`), when column A looks like a code;
    - **battery**, **charger**, **lock** (*nøgle nr*) and **battery lock**
      (*bat.nøg.nr*).
    - **A charger "number" that is a model code (`FY…`, `AWCFY…`) is never an
      identifier.** It stays in `import_row` only (STATUS landmine). The
      26 Sep review found these model codes on the newer bikes.
    - **A battery or charger number on two bikes** (rule B3): the newest bike
      gets the active row. The other bike gets the same number as an
      INACTIVE row with `deactivated_at` and a note, so the history survives
      and the unique index is satisfied.
6. **Agreements.** One per customer × department, which in practice is one per
   department EAN; a company with no departments gets one per customer.
    - `status = 'active'`. An agreement whose lines are ALL ended imports as
      `expired` (§8, D4).
    - `start_date` = the earliest line's start. `end_date` NULL.
    - `contract_type` NULL (untyped ≈ K1, §7 item 8). `signed_on` NULL
      (verbal).
    - `covers_parts` and `covers_labor` true.
    - **`monthly_fee` NULL** (§6).
    - The name follows the department, e.g. *Serviceaftale — Allerød Kommune,
      Hjemmeplejen*.
    - **If the customer × department already has an agreement, the batch
      refuses** and names it. Production has none for real customers today;
      a document upload before the import would be the way one appears.
7. **Lines (`service_agreement_bikes`).** One per schedule row that matched a
   bike. All carry `source = 'import'`, `import_batch_id` and `import_row`.
    - **A priced row** becomes an `active` line:
        - `start_date` = the schedule's purchase date (else the fleet sheet's
          delivered date; else the row goes to review);
        - `yearly_price` = the row's price, frozen, DKK. 1 704, 2 184 and the
          other prices (2 284, 2 160, 1 200 …) are kept exactly as written;
        - `has_gps` only where the price includes the 480 kr (2 184) or the
          cleaned sheet marks GPS explicitly. **Never from the fleet sheet's
          GPS column alone**: that column records hardware, not a
          subscription.
    - **A 0 kr row** becomes an `ended` line: `end_reason = 'ended'`,
      `ended_on` NULL (date unknown), `yearly_price` NULL. The 0 is an end
      marker, not a price, and stays in `import_row`. Ended lines never cover
      and are never invoiced.
    - **A frame with both a 0 kr row and a priced row** gets an ended line
      AND an active line. The model allows this (one ACTIVE line per bike).
      It is listed for Dennis as a probable replacement or move.
    - The years already invoiced (the X marks) are kept in `import_row`. The
      renewal plan's *renewed-until* question is answered from there later
      (§6).

**Rows are never guessed into existence.** Every row that does not fit goes on
the review list (§4), not into the database.

## 3 · Schema changes before the first batch

One migration, at the next free number. It ends with its ledger insert and is
applied to production AND the local copy, then queried.

- `service_agreements.import_batch_id` (FK → `import_batches`) +
  `import_row jsonb`. Migration 110 put them on lines only. The handling doc
  (§4.6) assumed agreements had them too.
- `organization_units.import_batch_id` and `organizations.import_batch_id`,
  so a created department or customer belongs to its batch.
- **`check (import_batch_id is null or monthly_fee is null)` on
  `service_agreements`.** This makes "an imported agreement feeds the fee
  engine" impossible in the database itself, rather than a rule someone has
  to remember (§6).
- Only if D1 is decided as recommended:
    - `service_agreements.kind` (`service` | `gps`, default `service`);
    - `coverage.ts` ignores `gps`;
    - the agreement pages show the kind.

  This can be its own later migration, since it is needed only before a
  customer with 480 kr rows.

## 4 · Matching rules

- **Frames.**
    - Normalise to uppercase with no spaces. That is the script's existing
      `joined` rule.
    - Punctuation inside a frame (`WCK,000458L`, `WCK.000736L` in the 26 Sep
      review) is NOT stripped automatically. It goes on the review list, and
      Dennis corrects it in the spreadsheet.
    - A frame must end in a year letter (G = 2012 … Z = 2026); otherwise it
      is listed.
- **Frames already in the database** (any row, live or deleted, in
  `bikes.frame_number` or in an active frame identifier — the
  `loadUsedFrameNumbers` rule, DECISIONS 2026-09-02):
    - the row is NOT imported, and it is listed.
    - After the pilot this matters: the main batch must skip the pilot's
      frames. A pilot frame that also appears on another customer's sheet (a
      moved bike) goes to review.
- **A frame listed twice in the register**: rule B2. The row with the latest
  delivery date becomes the bike. The other row goes into that bike's
  `import_row` as `also_listed`, and onto the review list.
- **A schedule row matching no fleet-sheet bike.** In the 26 Sep review this
  was a quarter of the schedule.
    - **No bike is invented and no line is written.** It is listed for
      Dennis: he either adds the bike to the customer's sheet, or confirms it
      is gone.
    - This blocks "everything in", not the import mechanism. The spreadsheet
      is retired afterwards, so every one of these rows needs an answer
      before the main batch.
- **Listed for Dennis instead of resolved:**
    - a fleet-sheet bike flagged *aftale: ja* with no schedule row (no line is
      written — the schedule wins for billing, handling doc §3);
    - a 0 kr row on a bike flagged *ja*;
    - a row with a blank price (no line);
    - a lost, stolen or retired bike with a priced row. Do not guess: under
      §7 item 17 a bike that leaves a COMMITTED agreement is still invoiced,
      but imported agreements are untyped;
    - a department with two different EANs;
    - a row with no EAN after the cleanup.
- **Recognition codes.**
    - The same code on two bikes of one customer is listed. It is not unique
      by rule, but in practice it is a typo.
    - A code whose letters disagree with the customer's confirmed prefix is
      listed too.

## 5 · Dry run → review → apply

1. **Parse and plan** (`import_fleet.py plan --customers …`): read the cleaned
   register and production (read-only, `supabase db query --linked "select …"`,
   as `review` does today), and write:
    - the **mapping file** (sheet → customer, department → unit or *new*),
      which Nazar checks and which is committed. It contains department names
      and EANs, no personal data;
    - the **exception lists** (§4);
    - a **manifest**: the exact counts per kind that the batch will create.
2. **Review sheet for Dennis, as a PDF** (CLAUDE.md: anything for a human is a
   PDF). Per customer:
    - departments (matched or new, with EAN);
    - bikes by status;
    - lines (active, active with GPS, ended), with prices;
    - then every exception.

   **Dennis corrects the SPREADSHEET, never the review.** The script re-runs
   until the exceptions are ones he accepts. The spreadsheet stays the single
   source until the batch is applied.
3. **Generate** (`import_fleet.py sql --batch <label>`), three files:
    - the data migration (next free number; ends with its ledger insert);
    - `…-verify.sql` (§7);
    - `…-rollback.sql` (§6).

   **Rows the batch creates get UUIDs generated by the script**, derived from
   the batch label and the source key, and written into the SQL. This departs
   from the customer import's CTE pattern on purpose: the apply file, the
   rollback file and the review sheet must all name the same rows. Unit names
   are not unique (Gentofte's two *Intern service*), so they cannot be the
   key.
4. **Local first.** Apply to the local copy (`docker exec -i
   supabase_db_jensen-fms psql -v ON_ERROR_STOP=1 …`). Then run
   verify, `scripts/audit-invariants.sql` (against its baseline) and `npm run
   smoke`, and click the pilot screens (§7) with a minted session.
5. **Production dry run.** Wrap the migration in a `DO` block that ends in
   `RAISE EXCEPTION`, carrying the manifest's counts. This also proves the
   file is small enough for the Management API: the full batch is roughly a
   thousand bikes with their source rows, and the API's size limit is not
   known. If it is too large, split the batch by customer under the same
   batch row.
6. **Apply to production** with `supabase db query --linked -f …`. **Then
   query it**: run the verify file and `npm run check:prod`. An apply that
   reported no error is not an apply we have seen happen.

## 6 · Safety: nothing bills, and a batch can be undone

**The fee engine** (`src/lib/invoicing/agreement-fees.ts`) bills
`monthly_fee` monthly in arrears, from each agreement's `start_date`, for
agreements that are `active` or `expired`.
- It is **not scheduled**. `vercel.json` has no fee job, so it runs only from
  the fee button on `/invoices`. The `/invoices` page and the dashboard also
  call it to show what is unbilled.
- But an imported agreement starting in 2013 with a fee set would put a dozen
  years of monthly invoices one button press away.
- It only selects `monthly_fee > 0`. So **every imported agreement has
  `monthly_fee` NULL**, and the §3 check constraint makes that permanent.
- The register's price lives on the LINES (`yearly_price`), which nothing
  bills until renewal invoicing is built and switched on (`renewals_from`
  NULL = off, plan-renewal-invoicing decision 2).

**Found while checking, outside this plan.** Production's only agreement is
*"Test agreement"*:
- on customer *Nazar Taras*, `active`, `monthly_fee` 142, started 9 Sep 2026;
- the fee button would draft it today;
- its name lacks the `TEST` marker (CLAUDE.md test-data rule).

Rename it to TEST, or cancel it, before anyone presses that button.

**Renewal invoicing, when it comes**, must not draft years Dennis already
invoiced by hand.
- The switch-over date (`renewals_from`) covers the common case: Dennis
  invoiced every priced line up to the switch-over.
- A line he did NOT invoice for years can only be found from the X marks.
  Those are kept in `import_row`.
- **Whether lines also need a stored *renewed-until* column** (renewal plan,
  phase C) is decided with renewal invoicing. It does not block the import,
  because the data to fill it is kept.

**Rollback by batch** (`…-rollback.sql`, generated with the apply file,
committed under `scripts/`, not applied):
1. **Guards first.** The rollback refuses if any of the batch's bikes or
   lines has a work order, ticket, service order or invoice line, or if any
   batch line has been ended or moved since the import.
    - Once real work hangs on an imported bike, mistakes are fixed forward,
      not rolled back.
    - These foreign keys already refuse the deletes (`work_orders`,
      `maintenance_tickets`, `service_agreement_bikes` NO ACTION;
      `service_order_bikes` RESTRICT). The guards say so with a readable
      message instead of a bare FK error.
2. **Then delete, in this order:**
    - lines of the batch;
    - agreements of the batch;
    - bikes of the batch (identifiers, state log and `bike_parts` cascade);
    - units created by the batch;
    - customers created by the batch.

   Then set back to NULL the fields the batch filled (EANs, codes, prefixes;
   listed by id in the file), and finally delete the batch row.
3. **Dry-run it like any destructive statement**: a `DO` block ending in
   `RAISE EXCEPTION` with the counts, and guards that check the counts equal
   the manifest. Then run it for real and query afterwards.
4. **If a rollback is ever run, it is copied into `/migrations/` at the next
   number** so the ledger tells the truth. The corrected import is then a new
   number with a new batch label.

## 7 · Checking it

**Verify queries** (`…-verify.sql`; each must return the manifest's figure,
or zero offenders):
- counts for the batch, by kind:
    - customers and units created, and fields filled;
    - bikes by status;
    - identifiers by type (active and inactive);
    - agreements;
    - lines by status, and with GPS;
- every batch bike has exactly one active frame identifier equal to
  `bikes.frame_number`, and `frame_number_confirmed`;
- no batch bike is `in_service` without an owner;
- no charger identifier matches the model-code pattern;
- every active batch line has price + currency, `start_date` ≤ today, and its
  bike's owner = the agreement's customer (and department, where set);
- no batch agreement has a `monthly_fee`;
- every unit used by the batch's agreements has an EAN (or is on the
  exception list);
- `scripts/audit-invariants.sql` matches its STATUS baseline;
- `npm run check:prod` reports nothing missing.

**The pilot in the app.** Production sessions cannot be minted from this
machine, so a person clicks. Nazar and Dennis together, at the Tuesday 13 Oct
check-in if the timing holds:

1. ***Imported bikes*** (`/bikes?origin=imported`), filtered to the
   municipality: the count equals the review sheet, and the statuses match.
2. **The customer page**:
    - its departments, each with its EAN;
    - one agreement per department;
    - the prefix, if confirmed.
3. **Each agreement page**:
    - active lines at 1 704 / 2 184 kr (GPS marked);
    - start dates = delivery dates;
    - ended lines with reason *ended* and no date.
4. **Three bikes Dennis picks at random from his spreadsheet** — the bike
   page shows:
    - frame, recognition code, battery, charger, lock;
    - customer and department;
    - *covered* or not.

   Dennis compares each bike's anniversary month and price with the month
   sheet.
5. **As Finn (Workshop)**:
    - `/work` search by code (*ALK05*) and by frame finds the bike, with no
      prices shown;
    - the assistant: "show me bike ALK05".

   Creating a real work order waits until after sign-off, because it blocks
   rollback.
6. **`/invoices` and the dashboard**: no new fee drafts and no new "unbilled"
   amount. The dashboard's *bikes under agreement* history rises, which is
   expected (it counts lines).

**Sign-off is Dennis's**: "this municipality is right". Only then is the main
batch generated.

## 8 · Open decisions

**D1 · GPS-only subscriptions (owner — blocks customers with 480 kr rows).**
Today every line hangs on a service agreement, and an active line makes the
bike *covered*. A GPS-only bike must be invoiced 480 kr a year and must NOT
be covered.
- **Recommendation on the table (7 Oct): an agreement-level `kind`** —
  `service` | `gps`. A GPS-only bike gets a line on a `gps` agreement, and
  coverage ignores `gps` agreements.
- New finding: the register's separate sheet *GPS ABONNOMENTER UDEN SERVICE*
  is keyed by **battery number** (plus GPS phone, IMEI, SIM, EAN), not by
  frame. Its rows reach a bike only through a battery identifier. A
  subscription whose battery is on no known bike cannot be a line at all.
- The model must say what happens to those rows. Recommendation: list them
  for Dennis, and import only the ones that resolve to a bike.
- Today `import_fleet.py` skips that sheet entirely.

**D2 · A department that already exists as its own customer (owner — blocks
the municipalities where it happens).**
- The e-conomic customer import made some departments standalone customers
  rather than units: 31 municipality-segment customers with no units of their
  own and an e-conomic number (8 Oct). Example: *Herlev Hjemmepleje*, #25,
  which is the customer on renewal invoice 7114. *Herlev Kommune* meanwhile
  has nine units.
- The import wants each department as a unit under its municipality. But the
  e-conomic number that renewals must reuse (renewal plan, phase B) sits on
  the standalone customer.
- **Recommendation:** where the standalone customer has no transactions,
  convert it into a unit of its municipality, as an explicit per-case step in
  the review:
    - move its `external_customer_no` onto the unit (the two share e-conomic's
      debtor numbering, so the unit index stays unique);
    - soft-delete the customer with a note.

  Where it has transactions, leave it, and list it.
- **Rejected:** the import silently creating a second, number-less unit beside
  the standalone customer. That splits one department's bikes, agreement and
  invoices across two records.

**D3 · The pilot municipality (Nazar).** Candidates in §1.

**D4 · An agreement with only ended lines (dev call; owner may override).**
Import it as `expired` rather than `active`. Nothing on it covers or bills
either way, but `active` with no active line reads as a live contract on the
agreements list.

**D5 · Bike type for old models (dev call, shown in the review).** E-bike when
a battery number is present, else pedal. Old model names (V1–V8, Svajer V4/V6)
stay text in `import_row` (rule B5).
- Side effect: an imported e-bike shows its required-identifier progress
  (e.g. 3/5), because the e-bike type requires more identifiers than the
  register holds. Cosmetic, and true.

**D6 · Customers created by the import** (Dennis, fleet letter A): KL, Aleris,
and whether WOLT's bikes belong to Two Wheel Company. Created only on his word.

## 9 · Order of work

Dates are targets inside the week of 12 Oct. Effort is shown as
`~human-dev-min (wait)`.

| When | Step | Who | Effort |
|---|---|---|---|
| Thu 8 – Fri 9 Oct | D1, D2, D3 decided; rename or cancel the production *Test agreement* | owner | — |
| Thu 8 – Fri 9 Oct | §3 schema migration, applied to both databases and queried | dev | ~60 (5) |
| Thu 8 – Fri 9 Oct | `plan` + `sql` + verify + rollback generators, built against the old register | dev | ~420 (30) |
| on arrival (Fri 9 / Mon 12) | Re-profile the parser on the cleaned file (labels, joined vs split frames, dates Copilot may have turned into text); pilot review PDF | dev | ~120 (15) |
| Mon 12 Oct | Dennis checks the pilot review; local dry run (§5.4) | Dennis, dev | ~60 (20) |
| Tue 13 Oct | Production dry run, apply, verify; pilot click-through together (§7) | dev, Nazar, Dennis | ~60 (45) |
| Tue 13 – Wed 14 Oct | Main-batch review PDF; Dennis answers B5–B8 and the exception lists | dev, Dennis | ~90 (on Dennis) |
| Thu 15 Oct | Main batch: local, production dry run, apply, verify; GPS-only step if D1 is built | dev | ~120 (30) |
| Fri 16 Oct | Dennis spot-checks in the app; spreadsheet frozen; STATUS rewritten | Dennis, dev | ~30 |

**Total dev: ~960 human-dev-min.** Add ~120 if D1's `kind` is built in the same
week. **The critical path is Dennis**: the cleaned file (B1), and answers to
B5–B8 plus the exception lists before Thursday. A customer still unanswered on
Thursday stays out of the main batch and goes in as a small follow-up batch. It
is not guessed in to meet the date.

**After the import, not in it:**
- renewal invoicing (its own plan, on hold until the data is checked);
- the signed papers, uploaded and confirmed onto the imported agreements
  (`confirmAgreementDocument` skips bikes already on the chosen agreement);
- the contact list (a separate Dennis task);
- department addresses;
- a visible "imported from row N" on the bike page (optional: `import_row` is
  stored but no screen shows it).

# Service agreements — getting the existing ones in, and handling them after

**27 September 2026, from the FMS build.** How Jensen's existing service
agreements get into the system alongside the bikes, whatever form they are in
today (a spreadsheet row, a signed scan, a filled-in Word file, a verbal
promise), and how the system handles them from then on. It builds on the
modelling brief `BRIEF-SERVICE-AGREEMENTS-2026-09` (agreements are per bike, not
per customer). Read that one for the data model. This one is about the **sources
and the import**, and it corrects the brief on price and terms. Nothing here is
built yet.

## 1 · What has been said and decided so far

**The 15 September meeting with Dennis (02:33–02:45):**

- About 99 % of customers want an agreement. It is settled in the offer or the
  sales order, and sent after the build, once the frame numbers exist.
- Contract types **K1 / K3 / K5 / K10** (years). GPS bikes are signed for at
  least three years.
- *"I have a lot of service agreements, and I have maybe a handful signed."* The
  rest are verbal, worth hundreds of thousands of kroner a year, and **live in
  the spreadsheet**, which "has to come into the system" because the yearly
  invoicing runs from it.
- Renewals are invoiced **12 months ahead, a month before the anniversary**, and
  renew unless cancelled.
- Signing today: PDF → print → sign → scan → email. Dennis wants digital signing
  "for the future".
- The system should give each agreement a number. Dennis said he had sent the
  written agreement text.

**What the system has today.** One agreement per *customer*. Coverage comes
from who owns the bike, and the fee is billed monthly in arrears (DECISIONS
2026-06). It was generated early and never discussed with Dennis. Production
holds one test agreement, so changing it costs nothing yet.

**The 27 September brief (not yet decided).** An agreement is the document, and
each covered bike is a line on it with its own start date and price. Coverage
means the bike has an active line. Renewal invoices are drafted per customer ×
department EAN × month. The register's twelve month sheets (867 rows) become
the lines. **Paper was never designed for**: the only step was asking Dennis for
the text and for scans of the signed agreements (question C10).

**What already exists to build on.**

- The fleet import's **review step** (`scripts/import_fleet.py review`), which
  already parses the renewal schedule.
- **Provenance on imported rows** (`import_batch_id` + `import_row`, migration
  102).
- A generic **attachments** table, not yet used for agreements.
- The **inbound pipeline's rule**: a model extracts, code matches
  deterministically, a person reviews, and nothing is written unseen.

## 2 · What we found in Dennis's files

In `Documents/1-Projects/Jensen/`, received 7 June and not read until now:

- **`Kommuneservice - final_v10_10år.dotx`**, the agreement for municipalities.
- **`Virksomheder - final_v7 1.docx`**, the agreement for companies.
- **`Extension of service agreement/…pdf`**. The yearly "extension" is not a
  contract. It is an **e-conomic invoice** (no. 7114, Herlev Hjemmepleje):
    - two frame numbers in the text;
    - product `JP-SERVFL` "Forlængelse af serviceaftale(r)", 2 × 1 704 kr, for
      13-05-26 to 13-05-27;
    - the department's EAN, and 30 days to pay.

What the templates say, and what it changes:

| Topic | Municipal template | Company template | Consequence |
|---|---|---|---|
| Term | 10 years | 3 years fixed, extendable to 5 from purchase, then yearly at Jensen's discretion | K10 / K3 / K5 / K1 are real, and they differ by customer kind |
| Price | Per bike per month: **142 kr in year 1, 152 kr in years 2–5, 162 kr in years 6–10**, paid yearly in advance | *xxx kr* for the first 3 years, then *xxx kr* per year | The price **steps with the bike's age**; a single frozen price per line (the brief) is not enough |
| Bike leaves (stolen, retired) | Moves to a replacement bike; if not replaced, **the remaining years are invoiced up front** | Moves to a replacement; if not replaced, **the rest of the period is settled** | Answers most of questions C6 and C7 to Dennis |
| Cancelling | In writing, 1 month's notice before a payment date | Same | Cancelling stops the *next* renewal, not the current year |
| GPS | Minimum 3 years, then continues until cancelled | Same | A line with GPS has its own binding end |
| What is covered | Punctures, tyres, tubes, chains, sprockets, bottom bracket, pedals, stand and other wear parts; e-bike motor / display / controller for 2 years; pick-up and return; labour | Same; battery warranty 2 years, not extendable unless agreed | This is the "covered or invoiced" rule for Finn's repairs |
| Not covered | Vandalism, self-inflicted damage (battery misuse, cables after a fall), missing own maintenance (air, chain oil) | Same | |
| Drive charge | *xxx kr* per visit inside the municipality, *xx kr* outside | Not in the template | A per-customer figure the system needs |
| Bikes listed | A table: make, type, **frame number** | Same | **The frame number is the key between a document and a bike** |

**But the spreadsheet does not follow the stepped price.** Of the 867 renewal
rows, 338 charge 1 704 kr (the year-1 price) and only 3 charge 1 824 kr (the
year-2-to-5 price), although most bikes are well past their first year. So
either the steps are not applied in practice, or older agreements used an older
template. **Dennis has to say which** (§7); until then the import takes the
spreadsheet's price as this year's price and assumes no steps.

## 3 · The principle: three sources, one job each

| Source | It decides | It does NOT decide | How it enters |
|---|---|---|---|
| **The register's month sheets** | *What we bill*: which bike, its anniversary, this year's price, the EAN | Contract type, terms, who signed | A generated data migration, like the bikes (§4) |
| **The documents** (signed scans, filled-in Word or PDF files) | *The terms*: contract type, term, price steps, drive charge, signed date and signatories, contact person | Which bikes we bill this year | Attached to the agreement; a proposal is extracted and a person confirms it (§5) |
| **e-conomic's invoice history** (`JP-SERVFL` lines) | *Proof* of what was actually renewed, and at what price | Anything, on its own | Read-only cross-check (§5) |

**When they disagree:** the spreadsheet wins for what is billed, the document
wins for the terms, and every disagreement is **listed for Dennis, never
resolved silently**. That is the same rule as the fleet import: unmatched rows
become review lists, not guesses.

Consequence: **billing can go live from the spreadsheet without waiting for a
single scan.** If only a handful of agreements are signed, the documents are
evidence, not data. If Dennis has more than he remembers, step 5 grows without
touching the others.

## 4 · Importing the agreements from the spreadsheet

Order: **bikes first**, then the agreement model, then this import.

1. **Group** the schedule rows into agreements: one per customer × department
   EAN (a municipality with five departments gets five agreements, because each
   is invoiced to its own EAN). Rows with a blank EAN (141 of 867) go under the
   customer, and are listed for Dennis.
2. **Match each row to a bike by frame number.** 656 rows match a bike in the
   fleet sheets; 211 do not. An unmatched row becomes no line: it goes on a list.
   It may be a bike the fleet sheets are missing, and inventing the bike would
   put a guess into the fleet.
3. **Each matched row becomes a line**:
    - start date = the purchase or delivery date, which sets the anniversary;
    - this year's price, from the row;
    - GPS when the price or the flag says so;
    - the years already invoiced (the X marks) kept as history.
4. **Every imported agreement is `active` and `verbal`** until a document is
   attached, with its contract type *unknown*. The contract type is not
   guessed from the price.
5. **0-kr rows (311) are imported but never invoiced** until Dennis answers what
   0 means (question C2).
6. **Provenance:** agreements and lines carry `import_batch_id` and
   `import_row`, the same columns as imported bikes. "Imported" is a column
   rather than a note, and a bad batch can be found and undone.
7. The load is a numbered migration generated from the reviewed files, applied
   to production and the local copy and then queried. The same route as the
   bikes.

## 5 · Documents: attach, extract, reconcile

Not blocking billing; done agreement by agreement, as documents turn up.

1. **Attach.** On an agreement's page, *Add document*: upload a PDF, a Word
   file, or phone photos of the pages. Stored as an attachment, never discarded.
   The signed paper is the legal record.
2. **Extract.** The system reads the document into a **proposal**: parties,
   contract type and term, price steps, first payment date, drive charge,
   signed date, signatories, contact person, and **the frame numbers listed**.
    - A Word file is plain text.
    - A scan or photo needs a model that reads images. It uses the
      extraction-provider setting the inbound pipeline already has, so there is
      no second place to configure it.
3. **Reconcile.** Code, not the model, compares the proposal with the
   agreement:
    - frames on the paper but not billed;
    - frames billed but not on the paper;
    - a price or term that differs.
4. **Confirm.** Dennis accepts or corrects field by field, and the agreement
   becomes `signed` with the date and signatories. **The model never writes a
   line or a price on its own**, the same rule as calls in the inbox.
5. **e-conomic cross-check.** Read the past `JP-SERVFL` invoices:
    - they name the frames and the period, so they show which bikes were really
      renewed, and at what price;
    - run it once before the first renewal run, as a before-and-after check.
    - **Blocker:** the system still holds only e-conomic's *trial* grant, so the
      production grant has to be in place first.

**Build it in proportion.** If there are a handful of signed documents, steps
1 and 4 are enough (attach, and type the terms in by hand). Extraction (step 2)
is worth building only if there are dozens. §7 decides which.

## 6 · Handling after import

- **New agreements** are born from the offer or the sales order (*wants service
  agreement*). They are pre-filled with what is known, sent after the build once
  frame numbers exist, and the document is generated from Dennis's text rather
  than a Word template. Signing stays print-and-scan until digital signing is
  chosen; the signed scan is attached as in §5.
- **Renewal**:
    - a month before each line's anniversary, the system drafts the invoice:
      one per customer × EAN × month, one line per bike, the period on the line;
    - the price is this year's step, frozen on the invoice line;
    - 30 days to pay, as the real invoices say, **not** the app's net 14;
    - Dennis approves, and it goes to e-conomic.
- **A bike leaves** (stolen, retired, cancelled): the line ends with a reason
  and date. The contract's rule applies: move it to a replacement bike, or
  settle the remaining term (municipal: remaining years up front). Nothing is
  credited automatically.
- **Cancelling** takes effect at the next payment date after a month's notice.
  The current year stays paid.
- **Repairs:** coverage is "the bike has an active line". What is covered is the
  contract's list (§2); everything else, and the drive charge, is invoiced.

## 7 · To find out (Nazar)

1. **How many** agreements exist as documents, and how many are verbal only?
2. **Which format:** filled-in Word or PDF, scanned signed paper, or paper in a
   folder?
3. Does each document **list frame numbers**, or only "N bikes"?
4. **Is the stepped price applied?** The spreadsheet says mostly not. Is 1 704
   kr the real price for all years on older agreements?
5. **Which template version** did older agreements use (the text says
   *Servicebetingelser juni 2013*)?
6. Can we get **e-conomic's production grant** so the invoice history can be
   read?
7. Is the register or John's Trello export the source (already question C1)?

## 8 · Sequence and decisions

1. **Decide the model** (the brief), amended here with price steps per bike age,
   the bike-leaves settlement rule, and the GPS binding. DECISIONS entry;
   CLAUDE.md rule edited in the same commit.
2. **Import the bikes** (after Dennis's fleet answers).
3. **Import the agreements from the spreadsheet** (§4). Billing truth in place.
4. **Renewal invoicing**, checked against e-conomic's history on its first run.
5. **Documents** (§5), sized by the answers in §7.
6. **New agreements from the sales order**, then digital signing.

**Rejected:**

- *Documents as the source of the lines.* Most agreements have none, and
  billing would wait on paperwork that does not exist.
- *Extraction writing directly.* A misread price is an invoice to a
  municipality.
- *Guessing the contract type from the price.* The prices do not follow the
  template.
- *Waiting to import until the documents are gathered.* The money runs from the
  spreadsheet today.

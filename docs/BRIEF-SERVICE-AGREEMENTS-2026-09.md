# Service agreements — a modelling decision for the planning chat

**27 September 2026, from the FMS build.** The app models service agreements per
*customer*; Jensen sells, covers and bills them per *bike*. This decides the
shape before the fleet register (~926 bikes, ~867 renewal rows) is loaded into
it. Nothing real is stored in the current model yet — production holds one test
agreement and no agreement invoices — so the change is free now and expensive
after the import.

## Why it matters

- **Money.** The municipal service contracts pay about half of Jensen's running
  costs (Dennis, 15 Sep, 00:07). Renewals — hundreds of thousands of kroner a
  year — are invoiced by hand from a spreadsheet. Go-live target: 1 January.
- **It unblocks three things:** importing the agreements from the register,
  automatic renewal invoicing, and "covered or not" on repairs (Finn's work).

## How it works in reality

From the 15 Sep meeting (02:33–02:45) and the register's monthly sheets:

- **Coverage is per bike.** In one department some bikes are covered and some
  are not. ~99 % of customers want an agreement; it is settled in the offer or
  the sales order, and sent after the build once frame numbers exist.
- **Each bike renews on the anniversary of its own delivery**, invoiced **12
  months ahead, a month before the anniversary** (customers pay at 30 days).
  It renews unless cancelled — even on one-year contracts. Stolen or retired
  bikes drop out.
- **Price per bike per year:** 1 704 kr (= 142 kr × 12) is the standard;
  2 184 kr with GPS (+480). The register also has 2 284, 2 160, 1 200, 480 and
  a long tail — and **311 rows at 0 kr**, mostly bikes bought 2012–2017
  (meaning not yet known).
- **Contract types K1 / K3 / K5 / K10** (years), priced differently; K3 exists
  because GPS bikes must be signed for three years.
- **Mostly verbal.** "A handful" are signed; the rest live in the spreadsheet.
  Each year Dennis sends an "extension of service agreement". Signing today is
  print, sign, scan, email.
- **Public customers are invoiced per department EAN** (the register carries an
  EAN per row; 141 of 867 are blank).
- **The register's renewal schedule:** 12 monthly sheets, 867 rows — bike,
  customer, purchase date, the years already invoiced (years 2–4 marked X),
  yearly price. 656 rows match a bike in the fleet sheets; 211 do not. The
  fleet sheets' own yes/no flag disagrees with it for ~130 bikes; the schedule
  is what gets billed.

## What the app models today

- `service_agreements` belongs to a **customer**, optionally one department:
  name, `start_date` / `end_date`, `status` (active / expired / cancelled),
  `monthly_fee`, `has_gps`, `covers_parts` / `covers_labor`.
- **Coverage is derived from ownership** (`src/lib/agreements/coverage.ts`): a
  bike is covered if its owner (or owner department) has an active agreement.
  It cannot say "this bike, not that one", nor give two bikes different start
  dates or prices.
- **The fee engine bills monthly in arrears**, pro-rated by days, one invoice
  per customer (DECISIONS 2026-06). Reality is yearly in advance per bike.
- A work order stamps the covering agreement at creation
  (`covered_by_service_agreement_id`), which decides what is billable.
- It was generated early and never discussed with Dennis (02:36: "this is
  what the computer came up with").

## Proposal

**An agreement is the document; each covered bike is a line on it.**

- **`service_agreements` — the agreement with a customer:** a number (`SA-`
  series; Dennis asked for one), customer + optional department, contract type
  (K1/K3/K5/K10), covers parts / labour, status **draft → sent → active →
  cancelled**, who signs, the agreement text, an optional link to the sales
  order that created it, notes. Verbal agreements are the same row with no
  signature.
- **`service_agreement_bikes` — one line per bike:** bike, start date (the
  delivery date, which sets the anniversary), yearly price (amount + currency,
  frozen on the line), GPS add-on, status **active → ended** with a reason
  (stolen, retired, cancelled, moved) and a date. **A bike is on at most one
  active line.**
- **Coverage = the bike has an active line on an active agreement.** One
  resolver replaces today's ownership rule; a work order stamps the line, so
  history keeps what covered it.
- **Renewal invoicing:** each line's next anniversary is known. A month before,
  the system drafts invoices for the lines renewing — **one invoice per customer
  per department EAN per month**, one line per bike, the 12-month period on the
  line, the price frozen. Dennis approves, it goes to e-conomic. An invoice line
  points at the agreement line, which is what makes re-running it idempotent.
  **This supersedes "monthly in arrears, pro-rated" (DECISIONS 2026-06).**
- **Import:** the 867 schedule rows become lines, grouped into one agreement per
  customer (per department where the register says so), status active,
  verbal. The fleet sheets load first; unmatched schedule rows are listed for
  Dennis, not guessed.

**Rejected:** a flag or agreement id on the bike (loses per-year history, start
date and price); one agreement per bike (hundreds of documents for what Dennis
signs, extends and invoices per customer); keeping per-customer agreements with
an exclusion list (cannot hold different anniversaries or prices).

## To decide here

1. **The shape above** — agreement + bike lines — or an alternative.
2. **Billing policy:** yearly in advance per bike anniversary, grouped by
   customer × EAN × month, replacing the June arrears rule.
3. **Term vs renewal:** is K1/K3/K5/K10 a *binding period* (no cancellation
   before it ends) with yearly renewal after it, or does each term renew as a
   whole? Where do the K-type prices live — a small price list (vocabulary),
   with the line freezing the price at signing?
4. **Cancelling part of a fleet:** can one bike leave mid-year, and is anything
   credited? (The ledger rule today: corrections are full credit notes.)
5. **Replaced or moved bikes** (the register lists 32 frames twice): does the
   line move to the replacement bike, or end and start anew?
6. **Sequence:** bikes first, then this model, then the agreement import, then
   renewal invoicing — or ship renewal drafting before the full UI?

## Needed from Dennis (Tuesday 29 Sep)

- What a yearly price of **0** means (free years, ended, included in the sale?).
- Each customer's contract type; the written agreement text.
- Payment terms for renewals — ~30 days, not the app's net 14?
- Whether the register or the Trello export John is cleaning is the source.

## Out of scope for this decision

Digital signing (today it is a PDF; the person signing at delivery usually may
not sign contracts), the repair flow under an agreement (parts logged at value,
deferred by Dennis to the next session), and the "wants service contract" tick
on the sales order — which follows naturally once the shape is chosen.

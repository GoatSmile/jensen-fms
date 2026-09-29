# Plan — renewal invoicing for service agreements

**29 September 2026. Status: plan, waiting for go-ahead.** Builds on migration
110 (agreements per bike) and `SERVICE-AGREEMENTS-HANDLING-2026-09` §6. Nothing
here is built.

## What it must do

Each covered bike renews on the anniversary of its start date (its line's
`start_date`), **invoiced 12 months ahead, a month before the anniversary**, and
renews unless the line has ended. Today Dennis does this by hand from the
register's twelve month sheets. The real thing looks like e-conomic invoice
7114:
- product `JP-SERVFL` "Forlængelse af serviceaftale(r)";
- the frame numbers and the 12-month period on the invoice;
- 1 704 kr per bike;
- the **department's EAN**, and 30 days to pay.

**The rule:**
- **When:** on the 1st of each month, the system drafts the renewals for every
  anniversary in the **next** month. That is Dennis's month-sheet rhythm, so
  December's anniversaries are drafted on 1 November.
- **How it is grouped:** one draft invoice per customer × department EAN, one
  line per bike, each line carrying its own period (anniversary →
  day before the next).
- **Price:** the line's frozen yearly price.
- **Payment:** 30 days.
- **Who acts:** Dennis reviews, issues and sends. Nothing is issued by itself.

## Decisions needed before building

1. **How does a renewal reach a municipality? (owner, planning chat)** This is
   the one real conflict.
    - Public customers must receive e-invoices by EAN (NemHandel). Today
      e-conomic sends them, because Dennis makes them there as invoices.
    - The FMS pushes issued invoices to e-conomic as **journal vouchers**
      (DECISIONS 2026-07-09: the FMS owns the INV number series). A voucher is
      a booking, not a document, so e-conomic cannot send it by EAN.
    - The same gap exists for every FMS invoice to a public customer. Renewals
      only make it urgent, because they are most of them.
    - Options:
        - **a) Renewals go to e-conomic as draft INVOICES** (product
          `JP-SERVFL`, the department's EAN), and e-conomic books and sends
          them. E-conomic's number is then the customer-facing one for this
          kind, and the FMS keeps its draft as the record. Cheapest route to
          "sent by EAN", but it forks the number series for one invoice kind.
        - **b) The FMS sends OIOUBL itself** through a NemHandel access point
          (a provider, a registration, a new outbound adapter). Keeps one
          number series; clearly the biggest job.
        - **c) The FMS drafts, and Dennis re-keys in e-conomic**, as today but
          from a list. No integration; the manual step stays.
    - **Recommendation:** start with (c), because the list alone removes the
      spreadsheet work. Decide (a) or (b) before 1 January. Phase A below is the
      same whichever is chosen.
2. **The switch-over month (Dennis).** From which month the system drafts
   instead of the spreadsheet. Until it is set, the job does nothing, so the
   same month is never invoiced twice.
3. **Retire the monthly-fee engine now (owner).** Recommended. It bills
   `service_agreements.monthly_fee` monthly in arrears, which DECISIONS
   2026-09-29 already says renewals replace, and production has no fee
   invoices. Keeping both means two engines that can each bill the same bike.
4. **Bikes with no EAN (Dennis).** 141 register rows have none. Recommended:
   invoice them to the customer's own EAN and list them for him.
5. **The invoice text (Dennis).** Recommended: copy invoice 7114 word for word,
   with the frame number and the period on each line.

## Phase A — buildable now

**Data (migration 111)**
- `invoices.kind` gains `renewal`.
- `invoices.organization_unit_id`: the department the invoice is for. At issue
  the EAN becomes `COALESCE(unit.ean, org.ean)`, for **all** invoices; today
  only the customer's EAN is ever used, and nothing reads the department's.
- `invoices.payment_terms_days`: frozen on the draft (30 for renewals). The due
  date at issue = issue date + this, else the customer's terms.
- `invoice_lines.service_agreement_bike_id`, next to the existing
  `service_agreement_id` + `billing_period_start/end`.
- `app_settings.renewals_from` (the switch-over date; NULL means the job is
  off) and `renewal_payment_terms_days` (30). Operational config goes on
  `/admin/settings`, config doctrine tier 2.
- An RPC `insert_renewal_invoice(payload)` writes one draft and its lines in
  one transaction. Under a lock it re-checks that no line is already billed
  for that period, so the job and *Run now* running at the same moment cannot
  double-bill.

**The engine**
- A pure planner, `src/lib/service-agreements/renewals.ts`. For each active
  line it works out the next anniversary after what is already billed, and
  keeps the ones that:
    - fall in the target month;
    - fall on or after `renewals_from`;
    - are not ended before the anniversary.

  It then groups them into customer × EAN drafts.
- **"Already billed" = the latest `billing_period_end` for that bike line on a
  live invoice.** Cancelled and credited invoices and credit-note mirror lines
  are ignored, the same guard the fee engine uses. Cancelling a draft
  therefore frees its bikes to be drafted again.
- **Never drafted, but listed for Dennis:**
    - a line with no yearly price (the backfilled ones, and the register's
      blank-price rows);
    - a bike with no EAN anywhere;
    - a price of 0 kr.
- **The drafting code**, `src/lib/invoicing/renewal-drafts.ts`, takes a
  Supabase client and is shared by the button and the job, so it can run from
  cron. The current fee action cannot: it uses the session client.

**Running it**
- A daily job `draft-renewals` (`JOBS` entry, a thin route, a `vercel.json`
  line). It acts only on the 1st, and it is safe to run twice.
- *Run now* on `/admin/jobs`, and *Draft renewals now* on `/invoices`.
- A notice to Dennis, `renewals.drafted`: "N renewal drafts for December,
  M bikes, X kr; K bikes need a price or an EAN".

**Screens**
- `/invoices` → a **Renewals** section, replacing the fee section:
    - next month's due renewals per customer × EAN (bikes, total);
    - the drafts made;
    - the problem list.
- **The invoice page and print** show the department, the EAN used and each
  line's period, with the heading "Forlængelse af serviceaftale".
- **The agreement page:** each bike line shows *renewed until* and *next
  renewal*.
- **The customer page:** a department's EAN becomes editable in the
  departments section. Today nothing edits `organization_units.ean_number`.
- **Dashboard:** "uninvoiced" counts renewals due next month instead of
  unbilled monthly fees.

**Changing a bike after a draft exists:** end the line, cancel the draft, then
run again. Draft invoice lines stay non-editable, as they are today.

**Retired (if decision 3 is yes):**
- `agreement-fees.ts`, `create-agreement-fee-invoices.ts` and the fee button;
- `findAgreementMonthlyFees`;
- the *Monthly fee* field and column on agreements.

The columns stay, so the change can be reversed.

**Checks**
- A new invariant in `scripts/audit-invariants.sql`: no bike line on two live
  invoices with overlapping periods.
- `npm run smoke`.
- Local run-through:
    - draft a month;
    - run it twice, which must add nothing;
    - cancel a draft and re-run;
    - end a line and re-run;
    - issue a draft and check its due date and EAN.

## Phase B — delivery (after decision 1)

- (a) or (b) from decision 1.
- Whichever it is: the e-conomic push must use the customer numbers that
  **already exist** in e-conomic (`external_customer_no` on the customer and on
  the department). Today it ignores them and creates a new customer on first
  push, which would duplicate every existing customer, and there is no customer
  per department. This has to be fixed before any production push, renewals or
  not.
- The production e-conomic grant (still trial).

## Phase C — the register's agreements (separate)

The import in the handling document §4. Two points matter here:
- every imported line needs a **renewed-until** date, taken from the register
  (the last year invoiced);
- `renewals_from` must be at least the switch-over month.

Without both, the first run would draft years that Dennis already invoiced by
hand.

## Files (phase A)

| Area | Files |
|---|---|
| Migration | `migrations/111_renewal_invoicing.sql` |
| Engine | `src/lib/service-agreements/renewals.ts` (pure), `src/lib/invoicing/renewal-drafts.ts`, `src/lib/invoicing/settings.ts` |
| Job + notice | `src/lib/cron/jobs.ts`, `src/app/api/cron/draft-renewals/route.ts`, `vercel.json`, `src/lib/people/notifications.ts`, `src/lib/people/email-content.ts` |
| Invoices | `src/app/invoices/page.tsx`, `_components/renewals-section.tsx`, `_actions/draft-renewals.ts`, `_actions/transition-invoice.ts`, `[id]/page.tsx`, `[id]/print/page.tsx` |
| Agreements | `src/app/service-agreements/[id]/_components/agreement-bikes-panel.tsx` + its page |
| Customers | `src/app/organizations/[id]/_components/units-section.tsx` (+ its dialog and action) |
| Settings | the `/admin/settings` invoicing card |
| Dashboard | `src/lib/dashboard/queries.ts`, `src/app/page.tsx` |
| Retire | `src/lib/invoicing/agreement-fees.ts`, `src/app/invoices/_actions/create-agreement-fee-invoices.ts`, `_components/draft-fee-invoices-button.tsx`, `src/lib/invoicing/uninvoiced.ts`, the agreement form + list |
| Other | `scripts/audit-invariants.sql`, `messages/{en,da}.json`, `src/lib/types/database.ts`, DECISIONS + CLAUDE.md |

**Estimate, phase A:** ~600 human-dev-min (~60 min wait).

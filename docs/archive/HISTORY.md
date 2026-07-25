# Shipped-work history (curated)

Extracted from `CLAUDE.md` on 2026-07-23 during the docs restructure (see
`docs/DECISIONS.md`, entry 2026-07-23). Nothing here is needed to act —
durable rules live in `CLAUDE.md`, current state in `docs/STATUS.md`. This
file preserves the narrative record: what shipped when, how, and with which
commits. Sections are chronological. `git log` and `docs/WORKLOG.md` hold
the finer grain.

_Renamed from `shipped-history.md` on 2026-07-25 to match the docs scheme now
shared with Munin (see `docs/DECISIONS.md`, entry 2026-07-25). Worklog rows
written before that date refer to it by the old name._

---

## May 2026 — v0 → v0.9

Built in ~7 working days (see WORKLOG for the day-by-day): Parts +
categories + inventory ledger, Suppliers (CRUD + multi-supplier offerings),
Purchase orders + landed cost (FX, transport, HS/TARIC tariff, anti-dumping
— all additive & frozen-at-purchase), Bike templates, Manufacturing orders +
per-bike build workbench, Bikes + lifecycle + QR, Paint orders, Sales orders
(3C) + slating automation, Organizations + contacts + units + customer map
(geocoded), Maintenance tickets + Work orders, Workshop floor technician
view (M3d, with voice-to-text), public customer report flow, PWA, admin
section (HS codes, FX rates, colours, customer segments, suppliers,
settings).

## June 2026 — MO overhaul session (commits f1b437b…27ca92f)

Technician add-parts page (`/work/<wo>/parts`, kit shortcut, retail-only
enforcement on tech screens); MO module overhauled for bulk — batch creation
screen (template cards, sibling MOs, auto-created bikes), stock coverage on
creation + MO detail, one-click draft POs from shortfall (per-supplier, full
landed-cost snapshots via `src/lib/purchasing/po-snapshots.ts`), shared
green-checklist recipe builder (`src/components/recipe/`) powering both
template and MO editors incl. kit bulk-add, bikes section at 100-bike scale
(progress strip, status filters, mark-next-N). Follow-up fine-tunes: ticket
picker + `save-ticket.ts` block `planning`/`building` bikes (build defects
belong on the build workbench); reorder-point banner on `/parts` with
one-click per-supplier draft POs — the demand→draft-PO engine is shared in
`src/lib/purchasing/draft-pos.ts` (MO shortfall + reorder both use it); SO
spawn-MO aligned with the batch screen (`mo_copy_template_parts` RPC +
`bulkAddBikesToMO`, so spawned bikes inherit the SO slate past draft).

## June 2026 — Invoicing (3D), slices 1–5

Schema was verified ready before starting (per-line VAT snapshots,
`language`, `issued_locked_at`, `is_reverse_charge`/`is_export`,
`ean_number_used`, `economic_*` columns; `work_orders.invoice_id` already
existed, service-agreements CRUD already built).
1. **"Uninvoiced work" list** — `/invoices` shows uninvoiced WOs (parts at
   retail + labor, minus agreement-covered buckets), delivered SOs,
   agreement monthly fees; queries in `src/lib/invoicing/uninvoiced.ts`.
2. **Invoice from WO** — one-click draft (`create-from-wo.ts`), respecting
   `is_billable` / `covers_parts` / `covers_labor`; VAT snapshot from
   `DK_STANDARD`. Drafts carry `DRAFT-xxxx`; the INV number is allocated at
   issue (`issueInvoice` — lock + due date). Cancelling a draft releases
   its WOs back to the uninvoiced list.
3. **Invoice from SO** — `create-from-so.ts`: lines copy from SO lines (VAT
   snapshots preserved, template+colour / part+SKU fallback), frame numbers
   of bikes built under the line's MOs appended bilingually.
4. **Print/PDF bilingual layout** — `/invoices/<id>/print` (browser
   print-to-PDF): labels da/en per `invoices.language`, seller block from
   `src/lib/invoicing/company.ts` (placeholders — warning shown until owner
   fills), customer address + CVR + EAN, UDKAST/DRAFT watermark.
   `issueInvoice` snapshots `ean_number` → `ean_number_used` and per-org
   `payment_terms_days`.
5. **Recurring agreement fees + credit notes** — engine in
   `src/lib/invoicing/agreement-fees.ts`; "billed through" = max
   `billing_period_end` over live fee lines (migration 37), so re-running
   never double-bills and crediting a fee invoice makes its months billable
   again. Expired (not cancelled) agreements still bill unbilled months.
   Credit notes: one click on an issued/paid invoice → negative-mirror
   draft; own `CRE-yyyy-xxxx` series at issue; original flips to
   `credited`; WOs/SO return to the uninvoiced pool. Print renders
   "Kreditnota" with a reference to the original.

## Dennis app-review backlog (call 2026-06-19)

84-min call; each item verified against live code before sequencing. Locked
decisions recorded in `docs/DECISIONS.md` (2026-06-19).

**Tier 0–1 core daily flow — items 1–11 all shipped 2026-06-19:**
1. PO line unit price optional (c4bb80a) — "price pending", receiving
   blocked until priced.
2. Template cost-to-produce total + margin (365fc48).
3. Template recipe unsaved-changes guard (0bfb298); reusable hook.
4. Bike shows its sales order (efdff9f) — detail + list.
5. Invoice-from-SO sets `is_export`/`is_reverse_charge` from line VAT codes
   (9241c78) — Iceland export note prints.
6. Part-category admin CRUD at `/admin/categories` (1760cd0) — first
   write-path to `part_categories`.
7. HS-code picker → searchable combobox (6c7ed33). No category↔HS table
   (deferred — the searchable list solved the gripe).
8. Delivery as ISO week + "expected" on SO (e73b280) and MO (912d739).
   Precision flags (migrations 40/41); date column stores the ISO-week
   Monday; shared `src/lib/iso-week.ts` + `DeliveryWeekDateField`; spawn-mo
   carries SO precision → MO.
9. RAL colour + coating on the SO line (ef5e307) — `coating` on `colors`
   (migration 39), `ral_code` surfaced; controlled vocab.
10. SO currency + language default from the customer (220a6ba).
11. Supplier emails (397036e) — Email column on the supplier list; owner
    still to fill addresses.

**Follow-up tweaks (2026-06-20):** SO delivery label "Requested" →
"Expected" (c2967af); new SO defaults to Week mode, week input clamped to
`1–weeksInIsoYear` (004f220); MO "Planned completion" → "Expected
completion" (9547ac7).

**Data note:** no "Wheels / Wheel sets" category existed — only `Rims`,
`Rim Tapes`, `Front Chainwheel`, `Front Sprocket`; full wheel SKUs do exist
(`JP-EWHRX010FDAB`, `JP-EWHRX010RDACB`). Dennis can create the category at
`/admin/categories`.

## Tier 2 — SO → paint → build pipeline (shipped 2026-06-20)

Rebuilt around the technician; sequenced B → A → C → D. Design decisions
D1–D4 recorded in `docs/DECISIONS.md` (2026-06-20).

- **B — Deliberate build page.** Migration 44; `confirmBikeFrame` action
  (rewrites `bikes.frame_number` + syncs the `bike_identifiers` frame row);
  `finishBikeBuild` gated on `frame_number_confirmed`; build workbench
  gained a "Frame & identifiers" panel (Finish disabled until confirmed AND
  ≥1 part); `bulkMarkBikesBuilt` skips unconfirmed bikes and reports the
  skip count; `autoAdvanceMOAfterBuild` no longer auto-completes;
  `mo-header` shows a "Complete MO" banner once every bike is built. Shared
  `loadBikeIdentifierContext` in `src/lib/bikes/identifier-context.ts`.
- **A — Unified workshop floor.** `/work` became two URL-driven streams
  (`?tab=build|repair`). Per-bike readiness in
  `src/lib/manufacturing/bike-readiness.ts` → `loadBuildQueue`: a bike's
  requirement is its own *not-yet-consumed* `bike_parts` once a build has
  started (consumed rows are already out of `v_current_stock` — counting
  them would invent a false shortage), else the MO recipe; ready = no part
  short of full on-hand (cross-bike competition not modelled, same as MO
  coverage). Frame confirmation is deliberately NOT a readiness gate — the
  card shows a "frame to confirm" hint instead of blocking. Default tab =
  build unless build is empty and repairs wait.
- **C — Paint → build pipeline (D2 + D3).** *(Paths below are as-built at the
  time; the external-services remodel later moved `src/lib/paint/*` to
  `src/lib/services/*`, and `at-painter.ts` → `at-supplier.ts`.)* "At painter"
  is derived: `AT_PAINTER_STATUSES` in `src/lib/paint/status.ts` (narrower than
  `OPEN_PAINT_ORDER_STATUSES` — a `planned` order hasn't shipped, its bikes
  stay buildable); `received_back` frees frames automatically (every gate
  query filters on current status — no trigger). One shared helper
  `src/lib/paint/at-painter.ts` (`loadAtPainterBikeIds`) backs every gate:
  `finishBikeBuild`, `bulkMarkBikesBuilt` (reports `skippedAtPainter`
  separately), `loadBuildQueue` (at-painter takes precedence over a parts
  shortfall), the build workbench, the MO bikes section. Migration 45 added
  `paint_orders.sales_order_id`; `createPaintOrderFromSO`
  (`paint-from-so.ts`) paints a SUBSET of an SO's frames at
  `/sales-orders/[id]/paint/new`; SO detail gained a "Paint orders"
  section; paint-order detail shows a back-link. Verified end-to-end
  against temporary fixtures.
- **D — Labeling note.** `sales_orders.production_note` (migration 46;
  decision in DECISIONS.md). Inline-editable on the SO detail
  (`ProductionNoteCard`), editable mid-production; surfaced on the `/work`
  build card (truncated) and as a full amber banner atop the build
  workbench.

## Tier 4 — payments & stock value (shipped 2026-06-21)

Commits 6a017f7, 1d33a4b, e96624a. The decided model (VAT timing, deposit
kinds A/B, final-bills-balance-only, customer-paid hinge, weighted-avg
valuation) is recorded in `docs/DECISIONS.md` (2026-06-21). What was built:
- Migration 48: `invoices.kind` (`standard|deposit|final`) + `deposit_pct`;
  deposits/finals share the gapless INV series.
- Deposits (`create-deposit.ts`): `percent` / `amount` (summary line, kind
  A) or `parts` (itemised `part_id` lines, kind B). Form at
  `/sales-orders/[id]/deposit/new`; gated to confirmed–ready; installments
  capped at order subtotal; VAT inherits the order's dominant code.
- `PaymentsSection` on the SO detail (Σ live invoice totals ÷ order total)
  + linked deposit/final list + CTA.
- Final (`create-from-so.ts`): nets out every issued deposit as negative
  lines → bills the remaining balance, self-labels `final`.
  `uninvoiced.ts` only treats a standard/final as "invoiced".
- Print: Acontofaktura / Slutfaktura headings; detail-page kind badge.
- Stock value (`/parts/stock-value`): on-hand × weighted-avg purchase cost
  (from `inventory_movements` receipts), MINUS stock paid via an issued
  part-based deposit — the deposit's `part_id` lines ARE the customer-paid
  record (no extra flag).

## Tier 3 — email a PO to the supplier (shipped 2026-07-08/09)

- Migration 55: communication settings on `app_settings`
  (`outbound_from_email` / `outbound_reply_to_email` /
  `outbound_test_mode` / `outbound_test_email` / `workshop_phone`), edited
  in a "Communication" section at `/admin/settings`. Every outbound channel
  reads `src/lib/communication/settings.ts` (`loadCommunicationSettings` +
  `resolveRecipients`: test mode reroutes ALL mail to the test inboxes and
  the message says who it was meant for).
- Migration 56: `email_domain` + `email_dns_records` (jsonb) — a reference
  copy of the provider's DNS records on `/admin/settings`.
- Migration 57 + code: `/purchase-orders/[id]/print` — supplier-facing
  trade document (English; suppliers span HK/DE/NL/FI/BE/SE): "Your ref."
  from `part_supplier_offerings.supplier_sku`, per-currency totals, "price
  pending" markers, DRAFT watermark. Deliberately excludes the internal
  cost basis AND all PO/line notes — enforced in the shared loader
  `src/lib/purchasing/po-document.ts`, which the email body
  (`po-email-html.ts`) renders from too, so paper and mail always match.
  "Email supplier" on the PO header: optional message-to-supplier (the ONLY
  free text that reaches them), send via `src/lib/email/send.ts` (thin
  Resend fetch wrapper, no SDK), last-send stamp on
  `purchase_orders.emailed_at/emailed_to` ("test:"-prefixed when rerouted).
- Go-live progress: Resend account created; `valent.dk` VERIFIED (EU
  region; DKIM + send-subdomain MX/SPF at Dynadot); `RESEND_API_KEY` in
  `.env.local` and Vercel. First real test send delivered 2026-07-09
  (PO-2026-0059, stamp `test:nicholas.nazar@gmail.com`) — pipeline verified
  end to end. Remaining steps live in `docs/STATUS.md`.

## July 2 2026 call backlog (all seven shipped by 2026-07-08)

Full plan: `docs/archive/plan-july2-meeting-backlog.md`. Transcript in
`~/Documents/1-Projects/Jensen/Misc - Transcripts/`. Already-shipped asks
from the same call (not numbered): template family grouping, per-PO-line
transport %, category sort order + vertical picker, paint per-line
colour/scope/finish, additive svaj pricing, test-data cleanup, AI
part-image fetch (runs in `docs/archive/part-image-runs/`).
1. Qty at template pick-time (1176597) — shared
   `category-checklist-row.tsx` `onPick(partId, qty)` + 3 callers.
2. Back-dated purchase date on stock adjust (7b0e4c9) — surfaces
   `inventory_movements.occurred_at`. Phase 2 (2026-07-08): currency picker
   on unit cost; ECB rate auto-lookup for the purchase date (shared
   `lookupFxRate`), editable override, DKK computed server-side, original
   amount + rate + ECB date appended to the movement reason (ledger stays
   DKK-only).
3. Template duplication (9c6ef6b) — copy into a brand-new template
   (version = 1), distinct from "save as new version".
4. Supplier + supplier-SKU on the new-part screen (136d0ed) — optional
   preferred `part_supplier_offerings` row written at create.
5. Family as controlled vocab (migrations 52 + 53) — `bike_families` +
   `bike_templates.family_id` FK; backfilled from distinct strings, then
   the text column dropped (expand/contract). Admin CRUD at
   `/admin/families`; ~37 read sites moved to the
   `family:bike_families(name)` embed.
6. Import-tax origin model (migration 54) — `parts.origin` +
   `suppliers.import_duty_prepaid_default`; per-line "Apply import tax"
   checkbox; frozen `import_tax_basis` enum. Decision + rationale in
   `docs/DECISIONS.md` (2026-07-08); rules in CLAUDE.md. Decision logic is
   pure and shared in `src/lib/purchasing/import-tax.ts`;
   `resolveImportTaxInputs` in `po-snapshots.ts` feeds both line writers
   (`manage-lines.ts` + `draft-pos.ts`).
7. (Won't-do recorded in DECISIONS.md: no inline part creation from the PO
   screen.)

## Dashboard overhaul (2026-07-08/09, all 4 phases + backfill)

Three bands: act (money/commitments) / watch (pipelines) / learn (trends).
- **Money band** (`src/lib/dashboard/queries.ts` + top of
  `src/app/page.tsx`): uninvoiced work, overdue invoices, agreements
  expiring ≤90 days, late POs + draft-PO count. Empty cards don't render;
  an all-clear band collapses to one line.
- **12-month trend charts** (migration 58, RPC `dashboard_monthly_stats`;
  Recharts used directly — deliberately no shadcn chart wrapper): bikes
  sold (bike_state_log in_stock→assigned) / serviced (distinct bikes on
  completed WOs) / fleet under agreement (documented approximation);
  invoiced DKK ex VAT split sales/service/fees; DKK-only (non-DKK excluded,
  not mixed).
- **Chart drill-down**: clicking a bar opens a side sheet with the records
  behind that month's number, loaded via `loadMonthDetailAction` →
  `src/lib/dashboard/month-detail.ts` (semantics mirror the RPC incl.
  soft-delete + Copenhagen month buckets). Backfilled months show the
  legacy row's count + source note instead of an empty list. The
  under-agreement line is deliberately not clickable (a level, not a flow).
- **FoldSection** (`src/components/dashboard/fold-section.tsx`): data-aware
  fold defaults + per-device localStorage override
  (`dashboard.fold.<id>`); children only mount while open (Recharts can't
  measure hidden containers).
- **Phases 3–4**: three `PipelineCard` strips (Build / Repair / Orders in
  flight) replaced the 7 flat KPI cards; purchasing trend chart
  (`loadPurchasingTrend`, app-side aggregation); "Data housekeeping" fold
  (parts w/o origin, w/o HS code, offerings w/o price, suppliers w/o
  email).
- **History backfill**: migration 59 `legacy_monthly_stats` (pre-system
  months only; boundary 2026-04/05); RPC fixed to exclude soft-deleted
  bikes. Imported 836 bikes / 132 months (2012-04 → 2026-04) from the
  owner's Excel service-agreement register ("Bikes and customers.xlsx", 12
  anniversary-month sheets, per-bike `Købt` dates; 93 % sheet-month
  consistency). Known limits: agreement bikes only; serviced + revenue
  columns left 0 — fillable later by hand or via e-conomic.

## External-services remodel (shipped 2026-07-10/11, migrations 61–64)

Paint generalized into `service_types` / `service_orders` /
`service_price_lists`; JP-lak SKUs retired (migration 62); template
cost-to-paint (migration 63); `/admin/services` price-list grid with atomic
`publish_service_price_list` RPC + tier-overlap EXCLUDE constraint
(migration 64). The durable model lives in CLAUDE.md ("Paint is the first
SERVICE TYPE…"); decisions in DECISIONS.md (2026-07-09/10, 2026-07-11);
full design in `docs/archive/plan-july9-vacation-month.md`.

## 3E — e-conomic push (slice 1 shipped + live-verified 2026-07-09)

Integration shape recorded in `docs/DECISIONS.md` (2026-07-09). Details:
- One voucher entry per distinct VAT rate; 0 %-rated entries carry no VAT
  code. Accounting year resolved by issued_date range from
  `/accounting-years` (fiscal-straddle safe). Idempotent via
  `invoices.economic_voucher_id` (format "2026 J1 V123") +
  `economic_synced_at`.
- Config at Admin → Settings → "Accounting (e-conomic)": enable toggle,
  journal, revenue account, outgoing VAT code, customer group / VAT zone /
  payment terms, plus **Test connection** (reads /self + journals + open
  accounting years). Seeded: U25, group 1, zone 1, journal 1, account 1010
  — confirm journal + revenue account with the revisor before the first
  real push; payment terms 3 (Netto 14 dage) from the TRIAL vocabulary —
  re-verify on the production agreement.
- Files: `src/lib/economic/{client,settings,push-invoice}.ts` (thin fetch
  wrapper, no SDK), action `push-economic.ts`, `EconomicSyncCard` on the
  invoice detail (blocked-with-reason on config/env gaps; e-conomic errors
  surfaced verbatim).
- **Live write test passed 2026-07-09** against TRIAL agreement 2446940:
  draft voucher `2026 J1 V1` in the trial kassekladde with two
  `manualCustomerInvoice` entries (1.250 kr w/ U25, 500 kr export w/o VAT
  code, contra 1010, due date carried); customer auto-created (#1);
  voucher id + sync stamp + customer number stamped locally. FMS fixture
  deleted after; voucher + customer left in the trial for inspection.
- Remaining steps + the trial-stamp landmine: `docs/STATUS.md`. Phase 2
  (later): payment-status pull (booked-entry remainder → `paid_date`) and
  the EAN/OIOUBL e-invoicing transmission question.

## Inbound pipeline — voicemail → ticket (slices A–F live in prod 2026-07-16)

Durable architecture in CLAUDE.md ("Inbound is a generic trunk…");
decisions in DECISIONS.md (2026-07-14, 2026-07-16/17); next arc in
`docs/plan-inbound-triage.md`; slice detail in
`docs/archive/plan-july9-vacation-month.md`. First real calls processed end-to-end
in shadow mode 2026-07-16; Gladia replaced Azure as the transcription
provider. Review queue renamed `/admin/inbound` → `/inbox` 2026-07-15
("Inbox"/"Indbakke", Daily ops nav — a review queue, not admin config).

Original design reference (June 2026), still the source for v2/v3 ideas:
- Telephony: Twilio (conditional forwarding from the existing number),
  dual-channel recording (speaker attribution for free), bilingual da/en
  "call is recorded" announcement (GDPR, Denmark).
- Webhook → audio in Supabase Storage (EU) → per-channel transcription →
  Claude structured extraction (caller, org, callback number, bike clues,
  problem, urgency, language).
- Matching is deterministic code, not the model: caller ID →
  `contacts.phone` → org; spoken org name → trigram on
  `organizations.legal_name`; spoken frame/QR → `bike_identifiers` exact;
  else owner org's fleet filtered by colour/type. Attach the bike only if
  exactly one candidate survives; otherwise store candidates for the tech.
- `bike_identifiers` type `fleet_number` for customers' own numbering
  ("bike 25") — big match-rate win for municipalities.
- Notifications: SMS ack via GatewayAPI (Danish, alphanumeric sender) incl.
  the public report link `/b/<bikeId>`; Web Push to the tech PWA (needs
  `push_subscriptions` + service-worker handler).
- Phasing: v1 voicemail-only shadow mode → v2 live-call bridging +
  recording → v3 screen-pop on inbound ring, callback threading to open
  tickets, email ingestion.
- GDPR non-negotiables: recording announcement, retention policy (audio
  ~90 days, transcript/summary kept on ticket), DPAs with providers, EU
  residency. Cost ≈ under 2 kr. per 5-min call + ~50 kr./mo for the number.

## Munin P1 (2026-07-17) — separate product

Dictate-a-task phone agent for the dev's family; built by copy-and-trimming
the FMS inbound trunk. Own repo (`github.com/GoatSmile/munin`, private),
own Supabase/Vercel/worklog — Munin work happens THERE. The number move
(+45 9370 3111 → Munin) is recorded in DECISIONS.md (2026-07-16/17) and
OPERATIONS.md.

## People & roles P1 (2026-07-23)

Migration 73: `people` / `roles` / `person_roles` / `role_capabilities` /
`role_notifications`; the dangling `work_orders.assigned_to` +
`manufacturing_orders.assigned_to` (renamed from `assigned_to_user_id`)
FK'd to people; 5 seed roles (owner, it_admin, accountant, workshop →
/work, sales → /sales-orders) with capabilities + events. Code registries
`src/lib/people/{capabilities,notifications}.ts` + scrypt helper
`password.ts`. Admin at `/admin/people`: people CRUD w/ role checkboxes,
role CRUD w/ capability + notification-event checkboxes, write-only
role-password set/rotate (set/missing badge, the env-secret status
pattern); System tile on /admin; `adminPeople` namespace en+da. Design:
`docs/plan-people-roles.md`; P2–P4 below (commit `b7f3c42`).

## People & roles P2–P4 (2026-07-23, migration 74)

The interim people & roles system completed in one day, on top of P1.

- **P2 — role-password login** (`cd99020`). scrypt password → role
  resolution; a self-contained HMAC session cookie carrying `{role, caps,
  home}`; Edge-route gating plus nav / ScanFab filtering and money-band
  gating. `SITE_PASSWORD` falls back to the owner role and legacy cookies
  stay valid, so nothing broke for existing sessions. Verified as
  workshop / accountant / owner.
- **P3 — tap-your-name** (`2341d7d`). `/whoami` re-signs the chosen person
  into the cookie and shows a nav person chip; WO assignee select +
  "Assign to me"; `/work` gains a "Mine" filter and assignee-on-card; a
  person's `preferred_language` supersedes `worker_language` on worker
  surfaces — verified live with `/work` in Danish while the app stayed
  English.
- **P4 — notification delivery** (`56c1278`). `src/lib/people/notify.ts`
  (`notifyEvent` / `notifyDigest`, fire-and-forget, test-mode reroute,
  per-recipient language) + migration 74 `notification_log` (audit trail
  and state-scan idempotency) + bilingual `email-content.ts`. Three hooks:
  `ticket.created` (app+inbox → workshop), `wo.assigned` (person-targeted,
  self-assign skipped), `invoice.overdue` (daily cron, digest-once → owner
  + accountant). The engine was verified live end-to-end through the cron —
  real log rows, test-mode reroute, idempotent rerun. Email only; SMS and
  Web Push deferred.

**Interim system complete = M1 minus per-human passwords.** No role
passwords are set in prod, so login behaviour is unchanged until they are.
Mechanics in DECISIONS.md (three 2026-07-23 entries).

## Global identifier search (2026-07-23)

`/bikes` `q` now matches **any** registered identifier — lock, battery,
charger, QR, RFID, AirTag, customer fleet number — unioned with
`frame_number`, with a per-row "matched via" hint so the result explains
itself. `/scan` manual entry inherited it for free. Commit `03f7285`.

## Perimeter audit (2026-07-23)

Verdict: **the scary version is false today.** The anon/publishable key
does not ship to the browser on any route — the browser client
`src/lib/supabase/client.ts` has zero importers, so Next never inlines the
key into client JS, confirmed by a sentinel `next build` (the key landed
only in `.next/server/**`, absent from `.next/static/**`). The `anon_all`
master-key risk is therefore **latent, not live**, and resolves at M1.

Shipped with it: a loud DO-NOT-IMPORT header on `client.ts`, the standing
landmine in STATUS.md, and BACKLOG hardening entries for the
XFF-spoofable rate limits and the `/api/qr` error echo. Commit `eac254d`.

## Voice commands VC-1 (2026-07-23/24, migrations 75–76)

Option A, text-first — the owner's middle path: the in-app dictate slice
only, no phone routing. Type or dictate a task in `/inbox` → a Claude
tool-use agent loop (`src/lib/inbound/command/`) grounds references via 6
read-only resolvers → proposes a plan of DRAFT actions (customer / sales
order / purchase order) → `CommandPlanPanel` reviews and applies each, with
open-slot pickers and customer→SO dependency ordering, logging provenance
in `command_actions`. Migration 75 adds the `in_app` channel; 76 adds
`kind` / `command_plan` / `commanded_by` + `command_actions`. The founding
utterance was verified end to end: new customer plus a draft SO with
grounded chips and the production note filled in. Commit `1799d61`.

An adversarial review of the diff produced **VC-1 review fixes** the next
morning (`a403b12`): a rerun-lock once an action is applied, SO-header
rollback when a line insert fails, resolver `.or()` sanitizing for customer
names containing commas or parens, command-specific status labels, chip
i18n, and a currency-aware unit-price fallback.

Phone/audio ingress and the staff-number fork are **VC-3** (August, with
Dennis) — `docs/plan-voice-commands.md` stays live for that arc. Mechanics
in DECISIONS.md (2026-07-23).

## Maintenance / workshop polish pass (2026-07-24)

Sixteen items from a surveyed punch-list, in three groups (`7635157`):

- **Shop-floor touch safety** — always-visible photo delete, a
  mark-done confirm that names the ticket it resolves, two-tap parts
  removal, `/work` loading skeletons.
- **Office correctness** — cancel/complete errors render inside the
  dialog, bikeless triage tickets save, **WO cancel returns consumed parts
  to stock**, a blank-labor-rate warning, desktop finish-confirm.
- **Build + scan** — an honest "Print recipe" label, the surfaced bulk-add
  identifier error, clear-build arm reset, and scan/i18n copy broadened for
  global identifier search plus a localized "(no name)".

Two calls were the owner's, taken via AskUserQuestion: WO cancel reverses
inventory, and a blank labor rate *warns* rather than auto-billing. The
bike-scoped per-bike print sheet was deferred to BACKLOG.

## July close-out — inbound stats fold (2026-07-24)

A deliberately thin dashboard calibration fold over the shadow rows: match
rate, ticket-conversion, low-clarity, spam, and intent mix, gated on the
`inbox` capability. Minimal by design until real inbound data lands in
August. Shipped with the archiving of `plan-july9-vacation-month` (marked
closed, moved to `docs/archive/`, three references repointed), which closed
**July queue items 1–6**. Commits `18e0017`, `303d45b`.

## Live-call recording V1 (2026-07-25, migrations 77–78)

The other half of the inbound trunk: a customer calling the Twilio number
no longer only reaches voicemail. The call is announced bilingually,
**bridged to the workshop phone**, and the conversation recorded in dual
channel; voicemail remains the no-answer fallback, and the result lands on
the same trunk with a dialogue extraction prompt producing `callSummary` +
`commitments`. Answered calls skip spam scoring; the media cap went 25 → 100 MB.
Flag-gated, ships default off. Commit `70371d6`.

**Live-verified the same day** on a real bridged call (`e1e9cc6`): customer
phone → Twilio → notice → rang the test mobile → a 102 s conversation
recorded dual-channel → EU storage with the Twilio copy deleted →
transcript → extraction → customer org auto-matched by phone, **27 s from
hangup to `matched`**.

Then **deterministic speaker attribution** (`8b66bfa`): a garbled transcript
root-caused to reading Gladia's *diarization guess* instead of its
**`channel` tag**. The durable lesson — never diarize where a channel tag
exists — is now a rule in STATUS.md. Follow-ups refreshed in `ada6025`.

Known ceilings, not yet hit: `GLADIA_POLL_TIMEOUT_MS` (90 s) and the
recording route's `maxDuration` (60 s) are still voicemail-sized; the fix
is Gladia's async `callback`. Plan: `docs/plan-live-call-recording.md`.

## Provider evaluation + the AI-receptionist tier (2026-07-25)

The wide evaluation the owner asked for: **12+ telephony vendors on one
axis — record-time dual-channel.** Verdict: **keep Twilio + Gladia +
Claude** (`b7695fe`). Telnyx is the only credible alternative and removes no
vendor; Telavox is recorded as an instructive dead end; the structural
lesson is *"the Nordic answer to Twilio is a CPaaS, never a telco."*

**AI receptionist (Tier C) is decided, not queued** (`b87a1af`). Turnkey
platforms fail on EU residency — Retell is US-only with EU enterprise-only,
Vapi has no EU hosting, ElevenLabs Agents EU is Enterprise. If it is ever
built it is **ConversationRelay + our own Claude loop** (~$0.07/min, `da-DK`
a documented default, Deepgram Nova-3 Danish streaming, attribution free
because we own the turns), gated on one clean Danish bridged call plus a
month of real `call_outcome` data. Cheap alternatives come first:
out-of-hours routing and missed-call SMS. The real blocker is where the
WebSocket leg lives — Vercel's native WS beta caps connections at 5 min,
with 30 min Pro-gated.

## Docs scheme shared with Munin + ritual enforcement (2026-07-25)

Three changes to how the project documents itself, all in one evening.

- **One scheme, two repos** (`f2ccc21`). Munin hit the same 812-line
  `CLAUDE.md` wall two days after this project solved it, so both now use
  the same seven slots organized *by shelf life and write discipline, not
  by topic*. `shipped-history.md` → `HISTORY.md`; OPERATIONS gained the
  Scheduled jobs section and a full env-var inventory. Rationale in
  DECISIONS.md.
- **Rituals became hooks, not willpower** (`5a5f235`). A rule with no
  enforcement decays — the same-commit DECISIONS rule had already slipped
  within two days, and a `git add -A` swept an unrelated change into a docs
  commit and pushed it to `main`, which deploys. Three tracked scripts in
  `.claude/hooks/`: `gates.sh` (refuse a commit unless tsc + build pass),
  `git-add-guard.sh` (no blanket adds), `claude-md-budget.sh`.
- **Rituals became skills** (`034fa1d`). `/session-start`, `/ship-it`,
  `/log-decision` hold the full procedure; `CLAUDE.md` keeps only triggers
  and invariants. The win is consistency, not context: the checklist is now
  identical every time, including the steps most often skipped — en/da
  parity, moving a closed plan to `docs/archive/` with references
  repointed, and re-checking STATUS's Landmines.

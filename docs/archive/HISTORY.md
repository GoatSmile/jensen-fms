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

## 2026-07-26 — The design refresh, built in one day

Morning: lint into the commit gate, sales-lead drafting via the VC-1 command
agent, the live model picker (`claude-sonnet-5` in prod), the cutover plan +
owner brief, and a docs audit that mechanised the session rituals.

Then the owner moved the design refresh from "September project" to "now":
Dennis returns from vacation **Mon 3 Aug** and the new look had to greet him.
Seven commits, `e635849` → `12e18ed`.

**What made it possible in a day** was a property nobody had noticed: the
shadcn token layer is referenced by all 187 files that hand-roll a surface, so
redefining those variables in terms of Direction B propagated the whole palette
without touching a single page. `Section` — the one shared surface component —
became a re-export of the new `Panel`, which handed 19 more files the new
borderless flat-fill look for free. The audit's own cost model had assumed a
159-file sweep was the price of entry; it wasn't.

**What the audit had missed** was a third category between "tokens propagate"
and "structure doesn't": 517 raw Tailwind palette colours across 79 files,
which inherit nothing. On a direction that deliberately has no display face —
where colour carries the entire identity — those would have read as broken
rather than merely dated. Sweeping them onto the six hues became the priority,
ahead of structural card-soup removal, which is the part that got truncated.

**The judgment call that took the longest** was amber. Its 215 uses meant two
different things, and B's six hues have no warning tone. There is no room for a
seventh warm hue either: a warn-amber lands next to `buy`, and `money` is an
adjacent ochre. Mapping cautions to `alert` was tried first and was plainly
wrong — it painted `building`, `open` and "at painter" in red, which is the same
error as the all-clear-in-red bug fixed that morning. Caution became `money`'s
ochre, red got reserved for genuine alarms, and severity is now carried by
treatment: filled wash = critical, inline text = caution.

**Three bugs the work introduced and caught.** An unanchored regex matched
`-50` inside `-500` and produced fifteen `bg-*-wash0` classes. A saturated
amber badge became `bg-alert text-alert` — invisible — which forced the useful
generalisation that *every* filled hue needs an `--on-{hue}` token, not just
the accent. And the sweep made `family-colors.ts` semantic, collapsing two bike
families onto the same colour; that palette is decorative identity, not
meaning, and is now documented as exempt.

**The contrast work went deeper than the plan's §13.** That section measured
the ink ramp against the ground and the surface only. Once flat-fill panels
existed, secondary text sat on a *wash* far more often, where `#75746F` fell to
4.06:1. Darkening `--ink-3` alone collided with `--ink-2` — `#6B6B66` against
`#6B6A65` is the same colour — so the whole ramp shifted in both themes to keep
three distinguishable levels clearing AA on all eight surfaces. Final state: 37
token pairs, both themes, zero failures, verified in the browser rather than
asserted.

**Two of the audit's four bugs turned out to be less than claimed.** The Scan
FAB cannot overlap the sidebar Collapse control — the FAB is `md:hidden`, the
sidebar `hidden md:flex`; what the screenshots showed was the Next.js dev-tools
badge, which never ships. And the dark-mode 3.07:1 failure was latent rather
than live: nothing in the app applies `.dark`, so the dark theme is unreachable.
Both were fixed or recorded anyway.

**Grouping cost far less than feared.** The plan had deferred it past the
cutover on the grounds that it "changes URLs and muscle memory". Every child
href already existed, so nothing moved and no bookmark broke. Cookie state is
resolved in the server layout, because the rail is server-rendered and
localStorage would have meant a layout shift on every navigation. The encoding
is explicit `id:1|0` pairs rather than the plan's list-of-open-ids, which
couldn't distinguish "a group added later" from "closed". A cookie write sitting
inside a `setState` updater was found during verification — two toggles in one
tick persisted only the first.

Left undone, deliberately: ~140 files still hand-roll their surfaces (they read
as plainer, not broken, which is what made stopping safe), `/admin/settings`,
the `/admin/lists` consolidation, the floor/office mode split, and any dark-mode
toggle.

---

## 2026-07-27 — Design refresh Phase 2, in four slices

Commits `4149809` · `0d21cd6` · `944e434` · `9455c85`, all on
`claude/ui-ux-improvements-l2m8r6`. Phase 1 had shipped the tokens, the
primitives and the colour sweep the day before but left the *structural* half
roughly 10 % done. This day took the four pieces that needed no owner input.

**Slice 1 — the two skipped screens.** `/inbox` and `/bike-templates` were
100 % hand-rolled `rounded-md border` boxes, which made them the cheapest
place to settle conventions Phase 1 had left open. Both list pages, both
detail pages and eleven components moved onto `Panel`. No new message keys,
no route or data change.

Three calls came out of it. **A table inside a panel gets no wrapper box** —
`Table` already renders its own overflow container and row rules, so the
wrapper was a box inside a box, which is exactly what the panel replaced.
**Family colour moved from a tinted header band to the title dot**: family
hues are decorative identity, explicitly exempt from the six-hue contrast
matrix, and a wash behind panel text would have dragged them into it. **The
spam banner was a caution wearing an alarm's ink** — `bg-money-wash` filled
but `text-alert` titled — and is now `money` throughout. `Panel` gained `id`
for anchor targets and `ReactNode` titles/descriptions, which absorbed the
family dot and the recipe's inline cost/retail/margin summary without a
second primitive.

**Slice 2 — the convention, applied.** Settling a rule and applying it to two
screens left the app teaching two shapes at once, so the other twenty files
followed the same day: SO detail, MO bikes + parts, WO parts, paint orders,
the invoices list and detail, part detail ×6, bike detail ×3. Each was a
wrapper `<div>` deletion rather than layout work. Zero boxed tables remain
inside a `Panel`. The exception written into the rule: on a *hued* panel the
container stays — CLAUDE.md wants inner tables on `bg-surface` — and only the
hairline goes; those wrappers had been on `bg-background`, which resolves to
`--ground`, so they were wrong on that count too. Seven in-panel dashed empty
states became `bg-ground` fills. Left alone deliberately: boxed tables that
are not inside a panel at all (sales-orders list, MO list, `admin/kits`, the
PO receive form, the batch-build grid) — those screens are unmigrated and
belong to the wider sweep, not to this convention. DECISIONS carries a
supersede note, because the first entry had said the older screens would be
fixed as they were touched.

**Slice 3 — §9's form folds.** Organisation (21 fields), part (15) and
supplier (14) presented every field at once. `src/components/form-section.tsx`
is now one component replacing the identical local helper four forms had each
copy-pasted.

The interesting decision was the default. Copying `CollapsibleSection`'s
localStorage memory looked obvious and is wrong for a form: a remembered
"Address closed" would hide the address of the *next* customer opened. Each
section instead opens on arrival if that record already holds something in it,
so an edit form shows what is filled and a create form shows only what is
required; fields carrying defaults (currency DKK, terms 30, unit `pcs`) do not
count as content, or Billing and Specs would be open on every new record.
Folded sections unmount — safe because all three forms build their FormData
from React state rather than the DOM, and a mounted-but-hidden `required`
input would make submit fail silently on a control the browser cannot focus.
The cost is that an error inside a fold would be invisible, so `forceOpen`
unfolds the section owning the failed field, derived rather than pushed by an
effect so it snaps back to the user's own choice once the error clears.
Supplier's flat form gained the two sections it never had.
`CollapsibleSection` moved onto `Panel` in the same pass so the app has one
fold, not two that look different.

**Slice 4 — §9's provider summary rows.** The inbound panel's three capability
blocks were bordered cards holding thirteen inputs between them. They are now
summary rows — *Transcription · Gladia (EU) · ✓ Ready* — so
`/admin/settings?section=phone` arrives at two controls instead of thirteen. A
row whose secret is missing starts open, the same record-driven default as the
form folds. A pre-existing bug surfaced there: `Label` is
`flex items-center gap-2`, so the seven `<span className="block text-xs">`
hints inside labels were rendering as flex *items* beside the label, squeezing
"Production number" onto two lines. That pattern existed only in this file.

**Measured across `src/**/*.tsx`**: `rounded-md border` occurrences 298 → 240,
dashed 46 → 37, files carrying any hand-rolled bordered surface 184 → 159.
The counting method differs from the audit's 345/187 in plan §1, so the delta
is the honest number, not the absolute.

**Verification has a hole worth remembering.** The container had no
`.env.local`, so no data-driven page was ever rendered against real data.
Client components were screenshotted through a throwaway `/ui-preview` route
with stub props (deleted before each commit) — layout, hues, contrast and both
fold states confirmed there; everything server-rendered was confirmed by
`next build` and review only.

### 2026-07-27, evening — the verification pass that closed that hole
Eight checks against the production database in a real browser, highest risk
first. Five passed with nothing to change: the supplier form round-tripped all
sixteen fields (its reorder had not broken the FormData builder),
`/admin/settings?section=phone` arrived exactly as designed with three closed
"Ready" rows and two controls, hued panels kept their `bg-surface` table
containers on `/invoices`, part detail and SO detail, the seven converted empty
states render as `bg-ground` fills, and 390 px produced no page-level
horizontal scroll anywhere — every table's own wrapper is `overflow-x: auto`.
`forceOpen` earned its keep: submitting `-5` payment terms with Billing
collapsed unfolded the section, showed the error inline and wrote no row. No
revert was needed.

**The one that mattered.** `/organizations/new` arrived with Billing open and
its terms field empty, which made no sense against a shell that clearly said
`"30"`. It was not a fold bug. `EMPTY_ORGANIZATION_SHELL` is exported from a
`"use client"` module, and a server component importing it gets a *client
reference* — a probe put `Object.keys()` at `[]`, so the page's
`{...EMPTY_ORGANIZATION_SHELL}` had been evaluating to `{}`. Twenty create
pages did some version of this. Where the page spread the shell the defaults
were gone for good: the one-off MO form had a **blank required Target
quantity**, tickets had no Source or Priority, work orders no Language,
templates no Currency. Where the page passed the shell straight through as a
prop the client resolved it and nobody noticed. Nothing in the toolchain sees
any of this — `tsc`, `lint` and `next build` were green throughout, which is
the same lesson as commit `fa1dbed` wearing different clothes.

The fix moves the merge into the component and makes the shell module-local, so
a page cannot import it at all; `initial` became a `Partial` of overrides and
fold defaults read the merged `seed`. Sentinels the page used to hand over
(`ONE_OFF_VALUE`) became props. All twenty sites, on the owner's call.

**Three smaller findings.** The customer Billing fold compared terms against
`"30"` while the schema, invoicing's `DEFAULT_PAYMENT_TERMS_DAYS` and 531 of
535 customers all say **14** — so every customer in prod opened that section;
it now compares against the shell, and the copy and placeholder say 14. The
`#family-<id>` anchor worked on a full page load but not on client-side
navigation, where Next scrolls before the target exists — a small `HashScroll`
component scrolls after the first paint. And folding a section silently
disabled `type="email"` / `type="url"` validation, so `x@` in a collapsed
Contact section saved unchallenged; both the customer and supplier actions
check shape now, the customer one returning `field` so Contact unfolds.

**Tier 1 CI shipped in the same pass**, pulled forward from September:
`.github/workflows/ci.yml`, `npm ci` → `tsc` → `lint`, no secrets. The
motivation held up under checking — this session's own commits would have
skipped the local build gate, because a dev server held :3000 the entire time.

Two things real data still cannot show: no template has paintwork rows, and all
25 bikes were soft-deleted on 2026-07-01, so bike-detail empty states remain
unverified against anything but stubs.

### 2026-07-27, late — Phase 2's fifth slice: the unmigrated list pages
Eleven list surfaces still wrapped their table in a hand-rolled
`overflow-x-auto rounded-md border` box. The plan named three; the rest are the
same shape and the same one-line change, so the owner took all eleven rather
than leave the app reading half-migrated. The wrapper was redundant twice over
— shadcn's `Table` renders its own `overflow-x-auto` container, so the box was
both a second scroller and the boxed-table-in-a-surface the convention forbids.

Two things surfaced while verifying. The shared `TableSkeleton` was still a
bordered box, so every navigation to a migrated list page flashed a boxed table
that dissolved into a borderless one a moment later — one component, eleven
routes fixed. And the PO detail page turned out to have *two* unmigrated
surfaces: the receive form that was on the list, and the lines section right
above it, which would have left that screen split down the middle. Both are
panels now.

The batch-build grid's count bar, table and result summary became panels; its
raw `<table>` stayed raw markup on purpose, because it carries per-row inputs
and the scan handlers, so swapping in the primitive is behaviour risk on a
workshop-critical screen for no visual gain. Prod has no bike on a live MO
(all 25 were soft-deleted on 2026-07-01), so the grid was verified through a
throwaway stub route, deleted before the commit — the same technique the
morning's session used.

**The browser caught one real regression that three green gates did not.** The
bulk-build page's "nothing left to build" notice was converted to a `bg-ground`
fill, which is correct *inside* a panel — but at page level the page background
already **is** `--ground`, so the fill rendered as nothing at all and the
notice read as floating text with mysterious padding. Page-level notices need a
panel of their own. `tsc`, `lint` and `next build` were all clean while it
looked broken.

Measured across `src/**/*.tsx`: `rounded-md border` 234 → 208, dashed 36 → 28,
files carrying a hand-rolled bordered surface 163 → 156. What remains is
concentrated in forms and detail sections rather than lists.

## 2026-07-28 (afternoon/evening) — Phase 2 slices A–E: the card soup is mostly gone
Commits `85b668a`, `843a4dd`, `1293bb5`, `38b6eae`. Four browser-verified
passes, gates green at the 14-warning baseline throughout.

**The finding that reframed the whole remainder: it was duplication, not
styling.** Slice A went looking for six entity forms with bordered section
shells and found that all six carried their *own local copy* of the
`FormSection` helper — byte-identical to each other and to the shared component
slice 3 had already extracted for the organisation / part / supplier / template
forms. Delete six, import one. That pattern then repeated twice more: seven
archive/restore footers (identical down to the class list, and using the same
six message keys in seven different namespaces) became
`src/components/archive-panel.tsx`, and eight form save bars became
`src/components/form-save-bar.tsx`. Roughly 900 lines deleted for 500 added.

Slice B put 25 detail sections onto `Panel` — sales-order lines and payments,
org contacts and units, MO coverage and parts, part stock, WO details, the
ticket work-orders list, the template recipe editor, `/work`'s parts and photos,
the six admin vocab sections, `admin/people`, `admin/fx-rates`. `EmptyState`
gained an `inPanel` flag, because three of those render it *inside* the panel
where its dashed box was the boxed-thing-in-a-box the panel replaced.

**`/work` was left half-migrated for one commit, and that was a mistake worth
recording.** The slice boundary cut through a single screen: parts and photos
became panels with eyebrow titles while diagnosis and work-performed stayed
bordered cards with semibold headers, so four sections that had matched no
longer did. It was flagged rather than quietly shipped, and closed in the next
commit — which also mapped the four accent bars onto the six hues. Those bars
turned out to be the last raw Tailwind palette colours in the app, and *not*
deliberate exceptions: the 517-colour sweep's pattern had simply never matched
`border-l-*`, `from-*` or `fill-*`. The intended mapping was already sitting in
the code beside them — the diagnosis icon was already `text-money`, the queue
stripe already `bg-brand`.

Finishing `/work` needed one genuine design decision. The note sections' title
is the textarea's own `<Label htmlFor>`, so it could not become `Panel`'s
`title` prop — that renders an `<h2>` and would have cost the technician the
tap-the-label-to-focus target on a phone. The `<Label>` stayed and wears the
eyebrow's classes by hand; a browser check confirmed clicking it still focuses
the field. Same trade was then made for the three `<fieldset>`/`<legend>`
checkbox groups in the people and role forms.

**The browser caught two things three green gates did not** — the pattern of
the previous two days, again. First, the extracted archive footer shipped with
`hue="money"`, which is right on its own terms (archiving is reversible, so it
is a caution, and caution is money's ochre). Measured, the destructive button's
own translucent pill over that wash gives **4.25:1** against the 4.5:1 gate,
where plain `bg-surface` gives 4.69:1 — so it ships untinted. Getting a
trustworthy number took three attempts, because the pill's background is an
`oklab()` with alpha that neither `getComputedStyle` nor `canvas.fillStyle`
normalises; the first two figures were garbage produced by hand-parsing it. The
method that works is painting the wash on a 1×1 canvas, compositing the pill,
and reading the pixel. Second, the `/admin/settings` chips were given
`bg-ground` before noticing those panels are hue-washed, where an inner chip
belongs on `bg-surface` — ground on a wash reads as muddy near-white.

**And a counter-rule that cost real time to establish:** a `rounded-md border`
is not automatically card soup. Nine of slice D's 31 hits are native
`<select>` / `<input>` elements styled to match shadcn's `Input`, plus a
drawer's input-shaped filter chips and the recipe quantity stepper — a button
group, which the conventions already exempt. Sweeping by pattern alone would
have broken how those forms read.

Measured across `src/**/*.tsx` over the four commits: files carrying a
hand-rolled bordered surface **127 → 71**, `rounded-md border` **208 → 124**,
dashed **28 → 16**. Zero raw palette colours remain outside the two exempt
decorative palettes. What is left is slice F — the behaviour-carrying
workbenches — plus a long tail of single-hit files that are mostly correct as
they are.

## 2026-07-28 (evening) — two owner-reported defects, and the bike-creation model
Commits `f580845`, `8407a35`. Both started as the owner using the app and asking
a question, which is a better bug-finder than any check run so far today.

**"Why is this dropdown a white smudge?"** Because `--popover` IS `--surface`:
once Phase 2 put nearly every form section on a white `Panel`, dropdowns opened
over one at **1.000:1**, their whole edge a 1.225:1 hairline. Two candidate
fixes were tried live in the page before recommending one — a `--rule-strong`
ring reached only 1.378:1, and reaching WCAG's 3:1 would have meant a mid-grey
outline on every dropdown in the app. Shipped as elevation instead, one token
across all five overlay primitives.

The honest part: this was partly self-inflicted (the old borderless
`FormSection` showed page ground, so the dropdown had a 1.036:1 step — invisible,
but not *zero*), and more importantly **the verification method used all day
could not have caught it.** Screenshots come back downscaled to 800px, which
flattens soft-edge differences; reading DOM structure and computed styles found
the contrast failure and the wrong chip fills, but is blind to this class. The
fix was verified at an 800px viewport so the capture is 1:1.

**"Why can't I see this bike anywhere, and how do I finish the build?"** The
bike was in `building` with no manufacturing order, which turned out to be a
one-way door: `finishBikeBuild` is the only path to `in_stock`, it lives under
`/manufacturing-orders/<mo>/…`, and `/work`'s queue filters to bikes on an open
MO. Two entirely reasonable clicks — create at `/bikes/new`, then Move to →
Building — produced a bike whose only remaining moves were `retired` and
`lost_or_stolen`.

Closing it properly took two passes. First a guard: `validNextStatuses` gained a
`TransitionContext` so `planning → building` requires an MO, enforced in the
server action and not only hidden in the menu. Then the root cause, after
enumerating the creation scenarios with the owner and finding there were **four,
not three** — build-to-stock is distinct from build-to-order, and "a bike needs
fixing" is not a creation scenario at all. `/bikes/new` now records only bikes
that already exist (`in_service` with an owner, or `in_stock`), and every bike
we build comes from an MO. `in_stock` was kept at the owner's request against
the recommendation to leave it to the cutover import.

Two smaller finds along the way. `/maintenance/work-orders/new` and
`/maintenance/tickets/new` both already accepted `?bike=<id>` and honoured it
correctly — and a grep for `?bike=` returned **zero callers**, so both were
reachable only by typing a URL. Two links in the bike detail's existing "…" menu
activated capabilities already paid for. And the bike form's own copy still
advertised the old behaviour ("For one-off builds, demos, or refurb
candidates") — precisely what it no longer does.

What is still open: prod's one stranded bike cannot be rescued by any of this,
because adopting an existing bike into an MO does not exist and the owner is
undecided about building it. The manual recovery is a new MO, a new bike on it,
and retiring the stranded one.

## 2026-07-29 — Slice F, `/admin/lists`, and a day of testing before the handover

Three arcs in one day. The first two closed the design refresh; the third was a
deliberate pass looking for what everything before it had missed.

### Slice F: the last hand-rolled surfaces (commits `1f34f9a` … `2f0e147`)

Seven behaviour-carrying files onto the shared primitives, **one commit each,
each browser-verified against real data before committing** — deposit form,
paint-from-SO form, scanner, MO batch form, add-parts workspace, build pick
list, build workbench. The one-file-at-a-time rule earned its keep immediately:
verifying `scanner` surfaced **two real, pre-existing bugs, neither cosmetic and
both invisible to the toolchain.** Manual frame-number entry had never worked —
`new URL(v, origin)` does not throw for a plain string, so the frame-number
fallback was unreachable and typing one 404'd, on exactly the path a mechanic
uses when the camera fails. And leaving `/scan` after declining the camera threw
a runtime error, because html5-qrcode's `stop()` throws SYNCHRONOUSLY and the
existing `.catch()` could only ever see a rejection.

A `rounded-*` grep also proved insufficient: `build-workbench`'s footer was
`border-t bg-muted/20 px-4 py-3` — no rounded corner, and its padding fought the
Panel's once inside one. Grep `bg-muted` and bare `border-t`/`border-b` too.

### `/admin/lists`: 18 routes retired into one page

The seven controlled vocabularies each had list + new + `[id]` pages; collapsing
those 18 routes is what the page exists for. A new vocabulary is now a
descriptor entry in `src/lib/admin/vocabularies.ts` plus its three actions —
service part types became the eighth tab the same day and cost exactly that,
which was the design's own prediction tested once. The seven share ONLY
`is_active`; four different name shapes and two without `sort_order` are why the
descriptor layer exists rather than a unified field list.

Left deliberately undone: the seven `manage-*.ts` actions still carry
`revalidatePath` calls for their now-redirect-only routes. Harmless no-ops, not
worth churning seven files in the commit that deleted 15 components.

Also that morning: **the paint estimate stopped substituting another supplier's
price list.** It had fallen back to `lists[0]`, so a template could show a
cost-to-paint — and feed it into margin — priced off a painter nobody chose. No
default supplier, or a default with no current list, now yields no estimate and
a message saying which case it is. The default is set from a price-list panel
("Make default"), never a free supplier dropdown, which is what makes "default
supplier with no prices" unreachable rather than merely discouraged.

### The preflight pass (commits `e7cd7da` … `b922ea8`)

With the app about to be handed to Dennis and no test suite in existence, a
two-tier harness built and run: `npm run smoke` (all 103 page routes fetched
with real ids, asserting status, error-overlay markers and missing i18n keys —
92 pass, 19 redirect, 0 skip, 0 fail) and `scripts/audit-invariants.sql` (16
queries that must each return zero rows). Then every write flow driven through
the real UI and unwound with stock restored exactly.

**It found three real defects and two standing data problems.** The defect that
matters most was in the durable docs, not the code: **CLAUDE.md's landed-cost
formula was missing `anti_dumping_pct` entirely**, describing three additive
buckets where the generated column has four. At 48.5% of base on the affected HS
codes, anyone reasoning from that paragraph understated China-sourced landed cost
by more than a third — wrong from 2026-06-06, when anti-dumping shipped, until
now. The app code was always right, so no wrong number ever reached a screen.
This is the class the monthly consolidation exists to catch and did not: the
paragraph reads perfectly well, and a missing term is invisible until you check
the expression against `information_schema`.

Two others: the new-ticket subtitle still said "Work orders come in the next
push — for now this just logs the report" (they shipped in May, and the same page
has a Start work order button), and the **e-conomic trial landmine's own
precondition was false** — STATUS said no trial-stamped records existed and four
did, residue of the 2026-07-09 live push test. Clearing them became a recorded
prerequisite of the production cutover rather than an assumption.

Two standing data problems, both left as debts: negative stock on `JP-sap271`
(−207, from one receipt in May against eight real builds — opening stock was
never entered, and the 31 Aug physical count resolves it), and `INV-2026-0001`
already spent on a test with the counter at 1, so the first real invoice will be
`INV-2026-0002`. That second one is a revisor question, not a code one.

**Two of the audit's own first four hits were bugs in the checks, not the data** —
worth recording because both are easy to reintroduce: a cancelled draft invoice
legitimately keeps its `DRAFT-` placeholder (never issued, so never allocated),
and `'INV-2026-'` is NINE characters, so a `left(…, 8)` comparison silently
matches nothing and reports every counter as broken.

The audit is one SQL file rather than a Node script, deliberately. Running
arbitrary SQL from Node needs either a new database secret or a SECURITY DEFINER
exec RPC, and under the permissive `anon_all` policy that RPC would be a live
hole reachable with the publishable key. The first draft was a `.mjs` containing
exactly that; it was deleted rather than shipped.

### What driving this app from a console actually costs

Recorded because the next person to automate against it will hit all of these.
A synthetic `.click()` does not trigger server-action buttons where a real mouse
click does. `getBoundingClientRect` maths against screenshot pixels drifts,
because the screenshot canvas is offset when the page is scrolled and the
viewport silently dropped to mobile width mid-session — `read_page` refs worked
first time, every time, once switched to. `input[type=text]` matches the
ATTRIBUTE, so it misses every input relying on the default type. And **a
screenshot taken right after navigation shows PRE-HYDRATION state**: Radix
`Select` renders its trigger empty server-side and fills the label on mount, so
a required field looks like an empty chevron pill and a prefilled field looks
blank. Two findings were nearly written up from that alone — the `?bike=` deep
link and the paint order's supplier — both fine.

### The handover documents, reframed

The owner's call: Dennis's August job is **not** data entry. `PLAYBOOK-AUGUST.md`
was rewritten around learning the app and recording reactions, opening with two
five-minute steps (add himself as Owner under People & roles; set his own App and
Workshop language). `CUTOVER-BRIEF.md`'s numbered asks were re-ordered to match,
so the two documents Dennis reads no longer name different top priorities.

Verifying the instructions against the running app corrected two of them: adding
a person with a role is ONE form (roles are checkboxes on it), and being on the
people list does **not** stamp records with your name — nothing writes `actor_id`
anywhere. What it does is let jobs be assigned to you by name and make you
notifiable.

The brief also turned out to say "Monday 18 August" for a date that is a Tuesday.
Rather than correcting the weekday, the owner's call was to drop day names
entirely: the three meetings now carry an order, not dates. Same pass fixed
"five parts have no HS code" (eleven, as of that day) by pointing at the
dashboard's live list instead of carrying a number, and a claim in
`plan-cutover.md` that the e-conomic trial stamps did not exist.

### Danish verified, and one piece of copy that undermined it

Flipping `app_language` / `worker_language` to `da` and back confirmed the
go-live switch: all 103 routes render Danish with zero missing keys, both
dictionaries are key-identical at 3979, and the worker surfaces correctly follow
`worker_language` rather than `app_language`. The one thing it found was the
worst-placed instance of copy outliving its behaviour — the note directly under
those two settings said the interface was "still being translated, so some
screens stay in English until that rolls out." That is the screen you use to go
live, and it said the feature was not ready.

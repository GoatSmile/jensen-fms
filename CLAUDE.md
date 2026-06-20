# Jensen FMS

Fleet management system for Jensen Production / Logocykler — a Danish workshop
that builds custom branded bikes for hotels, municipalities, hospitals, and
similar organizations. Replaces fragmented Excel + paper workflows.

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres) — EU West (Ireland), project ref `jzlphajunfrqvpogzsiz`
- `@supabase/ssr` for server components; `@supabase/supabase-js` elsewhere
- Publishable key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser-safe with RLS)
- Secret key in `SUPABASE_SECRET_KEY` (server-only, bypasses RLS)
- Auth not yet wired — defer until Parts module is feature-complete

## Database
Schema introspectable via the `supabase` MCP server (read-only, including
`execute_sql` for ad-hoc inspection). Nine domains: reference, catalog,
suppliers/purchasing, inventory, customers, bikes, commercial, maintenance,
cross-cutting. Original SQL files live in `/migrations/`.

### Established views
- `v_current_stock` — `(part_id, location_id, quantity_on_hand, last_movement_at)`.
  **Per-location**, so for a single stock figure per part, sum
  `quantity_on_hand` grouped by `part_id` (don't assume one row per part).
- `v_part_last_cost` — one row per part with `last_cost_dkk`,
  `last_purchase_quantity`, `last_order_date` from the most recent
  `purchase_order_lines` row. Defined in `migrations/04_v_part_last_cost.sql`.

## Architectural decisions — do not silently change these
- Money is always `(amount NUMERIC(15,4), currency CHAR(3))`. No naked numbers.
- FX rate is frozen at the moment of purchase in
  `purchase_order_lines.fx_rate_to_dkk`. Cost basis preserved across rate changes.
- **Landed cost is additive**, broken out so the UI can show the user where
  each øre comes from. Formula:
  ```
  base_dkk        = unit_price × fx_rate_to_dkk
  transport_dkk   = base_dkk × transport_pct       (default 10 %, settable in /admin/settings)
  import_tax_dkk  = base_dkk × tariff_pct          (from the part's HS code, snapshotted at insert)
  landed_dkk      = base_dkk + transport_dkk + import_tax_dkk
                  = unit_price × fx_rate_to_dkk × (1 + transport_pct + tariff_pct)
  ```
  `purchase_order_lines.landed_cost_dkk_per_unit` is a Postgres
  `GENERATED ALWAYS AS (unit_price * fx_rate_to_dkk * (1 + transport_pct + tariff_pct)) STORED`
  column — **never write it from app code** (the DB rejects direct writes).
  Recompute previews in the UI for live feedback, then read the stored
  value back after insert/update.

  **Frozen at purchase.** Both `transport_pct` and `tariff_pct` are snapshotted
  onto the PO line at insert — same rule as `fx_rate_to_dkk`. Editing the part's
  HS code later or changing the admin default does NOT retroactively shift cost
  basis on historical lines.
- **HS / TARIC codes** live in `hs_codes` (code unique, description,
  `tariff_pct` decimal). `parts.hs_code_id` is optional — unclassified parts
  snapshot `tariff_pct = 0` and skip the import-tax bucket. Admin manages the
  list at `/admin/hs-codes`. Archiving (`is_active = false`) hides a code
  from new-part pickers but leaves historical snapshots alone.
- **App-wide defaults** live in a singleton `app_settings` row (id = 1). Today
  it just holds `default_transport_pct` (0.10 = 10 %), pre-filled into new PO
  line dialogs. Edited at `/admin/settings`.
- Catalog (`parts`) and inventory (`inventory_movements`) are separate.
  Current stock is a query (`SUM(quantity_delta)`), never a stored field.
- `part_categories` is hierarchical (parent_id self-reference).
- **Kits (kitting) ≠ part categories.** `kits` ("Red 1", "Green 9" — colour +
  number sticker labels on part boxes) are an assembly-floor *picking* aid,
  not catalog taxonomy. Full-code picking: colour+number is the identity
  (`UNIQUE NULLS NOT DISTINCT (sticker_color, kit_number)`); colours repeat
  freely and the code prints big on the sticker. **The number is optional** —
  a bare colour ("Red") is a valid code, and NULLS NOT DISTINCT means at most
  one bare kit per colour. Bare sorts before numbered ("Red" < "Red 1") via
  `compareKits` in `src/lib/kits/colors.ts`. `part_kits` is a plain M-to-N — parts
  carry 0..n labels, no snapshotting (picking aid, not cost basis). The
  sticker-colour palette is an app constant (`src/lib/kits/colors.ts`), not
  a DB table. Labels are independent of BOMs: the "label this BOM" bulk
  action on a template is a one-shot writer; later recipe edits don't move
  labels. Archived kits keep their labels on parts (greyed on the part
  detail) but drop out of pickers, pick lists, and the parts filter.
  Admin at `/admin/kits` (+ printable sticker sheet per kit); build
  workbench shows the bike's parts grouped by kit as a pick list.
- Bikes have polymorphic identifiers: frame, lock, battery, charger, QR, RFID, AirTag.
- `audit_log` table exists; apply triggers per-table as needed.
- **Product entity = `bike_templates`** (no more `bike_models` / `bike_model_variants`,
  collapsed in migration 09). Size and color split:
  - **Frame size** is baked into the template — `Norma S` and `Norma L` are two
    separate templates. `bike_templates.family` groups them (e.g. "Norma").
  - **Color** is picked at order time (per `sales_order_line.color_id`) and at
    build time (per `manufacturing_orders.color_id`). FK to controlled-vocab
    `colors` table; never free-text. Seeded: white, red, black.
  - Templates remain versioned (`version` + `is_current`); the as-built BOM is
    snapshotted into `manufacturing_order_parts.origin` so editing a template
    doesn't rewrite history.
- **Two build paths**:
  - From a template — MO references `bike_template_id`, BOM expands from
    `bike_template_parts` into `manufacturing_order_parts`.
  - One-off / by-parts — MO has `bike_template_id = NULL`, parts list is
    assembled by hand. Both paths consume inventory the same way.
- **Per-bike parts are the source of truth at build time.** `bike_parts`
  (one row per bike per part, with `inventory_movement_id`) records what
  was actually consumed for a specific bike. The MO recipe
  (`manufacturing_order_parts`) is just the default that gets copied to
  `bike_parts` when the build starts. Implications:
  - The **per-bike build workbench** at
    `/manufacturing-orders/<mo>/bikes/<bike>/build` lets a tech edit the
    bike's parts before clicking *Finish build* — swap a saddle, add a
    one-off accessory, change a quantity. The workbench writes to
    `bike_parts`, not to the MO recipe.
  - The bulk **"Mark X built"** shortcut on the MO bikes section still
    works for the common case (every bike == recipe). It calls
    `markBikeBuilt`, which now: (1) lazily copies the recipe into
    `bike_parts` if empty, then (2) calls `finishBikeBuild` which consumes
    from inventory per `bike_parts` row, stamps `bike.build_cost_dkk`,
    and transitions to `in_stock`. Same final code path either way —
    consistent ledger entries, accurate per-bike cost basis.
  - `bike_parts` rows with `inventory_movement_id IS NOT NULL` are
    frozen (qty / removal disallowed); pre-consumption rows are
    editable.
- **Paint is a separate workflow**, not a BOM line. `paint_orders` is a batch
  header (one supplier visit covers N bikes via `paint_order_bikes`), with
  status `planned → sent_to_painter → at_painter → received_back`. Default
  supplier is Metacoat A/S. The `Lakering` catalog SKUs (`JP-lak*`) stay in
  `parts` as service SKUs that paint orders reference for costing — they
  never accumulate inventory_movements.
- **Bike-to-customer assignment is intentionally overloaded** — no separate
  "slated_for" column. `bikes.owner_organization_id` is set in two
  conceptually distinct moments:
  - **Slating** during `planning` / `building` — earmark for a known
    customer so the build floor sees who it's for. Status stays put.
  - **Delivery** from `in_stock` — physical handover. Status transitions
    `in_stock → assigned`, which fires `trg_bikes_state_log`.
  - **Reassignment** from `assigned` / `in_service` — owner change in
    place (org merger, internal transfer). Status unchanged.
  `assignBikeToCustomer()` blocks only terminal statuses (`retired`,
  `lost_or_stolen`) and archived bikes; the dialog copy flexes between
  "Slate" and "Assign" based on current status. If this overloading ever
  bites (e.g. need to distinguish "intended" vs "delivered" customer for
  billing), promote to a separate `slated_organization_id` column.
- **Soft-archive convention is non-uniform** — three genuinely different
  concepts share the "hide from pickers" surface:
  - **`deleted_at` (soft delete)** — `parts`, `bikes`, `contacts`,
    `organizations`, `organization_units`, `suppliers`, `attachments`,
    `part_categories`. The thing existed and is gone; audit trail kept.
    Query with `.is("deleted_at", null)` to hide.
  - **`is_active` (controlled-vocab archive)** — `colors`, `vat_codes`,
    `hs_codes`, `bike_types`, `bike_identifier_types`, `bike_identifiers`,
    `customer_groups`, `customer_segments`, `inventory_locations`,
    `tax_identifier_types`. The value is still valid for historical
    records but shouldn't show in pickers for new entries. Query with
    `.eq("is_active", true)`.
  - **`is_current` (versioned)** — **only** `bike_templates`. Many
    versions; one is current. Past versions stay queryable so old MOs
    keep their recipe. Query with `.eq("is_current", true)`.
  - Some tables (`organizations`, `suppliers`, `part_categories`) carry
    BOTH `deleted_at` and `is_active` — "archived" vs "deleted" are
    distinct lifecycles there. Pickers read `is_active = true`; the
    archive UI sets both together.
  - **Transactional tables** (POs, MOs, SOs, invoices, work orders,
    inventory_movements, etc.) have **no** soft-archive flag — they use
    a status enum (`draft`, `cancelled`, `completed`, …) instead.
  - **Reflex check before writing a query**: if you're about to add
    `.is("deleted_at", null)` to a table that doesn't have that column,
    Supabase silently returns zero rows — bit us once on the SO line
    dialog's bike-templates picker (commit 98cef10).
- **Sales orders drive slating + delivery automatically.** When an SO
  transitions `draft → confirmed`, every unbuilt bike on linked MOs gets
  slated to the SO's customer (owner_organization_id, owner_unit_id set;
  status stays in build phase). When the SO transitions to `delivered`,
  any of those bikes that are currently `in_stock` flip to `assigned` in
  one bulk write — slating became delivery. Cancelling an SO unslates any
  still-unbuilt bikes; built ones stay slated and the workshop unpacks
  the orphan by hand.
  - New bikes added to an MO whose SO is past-draft inherit the slate at
    create time (both `addBikeToMO` and `bulkAddBikesToMO` look up the
    SO's customer).
  - SO line spawn-MO action lives at `src/app/sales-orders/_actions/
    spawn-mo.ts`. v1 is one MO per template line; the schema allows N-MOs-
    per-line, so a future "split into two batches" lives in its own action.

## Conventions
- **Git workflow: commit on `main` and push to `origin` every time.** No PRs,
  no feature branches, no waiting to push — once a change is committed it goes
  straight to GitHub so the remote always reflects local. Solo-dev shop;
  speed beats process here.
- **Pre-commit hygiene (TODO — not enforced yet, but the lesson is on file):**
  `tsc --noEmit` + `next build` are necessary but not sufficient. They miss
  RSC boundary violations and other runtime-only failures. When a CI pipeline
  exists it should also (a) curl every route on a running dev server and
  assert 200 + no "Runtime Error" / "TypeError" in the HTML, and (b) run a
  Vitest suite over the server actions. Until then, manually smoke-test
  new routes via Claude Preview before declaring a phase done. Lesson came
  from the Phase 1.1 PO `/new` route shipping with a server-component
  calling a `"use client"` function (commit fa1dbed).
- Server-render initial page, client components for interactive state.
- URL search-params drive list filters (so filtered views are shareable links).
- shadcn/ui components by default; build custom only when shadcn lacks it.
- **shadcn style is `radix-nova`** — composition uses Radix `Slot` and the
  `asChild` prop (`<Button asChild><Link…/></Button>`). Do NOT re-init shadcn
  fresh; recent CLI defaults pick `base-nova` (uses `@base-ui/react` and a
  `render` prop), which won't compose with the existing components.
- Sentence case in UI text — never Title Case, never ALL CAPS in headings,
  buttons, or body copy. **Accepted exception:** small "eyebrow" micro-labels
  (dashboard KPI captions, `dt` field labels, map legend headers) rendered
  ALL CAPS via CSS (`uppercase tracking-wide text-xs`) are a deliberate design
  token — keep the underlying string sentence-case and let CSS uppercase it;
  don't "fix" these to sentence case.
- **Primary action buttons + empty-state CTAs use "New X"** (e.g. "New part",
  "New bike", "New MO") — not "Add X" or "Create X". Standardised June 2026.
- Display DKK as `1.234,56 kr.` (Danish locale).
- Plan-then-build: before writing code, list files you intend to create/modify
  and wait for confirmation.
- Time estimates are quoted as `~X human-dev-min (Y min wait)` — X is the
  human-developer-equivalent for cross-comparison with design-review numbers,
  Y is the user's actual wall-clock waiting time while I work.

## Known caveats / "good enough for now" decisions
- **Parts list pagination + stock filter** are applied in-memory in
  `src/app/parts/page.tsx`. Fine at small scale; once the catalogue grows
  past a few thousand rows, push stock-status filtering and pagination
  down to SQL (an extended view or RPC).
- **Pagination prev/next links don't preserve other filters** — the server
  component can't read URLSearchParams. To fix, thread `searchParams`
  through to `PartsPagination` or convert it to a client component.
- **MO stock coverage is per-MO** (`src/lib/manufacturing/coverage.ts`) —
  two open MOs needing the same part each compare against the full on-hand
  figure; cross-MO competition for stock isn't modelled. Fine while the
  planner can see all open MOs at once; revisit if parallel batches grow.
  Coverage also excludes `JP-lak*` paint service SKUs by SKU-prefix
  convention (paint is the paint-order workflow's concern).

## Local environment
- Env file is `.env.local` (with the leading dot — Next.js won't auto-load
  any other name). Variables: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
  Restart the dev server after editing — `.env.local` is read at startup,
  not via HMR.

## Domain vocabulary
- `jpNumber` — supplier's SKU (Eastek HK uses JP-prefix codes)
- `internal_sku` — our internal item code, also JP-prefix
- **Frame number** — unique per bike, primary physical identifier
- **Service agreement** — customer contract; if active, covered repairs are not invoiced
- **Customer segments** — Hospital, Municipality, Facility Management (FM), B2B, B2C, Hotel

## Out of scope for v1.0
- Row-Level Security policies (add when wiring Supabase auth — currently the
  publishable key has full table access via PostgREST; fine for solo dev, not prod)
- Multi-tenancy (schema assumes single bike shop)
- Materialized views (use regular views; switch if movements exceed ~100k)
- Full-text search beyond existing trigram indexes on `parts.name`
  and `organizations.legal_name`

## Migrations
Never modify SQL files that have already been applied. Add new ones with
sequential numbering (`04_*.sql`, `05_*.sql`, etc.) and apply them through
the Supabase SQL editor or via `supabase db push` once the CLI is configured.

## Strategy escalation
Architectural questions ("should this be one table or two?", "how do we model
service-agreement billing?") get escalated to the human — these often live in
a separate planning chat on claude.ai. Tactical implementation questions stay here.

## Current status & roadmap (handoff — updated June 2026, post-MO-overhaul)

This section is the cross-thread handoff. A new chat won't have prior
conversation transcripts; it has this file + git history + the live DB.

### Where we are
- **v0.10.0+**, deployed on Vercel (push-to-`main` → prod), gated behind
  Vercel SSO. ~25 migrations, single-tenant, solo-dev.
- **Operationally feature-complete** for the workshop's daily job. Built and
  working: Parts + categories + inventory ledger, Suppliers (CRUD +
  multi-supplier offerings), Purchase orders + landed cost (FX, transport,
  HS/TARIC tariff, anti-dumping — all additive & frozen-at-purchase), Bike
  templates, Manufacturing orders + per-bike build workbench, Bikes +
  lifecycle + QR, Paint orders, Sales orders (3C) + slating automation,
  Organizations + contacts + units + customer map (geocoded), Maintenance
  tickets + Work orders, Workshop floor technician view (M3d, with
  voice-to-text), public customer report flow, PWA, admin section
  (HS codes, FX rates, colours, customer segments, suppliers, settings).
- **June 2026 session** (commits f1b437b…27ca92f): technician add-parts
  page (`/work/<wo>/parts`, kit shortcut, retail-only enforcement on tech
  screens); MO module overhauled for bulk — batch creation screen (template
  cards, sibling MOs, auto-created bikes), stock coverage on creation + MO
  detail, one-click draft POs from shortfall (per-supplier, full landed-cost
  snapshots via `src/lib/purchasing/po-snapshots.ts`), shared green-checklist
  recipe builder (`src/components/recipe/`) now powering both template and
  MO editors incl. kit bulk-add, bikes section at 100-bike scale (progress
  strip, status filters, mark-next-N). Follow-up fine-tunes: ticket picker +
  `save-ticket.ts` now block `planning`/`building` bikes (build defects
  belong on the build workbench); reorder-point banner on `/parts` with
  one-click per-supplier draft POs — the demand→draft-PO engine is shared
  in `src/lib/purchasing/draft-pos.ts` (MO shortfall + reorder both use it);
  SO spawn-MO aligned with the batch screen (`mo_copy_template_parts` RPC +
  `bulkAddBikesToMO`, so spawned bikes inherit the SO slate past draft and
  the redirect lands on MO detail with coverage visible).

### M1 — Auth + RLS: DELAYED until further notice (owner's call)
The publishable key has full table access; only Vercel SSO protects prod.
This is the gate to a real `1.0` and to public internet exposure, but it is
**deliberately deferred**. Do not start it unless the owner re-prioritises it.
When it resumes: Supabase auth + login + middleware + `profiles`/role table +
per-table RLS, plus a `DEV_AUTH_BYPASS` escape hatch for local dev. Open
decisions to confirm first: sign-in method (magic link vs Google Workspace
vs password), and the role model. **Agreed trigger to reconsider: the first
real invoice issued** — financial records behind SSO-only is the line.

### Next up (handoff plan, agreed with owner June 2026)

**Quick fine-tunes first** (each ≤ 1 h, independent):
- ~~Ticket-picker guard~~, ~~reorder-point → draft PO~~, and ~~SO spawn-MO
  alignment~~ — all shipped June 2026 (see session summary above). Note:
  no part currently has a `reorder_point` set, so the `/parts` banner
  stays hidden until the owner fills them in (part edit form).
- Data entry (owner/admin, not code): fill `default_purchase_price` on
  supplier offerings (draft POs currently come out at 0 kr. with a
  "set price before placing" note), set `reorder_point` /
  `reorder_quantity` on fast-moving parts so the reorder banner earns
  its keep, classify the 5 HS-less parts, confirm inferred supplier
  country codes.

**Then the big piece: Invoicing (3D).** Schema verified ready (June 2026):
`invoices` already has per-line VAT w/ snapshot rates, `language`,
`issued_locked_at`, `pdf_url`, `is_reverse_charge`/`is_export`,
`ean_number_used` (Danish public-sector e-invoicing — municipalities and
hospitals will demand it), and `economic_voucher_id`/`economic_synced_at`
for 3E. Two earlier roadmap notes turned out stale (verified June 2026):
the WO↔invoice linkage **already exists** as `work_orders.invoice_id`
(no migration needed — an invoice can cover several WOs), and the
**service-agreements CRUD (M3c) is already built** at `/service-agreements`.
Slices, in order:
1. ~~**"Uninvoiced work" list**~~ — SHIPPED June 2026. `/invoices` shows
   uninvoiced WOs (parts at retail + labor, minus agreement-covered
   buckets), delivered SOs, agreement monthly fees; queries in
   `src/lib/invoicing/uninvoiced.ts`.
2. ~~**Invoice from WO**~~ — SHIPPED June 2026. One-click draft from the
   uninvoiced list (`create-from-wo.ts`), respecting `is_billable` /
   `covers_parts` / `covers_labor`; VAT snapshot from `DK_STANDARD`.
   Drafts carry a `DRAFT-xxxx` placeholder number; **the sequential INV
   number is allocated at issue** (`issueInvoice` — lock + net-14 due
   date), so abandoned drafts never burn a number. Cancelling a draft
   releases its WOs back to the uninvoiced list. Issued invoices are
   immutable; un-issuing doesn't exist (that's a credit note, slice 5).
3. ~~**Invoice from SO**~~ — SHIPPED June 2026. One-click from the
   uninvoiced list (`create-from-so.ts`): lines copy from SO lines
   (VAT snapshots preserved, template+colour / part+SKU fallback when an
   SO line has no stored description), frame numbers of the bikes built
   under the line's MOs appended bilingually ("frames:" / "stelnumre:").
4. ~~**Print/PDF bilingual layout**~~ — SHIPPED June 2026.
   `/invoices/<id>/print` (browser print-to-PDF, same pattern as the MO
   parts list): all labels da/en per `invoices.language`, seller block
   from `src/lib/invoicing/company.ts` (**CVR/bank/address are
   placeholders — owner must fill before the first real invoice**; the
   screen shows a warning until then), customer address + CVR + EAN,
   UDKAST/DRAFT watermark on drafts. `issueInvoice` snapshots the org's
   `ean_number` → `ean_number_used` and uses per-org
   `payment_terms_days` (orgs already had EAN/CVR/payment-terms/billing
   columns — the "customers module deepens later" note was stale too).
5. ~~**Recurring agreement fees + credit notes**~~ — SHIPPED June 2026,
   completing 3D. Policy (owner): fees billed **in arrears** (only fully
   elapsed months), **one invoice per customer** (one line per
   agreement-month), **pro-rated by days** for partial months (start and
   end dates both cap). Engine in `src/lib/invoicing/agreement-fees.ts`;
   "billed through" = max `billing_period_end` over live fee lines
   (migration 37 added line-level `service_agreement_id` + period cols),
   so re-running never double-bills and crediting a fee invoice makes its
   months billable again. Expired (not cancelled) agreements still bill
   their unbilled months. Credit notes are **full reversals only**:
   one click on an issued/paid invoice → negative-mirror draft; at issue
   it draws from its own `CRE-yyyy-xxxx` series, the original flips to
   `credited`, and its WOs/SO return to the uninvoiced pool (partial
   unique index allows a replacement after a cancelled CN draft).
   Print layout renders credit notes as "Kreditnota" with a reference to
   the original. Heads-up: PostgREST self-join embeds
   (`invoices!credited_invoice_id`) resolve direction-ambiguously —
   fetch the credited original with a second query instead.
Remaining 3D-adjacent work: OIOUBL/e-invoicing transmission lands with 3E.

**After that**: e-conomic push (3E), then the phone-call → ticket pipeline
(Parked ideas below) as the parallel innovation track — v1 voicemail-only
shadow mode is low-risk whenever a change of pace is wanted.

### Dennis app-review backlog (call 2026-06-19)

Requirements pulled from the 84-min Dennis app-review call, each verified
against live code before sequencing. **Locked decisions:** first slice =
core daily flow; RAL + coating → extend the controlled `colors` table (not
free-text); payments & stock value → deferred to its own session; PO email
→ **Resend** (transactional API; verify `jensenproduction.dk` DNS, from =
`deej@jensenproduction.dk`, reply-to = his inbox).

**Tier 0–1 core daily flow — items 1–11 ALL SHIPPED (2026-06-19):**
1. ✅ PO line unit price optional ([c4bb80a]) — "price pending", receiving
   blocked until priced.
2. ✅ Template cost-to-produce total + margin ([365fc48]).
3. ✅ Template recipe unsaved-changes guard ([0bfb298]); reusable hook.
4. ✅ Bike shows its sales order ([efdff9f]) — detail + list.
5. ✅ Invoice-from-SO sets `is_export`/`is_reverse_charge` from line VAT
   codes ([9241c78]) — Iceland export note now prints.
6. ✅ Part-category admin CRUD at `/admin/categories` ([1760cd0]) — unblocks
   "wheel sets"; first write-path to `part_categories`.

**Core-flow items 7–11 — SHIPPED (2026-06-19):**
7. ✅ HS-code picker → searchable combobox ([6c7ed33]). Flat searchable list;
   no category↔HS table built (deferred — searchable list solved the gripe).
8. ✅ Delivery as ISO week + "expected" on SO ([e73b280]) *and* MO ([912d739]).
   `requested_delivery_precision` (migration 40) + `planned_completion_precision`
   (migration 41); date column stores the Monday of the ISO week, precision flag
   drives "week N YYYY" rendering. Shared `src/lib/iso-week.ts` +
   `DeliveryWeekDateField`. spawn-mo carries SO precision → MO. Exact-date kept.
9. ✅ RAL colour + coating on the SO line ([ef5e307]) — `coating` added to
   `colors` (migration 39), `ral_code` surfaced; pickable controlled vocab.
   Captured on the SO line; paint-order wiring is Tier 2.
10. ✅ SO currency + language default from the customer ([220a6ba]) — seeded
    from `organizations.billing_currency` / `preferred_language` on a new SO;
    the picker already existed (Dennis just always saw the DKK default).
11. ✅ Supplier emails ([397036e]) — form already had primary/secondary; added
    an Email column to the supplier list ("Set email" hint flags gaps). Prep
    for Tier 3 PO email; **owner still needs to fill the addresses** (all blank).

**Follow-up tweaks (2026-06-20):** SO delivery label "Requested" → "Expected"
([c2967af]); new SO now defaults to Week mode and the week input is clamped to
`1–weeksInIsoYear` (re-clamps on year change) ([004f220]); MO "Planned
completion" → "Expected completion" ([9547ac7]).

**Data note (from the 2026-06-19 call):** no "Wheels / Wheel sets" category
exists — only `Rims`, `Rim Tapes`, `Front Chainwheel`, `Front Sprocket`. Full
wheel SKUs do exist (e.g. `JP-EWHRX010FDAB` Shimano front, `JP-EWHRX010RDACB`
rear). Dennis can now create the category at `/admin/categories` (item 6).

**Tier 2 — SO → paint → build pipeline, rebuilt around the technician
(biggest; correctness epic). IN PROGRESS — started 2026-06-20.** Two moves:
make the workshop floor the unified technician home (build *and* repair), and
make the build a deliberate, gated flow. Sequenced **B → A → C → D**. Four
design decisions locked with the owner:
- **D1 — confirmed-frame flag.** `bikes.frame_number_confirmed` (migration 44)
  separates a CONFIRMED real frame from the provisional auto-generated
  placeholder (`JP-{year}-{code}-{seq}`, see `src/lib/bikes/frame-number.ts`).
  New bikes start FALSE; bikes already past building backfilled TRUE. Flips TRUE
  only at the deliberate build "Confirm frame" step (`confirmBikeFrame`).
- **D2 — "at painter" is derived, not a bike status.** A bike is at-painter iff
  it belongs to a `paint_order` with status `sent_to_painter`/`at_painter`;
  `received_back` frees it automatically. No new bike column/status. (Phase C.)
- **D3 — SO↔paint link + explicit subset.** add `paint_orders.sales_order_id`;
  "paint from SO" picks a *subset* of frames, back-linked both ways. (Phase C.)
- **D4 — deliberate completion.** No silent MO auto-complete; completion is a
  one-click "Complete MO" (banner when every bike is built). Bulk "Mark N
  built" SKIPS unconfirmed (and, in C, at-painter) bikes instead of bypassing
  the gate.

Phases:
- **B — Deliberate build page ✅ SHIPPED 2026-06-20.** Migration 44; new
  `confirmBikeFrame` action (rewrites `bikes.frame_number` + syncs the
  `bike_identifiers` frame row); `finishBikeBuild` now gated on
  `frame_number_confirmed`; the build workbench gained a "Frame & identifiers"
  panel (frame confirm + reused `IdentifierDialog`; Finish disabled until
  confirmed AND ≥1 part); `bulkMarkBikesBuilt` skips unconfirmed bikes and
  reports the skip count; `autoAdvanceMOAfterBuild` no longer auto-completes;
  `mo-header` shows a "Complete MO" banner once every bike is built;
  `mo-bikes-section` shows per-row "provisional" hints, an unconfirmed note, and
  a buildable-count bulk button. Shared `loadBikeIdentifierContext` in
  `src/lib/bikes/identifier-context.ts`.
- **A — Unified workshop floor ✅ SHIPPED 2026-06-20.** `/work` is now two
  URL-driven streams (`?tab=build|repair`): "To build" (bikes in
  planning/building on open MOs, ready-first) beside the existing "To repair".
  New per-bike readiness helper `src/lib/manufacturing/bike-readiness.ts` →
  `loadBuildQueue(supabase)`: a bike's requirement is its own *not-yet-consumed*
  `bike_parts` once a build has started (consumed rows are already in the bike
  and already out of `v_current_stock` — counting them would invent a false
  shortage), else the MO recipe; paint service SKUs excluded; ready = no part
  short of full on-hand (cross-bike competition NOT modelled, same as MO
  coverage). **Frame confirmation is deliberately NOT a readiness gate** — the
  tech confirms the real frame inside the workbench, so the card shows a "frame
  to confirm" hint instead of blocking. Default tab = build unless build is
  empty and repairs wait. Build cards match the repair-card visual language;
  tap → the build workbench. (The Scan button still links to `/scan`; a
  scan-a-frame → build-if-buildable jump is not wired here.) `blockedReason`
  already carries a string so Phase C can add an `atPainter` block.
- **C — Paint → build pipeline ✅ SHIPPED 2026-06-20.** D2 + D3.
  - **D2 — at-painter gate.** "At painter" is DERIVED (no bike column): a bike
    is at-painter iff it's in a paint_order whose current status is
    `sent_to_painter`/`at_painter` (new `AT_PAINTER_STATUSES` in
    `src/lib/paint/status.ts` — narrower than `OPEN_PAINT_ORDER_STATUSES`; a
    `planned` order hasn't shipped, so its bikes stay buildable).
    `received_back` frees frames automatically (a bike just stops matching —
    every gate query filters on current status, so NO trigger is needed). One
    shared helper `src/lib/paint/at-painter.ts` (`loadAtPainterBikeIds`) backs
    every gate: `finishBikeBuild` (per-bike backstop), `bulkMarkBikesBuilt`
    (skips + reports `skippedAtPainter` separately from unconfirmed),
    `loadBuildQueue` (/work floor — "At painter" block takes PRECEDENCE over a
    parts shortfall), the build workbench (`atPainterReason` prop disables
    Finish), and the MO bikes section (excluded from buildable count, per-row
    badge + warning).
  - **D3 — SO↔paint link.** Migration 45 adds nullable
    `paint_orders.sales_order_id` (ON DELETE SET NULL + index). New
    `createPaintOrderFromSO` action (`src/app/sales-orders/_actions/paint-from-so.ts`)
    paints a SUBSET of an SO's frames (resolves SO→MO→bikes, rejects strays +
    frames already in an open paint order) at a dedicated route
    `/sales-orders/[id]/paint/new` (page + `paint-from-so-form`, Metacoat
    default, native-checkbox frame multi-select). SO detail gains a
    "Paint orders" section (`linked-paint-orders-section`) with a "New paint
    order" CTA (hidden when SO is cancelled/delivered); paint-order detail
    shows a "Sales order" back-link.
  - Verified end-to-end against temporary paint-order fixtures (gate fires on
    floor/workbench/MO-section from both ad-hoc and SO-linked orders;
    back-links render both ways; received-back/teardown frees frames). DB back
    to baseline after each.
- **D — Labeling note** to the build floor (item 16) —
  `sales_order_lines.build_note` (or `sales_orders.production_note`), surfaced on
  the build card + workbench (e.g. service-contract muni labeling).

**Tier 3 — email a PO to the supplier** (needs Resend + DNS + a PDF/print PO;
zero email/PDF infra today). **Tier 4 — payments & stock value** (down
payments, pre-paid parts, partial invoicing, stock-valuation report;
deferred — tangles with Danish VAT-on-prepayment, a revisor question).
**Tier 5 — deferred:** offers/quotes module (price breakdown lives here);
service-contract → auto-add to maintenance fleet. Website/marketing copy is
not app work. Commitment to Dennis: core flow usable "by next week".

### Carry-over data notes
- **5 parts still unclassified** (no HS code): the Ananda M100 motor/cable
  variants (`JP-AND-M100-PWR`, `JP-AND-M100-CS`, `JP-AND-DSP-NTC`),
  `JP-SLFFH01B`, and `JP-SP207- 27,2 350`. They snapshot 0% tariff on new PO
  lines until classified.
- **"For cycle manufacture" TARIC splits**: the customs broker (DA Custom
  Brokers) files some parts under favourable splits (e.g. 8714911077,
  8714913072, 8714961010) to avoid the 48.5% anti-dumping. Our classification
  uses the standard splits. Confirm with the broker before reclassifying.
- **Anti-dumping** is modelled per HS code (`hs_codes.anti_dumping_pct`,
  snapshotted to `purchase_order_lines.anti_dumping_pct`); currently set on
  8714963090 + 8714991099 (48.5%). It's origin-agnostic — fine while sourcing
  is ~all China; revisit if supplier mix diversifies.
- **Supplier country codes** were name-inferred (migration 25); a few
  (Herrmans→FI, RYDE→NL, SAPIM→BE, Shimano Nordic→SE, MessingschKG→DE) are
  best-guesses worth confirming.
- **Supplier offerings mostly lack `default_purchase_price`** (June 2026):
  the shortfall draft-PO action falls back to 0 kr. and flags the line
  "set price before placing". Filling prices on the part pages makes
  drafted POs land ready to place.

### Hardening backlog (do as it bites)
- **CI smoke-test pipeline** (curl every route + Vitest over server
  actions — see Pre-commit hygiene above). Owner reviewed June 2026 and
  parked it deliberately: manual browser verification before every commit
  is the safety net until then ("I like the discipline"). **Agreed
  revisit: the auth/first-real-invoice milestone** — build it alongside
  auth, since auth touches every page.
- audit_log triggers (wait on auth for user_id); SQL-side pagination for the
  parts list at scale; offline write-queue for the workshop floor; Whisper
  voice fallback; bulk CSV import for parts/suppliers.

### Parked ideas
The durable home for ideas parked mid-session (session "chips" die with the
app). Add new ones here with enough context to act cold; delete the entry
when the work ships or the idea is rejected.

- **Phone-call → ticket AI pipeline** (parked June 2026, designed in-session).
  Workshop calls become maintenance tickets automatically:
  - Telephony: Twilio (conditional forwarding from the existing number),
    dual-channel recording (tech leg / caller leg — speaker attribution for
    free), bilingual da/en "call is recorded" announcement (GDPR, Denmark).
  - Webhook → store audio in Supabase Storage (EU) → per-channel
    transcription (Whisper API or Azure Speech EU; da/en auto-detect) →
    Claude structured extraction (caller, org, callback number, bike clues,
    problem, urgency, language).
  - Matching is deterministic code, not the model: caller ID →
    `contacts.phone` → org; spoken org name → trigram on
    `organizations.legal_name`; spoken frame/QR → `bike_identifiers` exact;
    else owner org's fleet filtered by colour/type. Attach the bike only if
    exactly one candidate survives; otherwise store candidates for the tech
    to confirm on the ticket.
  - Schema: `maintenance_tickets` is already shaped for it (nullable
    bike_id, reported_by_contact_id/text/phone, reported_language, source
    enum already has 'phone'). New `calls` table (recording path, caller
    number, duration, language, transcript jsonb with speaker+timestamps,
    summary, extraction payload, candidate bikes, pipeline status, nullable
    ticket_id). New `bike_identifiers` type `fleet_number` for customers'
    own numbering ("bike 25") — big match-rate win for municipalities.
  - Notifications: SMS ack to caller via GatewayAPI (Danish, alphanumeric
    sender) including the public report link `/b/<bikeId>`; Web Push to the
    tech PWA (needs `push_subscriptions` + service-worker handler).
  - Phasing: v1 voicemail-only in shadow mode ("review me" banner, measure
    match accuracy); v2 live-call bridging + recording; v3 screen-pop on
    inbound ring, callback threading to open tickets, email ingestion.
  - GDPR non-negotiables: recording announcement, retention policy (audio
    ~90 days, transcript/summary kept on ticket), DPAs with providers, EU
    residency. Cost ≈ under 2 kr. per 5-min call + ~50 kr./mo for the number.
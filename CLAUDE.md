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
- **App-wide defaults** live in a singleton `app_settings` row (id = 1),
  edited at `/admin/settings`. Holds: `default_transport_pct` (0.10 = 10 %,
  pre-filled into new PO line dialogs); and the location-visibility pair added
  in migration 47 — `primary_location_id` (FK → `inventory_locations`) and
  `hide_location_info` (bool). See the locations note below.
- **Single-location simplification + location visibility (migration 47).** The
  shop runs one stock location (`WH-MAIN`), so location detail is hidden
  app-wide by default (`app_settings.hide_location_info` seeded `true`), with
  the design built to scale to a second location later.
  - `resolveDefaultLocationId()` (`src/lib/inventory/default-location.ts`) is
    the single source for
    "which location does a consumption/receipt target" — `app_settings.
    primary_location_id`, else first active location by code. `finishBikeBuild`
    and work-order part consumption call it instead of each re-deriving "first
    active". The primary location **cannot be archived** (consumption falls
    back to it).
  - When `hide_location_info` is on, location surfaces collapse: parts "stock by
    location" → a single on-hand total, the movements ledger drops its location
    column, and receive / stock-adjust forms hide the location picker and target
    the primary location. Driven by a `hideLocations` / `primaryLocationId` prop
    pair threaded from the server pages — not a query-time filter.
  - **All location config lives at `/admin/locations`** (moved off
    `/admin/settings` 2026-07-09): admin CRUD (mirrors `/admin/colors`),
    the one-click hide/reveal toggle card (flips only
    `hide_location_info`), and a per-row "Make primary" action on the list
    (writes `primary_location_id`; active locations only). Settings has no
    Locations section anymore.
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
  - **Batch build (2026-06-21), for N identical bikes** — splits the shared
    work (parts = the recipe) from the per-bike-unique work (frame +
    identifiers). Two routes off the MO bikes section ("Bulk build" + "Pick
    list" buttons):
    - `/manufacturing-orders/<mo>/build-batch` — a grid of the unbuilt bikes
      with an "how many now?" count picker (number + `2/5/all` chips), one row
      per bike: frame no. (required) + the bike type's required identifier
      columns (`bike_type_required_identifiers`). `bulkBuildBikesWithIds`
      (`_actions/build-batch.ts`) loops per row: `confirmBikeFrame` → register
      identifiers → `markBikeBuilt`. Blank-frame rows skipped for later;
      at-painter/duplicate/shortfall reported, the rest continue.
    - `/manufacturing-orders/<mo>/pick-list/print?n=N` — a printable shelf-pick
      sheet: MO recipe × N, grouped by kit bucket (mirrors the per-bike
      pick-list grouping), checkbox + per-bike × batch total per line,
      "whole bucket" vs "pick X of M" badge, loose parts separate, `JP-lak*`
      excluded.
  - `bike_parts` rows with `inventory_movement_id IS NOT NULL` are
    frozen (qty / removal disallowed); pre-consumption rows are
    editable.
- **Paint is a separate workflow**, not a BOM line. `paint_orders` is a batch
  header (one supplier visit covers N bikes via `paint_order_bikes`), with
  status `planned → sent_to_painter → at_painter → received_back`. Default
  supplier is Metacoat A/S. The `Lakering` catalog SKUs (`JP-lak*`) stay in
  `parts` as service SKUs that paint orders reference for costing — they
  never accumulate inventory_movements.
  - **Colour + scope are PER LINE** (migration 51, 2026-07-02):
    `paint_order_bikes.color_id` + `.scope` (`std` = frame+fork, `svaj` = +
    front carrier, mudguards, sign, stays). The header `color_id` is only an
    optional batch default that pre-fills new lines. Lines are editable while
    `planned`, frozen once sent. Vocabulary + labels in `src/lib/paint/scope.ts`.
  - **JP-lak pricing is ADDITIVE for svaj** (owner decision 2026-07-03, from
    the painter's own quoting): the svaj SKU prices ONLY the extras — a svaj
    frame costs `JP-lakN std` + `JP-lakN svaj` (tier N from the order's bike
    count: 1/10/20). Treating svaj as all-inclusive is the misread that once
    cost ~60.000 kr on a 200-frame order. `resolveLakSkus()` encodes this; do
    not "simplify" it back to one SKU per line.
  - **⚠ Remodel decided 2026-07-09 (call): per-part itemized pricing.** The
    painter scrapped package/scope pricing — every paintable part (frame,
    fork, mudguards, chain guard, basket, sign, carrier…) gets its own item
    number + price with quantity tiers (1–9 / 10–19 / 20+), and the painter's
    numbers become our item numbers (`J.Jensen Stel10` etc.). The list is in
    hand and analyzed — 8 part types × 3 tiers, catalog table + model sketch
    in `docs/plan-july9-vacation-month.md` (source:
    `SIK_Jensen Priser 2026.xlsx`, column "pr. 1. juni 2026" is
    authoritative). Planned for July W1. The std/svaj model above stays
    authoritative until the remodel ships — replace in one cut, don't rip
    it out first.
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
    keep their recipe. Query with `.eq("is_current", true)`. Unreferenced
    templates (no bikes/MOs/SO/offer/invoice lines) can be HARD deleted
    from the template detail (`delete-template.ts`, 2026-07-09 — deleting
    a current version promotes the newest surviving sibling). Retiring a
    referenced-but-discontinued product would be an `is_active` archive
    flag — designed, not built; add it when the first real case appears.
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
- **Navigation / IA (set with owner 2026-06-20).** The left nav is grouped
  with subtle hairline separators between groups, most-used first:
  1. *Dashboard* (alone at the top, separated)
  2. *Daily ops* — Bikes · Bike templates · Parts · Maintenance · Workshop floor
  3. *Orders & commercial* — Manufacturing orders · Purchase orders · Sales
     orders · Paint orders · Invoices · Service agreements · Customers
  4. *Admin* (on its own)
  - **Two nav components must stay in sync:** `src/components/app-sidebar.tsx`
    (desktop) and `src/components/mobile-nav.tsx` (mobile drawer). They had
    silently drifted (the mobile drawer was missing Sales orders + Admin) —
    edit both when adding/moving a nav item.
  - The customer **Map** (`/organizations/map`) is **not** in the sidebar — it
    lives under the **Admin** landing page (`src/app/admin/page.tsx`), whose
    tiles are grouped most-used-first into a 3-column grid of light-tinted
    section cards (one hue per section): *Catalog & inventory* (part categories,
    colours, kits, locations) · *Purchasing & landed cost* (suppliers, HS/TARIC
    codes, FX rates) · *Customers* (customer segments, **Map**) · *System*
    (settings). The Map page itself is unchanged.
- **Section-tint hue vocabulary** (July 2026). Pages that stack *different
  kinds* of sections (dispatch surfaces: `/invoices`, `/admin`,
  `/admin/settings`, ticket + agreement details) tint each section card;
  hues carry stable meaning app-wide — **sky = workshop/ops · emerald =
  customers/sales/communication · violet = agreements/system · amber =
  money/purchasing**. Class pattern:
  `border-{hue}-200/70 bg-{hue}-50/70 dark:border-{hue}-900/40
  dark:bg-{hue}-950/20` (shared `Section` takes `className`); inner
  tables/chips sit on `bg-background` cards. Do NOT tint homogeneous
  entity-detail pages (bike/PO/MO/SO/org facets) or single-list pages —
  color is meaningful only while it's scarce. **Two entity pages carry a
  partial tint** (July 2026) because they genuinely stack foreign domains;
  on both, section order = descending question frequency, which makes the
  tint bands contiguous:
  - **Part detail**: identity → availability → sourcing → usage → selling.
    Stock + Movements sky; Supplier offerings + Purchase history amber;
    identity (Photos, Details, Kit labels — whose sticker-colour chips ARE
    data) and tail (Where used, Pricing history) neutral.
  - **SO detail**: order content → production → settlement. Production note
    (moved below Lines; restyled amber→sky — it's an instruction TO the
    workshop, and amber now means money on this page) + Linked MOs + Paint
    orders sky; Payments amber; Lines/notes neutral. The workbench build-note
    banner stays amber (tech screens don't use the tint vocabulary).
  Checked and deliberately NOT reordered/tinted: PO (homogeneous
  purchasing), MO (homogeneous ops), ticket (two-column workspace, rail
  cards already tinted), agreement (already identity → scope → history). Exception: the "Push to
  e-conomic" button wears e-conomic brand orange `#ef7d00` (hover `#e86807`)
  plus their "spark" logo mark inlined as `EconomicMark` in
  `economic-sync-card.tsx` (destination branding, not vocabulary; owner
  chose e-conomic.com's identity over parent-brand Visma purple).
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
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `RESEND_API_KEY` (outbound email — set locally + on Vercel 2026-07-09),
  and `ECONOMIC_APP_SECRET_TOKEN` + `ECONOMIC_AGREEMENT_GRANT_TOKEN`
  (e-conomic — not set yet; push/test actions return a clear error until
  they are; also needed on Vercel. The public demo/demo pair is read-only
  — never default to it silently).
  Restart the dev server after editing — `.env.local` is read at startup,
  not via HMR.

## Domain vocabulary
- `jpNumber` — supplier's SKU (Eastek HK uses JP-prefix codes)
- `internal_sku` — our internal item code, also JP-prefix
- **Frame number** — unique per bike, primary physical identifier
- **Service agreement** — customer contract; if active, covered repairs are not invoiced
- **Customer segments** — Hospital, Municipality, Facility Management (FM), B2B, B2C, Hotel

## Out of scope for v1.0
- Row-Level Security policy tightening (RLS is now ON across all 55 tables —
  migration 50, 2026-06-24 — with a permissive `anon_all` policy that preserves
  current behaviour. The remaining work is replacing those policies with
  user-scoped ones once auth is wired in M1)
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

### M1 — Auth + RLS tightening: DELAYED until further notice (owner's call)
RLS is now enabled on all 55 tables (migration 50, 2026-06-24) with a
permissive `anon_all` policy — Supabase's security warning is cleared and the
boundary is explicit. What remains is the auth layer itself + replacing those
permissive policies with user-scoped ones. Only Vercel SSO protects prod today.
**Deliberately deferred** — do not start unless the owner re-prioritises it.
When it resumes: Supabase auth + login + middleware + `profiles`/role table +
drop the `anon_all` policies and add `authenticated`-scoped replacements, plus
a `DEV_AUTH_BYPASS` escape hatch for local dev. Open decisions to confirm first:
sign-in method (magic link vs Google Workspace vs password), and the role model.
**Agreed trigger to reconsider: the first real invoice issued** — financial
records behind SSO-only is the line.

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
`deej@jensenproduction.dk`, reply-to = his inbox). **Sending domain revised
2026-07-08:** dev's own `valent.dk` instead (Dynadot DNS, Google Workspace
mail, used as a Gmail send-as alias) — from/reply-to = `nazar@valent.dk`,
live in `app_settings` (from later refined to `orders@valent.dk` — the
mailbox needn't exist for Resend, but create it or a catch-all in Google
Workspace before go-live so direct replies don't bounce). Resend records
sit on their own subdomains
(`resend._domainkey`, `send`), so the Google MX/SPF rows are untouched.

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
- **D — Labeling note ✅ SHIPPED 2026-06-20.** Chose `sales_orders.production_note`
  (per-SO, migration 46) over a per-line note — it reaches every bike of the
  order via bike→MO→SO regardless of whether the MO was line-spawned or
  batch-created, and matches the order-level use case (muni labeling).
  Inline-editable on the SO detail (`ProductionNoteCard` + `saveProductionNote`
  action) — editable mid-production (blocks only cancelled/delivered), since
  labeling instructions often arrive after confirm; distinct from the
  draft-only header form and from commercial `sales_orders.notes`. Surfaced to
  techs on the `/work` build card (truncated, `buildNote` added to
  `loadBuildQueue` via a nested SO embed) and as a full amber banner atop the
  build workbench (`buildNote` prop). **Tier 2 (SO→paint→build, B→A→C→D) is now
  COMPLETE.**

**Tier 3 — email a PO to the supplier** (needs Resend + DNS + a PDF/print PO).
Groundwork SHIPPED 2026-07-08 (migration 55): **communication settings** on
`app_settings`, edited in a "Communication" section at `/admin/settings` —
`outbound_from_email` / `outbound_reply_to_email` (seeded
deej@jensenproduction.dk per the locked Resend decision; **switched
2026-07-08 to `nazar@valent.dk` on domain `valent.dk`** — DB is the truth),
`outbound_test_mode` (seeded TRUE) + `outbound_test_email` (comma-separated;
seeded with the owner+dev inboxes), and `workshop_phone` (reserved for the
phone-call → ticket pipeline: call routing, SMS sender). Owner's rule: all
send-identity/phone config lives HERE, not in env vars — every future
outbound channel must read `src/lib/communication/settings.ts`
(`loadCommunicationSettings` + `resolveRecipients`: while test mode is on,
ALL outbound mail reroutes to the test inboxes and the message must say who
it was meant for; unticking test mode is the go-live switch). Migration 56
adds `email_domain` + `email_dns_records` (jsonb) with a "Sending domain
(DNS)" card at `/admin/settings` — a REFERENCE copy of the provider's
verification records (type/name/value/status/note, copy buttons); the
authoritative records live at the DNS host, and once the Resend key exists
the card can fetch records + live status instead of manual upkeep.
**Config-vs-secrets rule (owner, 2026-07-08): operational identifiers
(emails, phone numbers, domains, DNS values — public data) live in admin
config; only real secrets (Resend/Twilio API keys) live in env vars.**
**Code side SHIPPED 2026-07-08 (migration 57):**
- `/purchase-orders/[id]/print` — supplier-facing trade document (English;
  suppliers span HK/DE/NL/FI/BE/SE): supplier block, "Your ref." column from
  `part_supplier_offerings.supplier_sku`, per-currency totals, "price
  pending" markers, DRAFT watermark. **Deliberately excludes the internal
  cost basis AND all PO/line notes** (machine-drafted notes like "set price
  before placing" must never reach a supplier) — enforced in the shared
  loader `src/lib/purchasing/po-document.ts`, which the email body renders
  from too (`po-email-html.ts`), so paper and mail always match.
- "Email supplier" on the PO header: dialog with an optional
  message-to-supplier (the ONLY free text that reaches them), send via
  `src/lib/email/send.ts` (thin Resend fetch wrapper, no SDK; needs
  `RESEND_API_KEY` in `.env.local`/Vercel), recipients through
  `resolveRecipients` (test mode reroutes + banners the intended
  recipients + subject gets "[TEST]"), last-send stamp on
  `purchase_orders.emailed_at/emailed_to` ("test:"-prefixed when rerouted)
  shown under the PO header. Blocked for cancelled/empty POs.
**Tier 3 go-live progress (2026-07-08/09):** Resend account created,
domain `valent.dk` VERIFIED in Resend (EU region; DKIM + send-subdomain
MX/SPF live at Dynadot, reference copy in the admin DNS card),
`RESEND_API_KEY` in `.env.local` AND Vercel. First real test send
delivered 2026-07-09 (PO-2026-0059, stamp `test:nicholas.nazar@gmail.com`)
— the pipeline is verified end to end. Remaining: fill real supplier
emails (18 missing — surfaced on the dashboard housekeeping card), create
the `orders@valent.dk` alias in Google Workspace (from/reply-to both point
there; direct replies bounce until it exists), then untick test mode.

**Tier 4 — payments & stock value** ✅ **SHIPPED 2026-06-21** (commits
6a017f7, 1d33a4b, e96624a). Still get a revisor nod before the first *real*
prepayment invoice (weighted-avg stock valuation + the deposit VAT timing).
What was built:
- Migration 48: `invoices.kind` (`standard|deposit|final`) + `deposit_pct`;
  deposits/finals share the gapless INV series, `kind` drives heading/logic.
- **Deposits** (`src/app/invoices/_actions/create-deposit.ts`): `createDeposit
  Invoice(soId, {mode})` — `percent` / `amount` (summary line, kind A) or
  `parts` (itemised `part_id` lines, kind B). Form at
  `/sales-orders/[id]/deposit/new`; gated to confirmed–ready; installments
  capped at order subtotal; VAT inherits the order's dominant code.
- **Order % surface**: `PaymentsSection` on the SO detail (Σ live invoice
  totals ÷ order total) + linked deposit/final list + CTA.
- **Final** (`create-from-so.ts`): nets out every issued deposit as negative
  lines → bills the remaining balance, self-labels `final`; deposits don't
  block it. `uninvoiced.ts` only treats a standard/final as "invoiced".
- **Print**: Acontofaktura / Slutfaktura headings; detail page kind badge.
- **Stock value** (`/parts/stock-value`, linked from the parts header):
  on-hand × weighted-avg purchase cost (from `inventory_movements` receipts),
  MINUS stock paid via an issued part-based deposit — the deposit's `part_id`
  lines ARE the customer-paid record (no extra flag).

The decided model (reference):

- **VAT timing (the question that was blocking this):** the shop takes payment
  **before delivery**; VAT (25 %) is recognised **immediately at payment time**
  (Danish momsloven: payment ahead of delivery sets the tax point). **Same rule
  for both prepayment kinds below** — part-based prepayment adds no new tax
  question, just more invoice plumbing.
- **Every prepayment is its own deposit invoice (acontofaktura)** — numbered,
  VAT on the prepaid amount, issued when the money is taken. **More than one is
  allowed (installments)**: a customer can pay in several rounds before the final.
- **A deposit invoice is one of two KINDS** (the owner uses both, per customer):
  - **(A) amount / % on account** — a single summary line ("down payment 50 %"),
    not tied to parts ("hotel guys pay 50 % up front"; "180 bikes → 10 % or 50 %").
  - **(B) specific parts paid up front** — the deposit itemises actual parts at
    their prices ("one customer pays for the frames because these are *special
    parts* … I order them for you, put them in stock, but they're paid for").
- **Final/settlement invoice (slutfaktura)** at delivery bills the **remaining
  balance only**: `order total − Σ(all deposit invoices)` — NOT a fresh full
  invoice. Shows the order, subtracts every prior deposit, charges the balance +
  VAT on the balance, referencing the deposits. Avoids double-counting VAT.
- **Part-based deposits (B) carry two extra effects the owner spelled out:**
  (1) the flagged parts are **not re-charged on the final** ("only charge the
  rest"); (2) they're **excluded from the stock-valuation total** even while
  physically in stock ("200 paid stainless frames still on stock shouldn't count
  in my stock value"). A **"customer-paid" flag** on the part-for-this-order is
  the single hinge for BOTH the final-invoice exclusion and the stock report.
- **Reflected on the bike/order, visible any time** (not just at invoice time):
  "if they pay for a part like a frame I reflect it on the bike; if they pay a %
  of the order I also reflect it on the bike" → an order/bike "% invoiced · paid
  parts" surface.
- **Delegated defaults (owner: "pick the most likely"):** export / reverse-charge
  → deposits + final inherit the order's VAT code (a 0 %/reverse-charge order's
  deposit also carries 0 %, like invoice-from-SO today); period straddle → VAT
  lands in the period of each deposit's date (automatic); EAN / public sector →
  deposits + final transmit via EAN like any invoice (with 3E); stock-valuation →
  **weighted-average cost** of on-hand *minus customer-paid parts* (the one
  accounting-policy choice still worth a revisor nod; FIFO is the alternative).
- **Build pieces** (schema mostly ready — `invoices` already has per-line VAT
  snapshots, `sales_order_id`, totals, `is_export`/`is_reverse_charge`): add
  invoice `kind` (`standard | deposit | final`); a **customer-paid link** from a
  part-on-an-order (or `bike_parts` row) to its deposit invoice, driving the
  final-exclusion + stock report; `final = SO total − Σ(deposits)`; the
  stock-valuation report (weighted-avg, excluding customer-paid parts).
  **Suggested order:** deposit invoice kind A → order "% invoiced" surface →
  final invoice (subtracts deposits) → print (aconto/slut headings) → kind B
  (part-based) + customer-paid flag → stock-valuation report. Each shippable alone.

**Tier 5 — deferred:** offers/quotes module (price breakdown lives here);
service-contract → auto-add to maintenance fleet. Website/marketing copy is
not app work. Commitment to Dennis: core flow usable "by next week".

### July 2 2026 call backlog (7 items — full plan in `docs/plan-july2-meeting-backlog.md`)

Second Dennis app-review call (transcript in
`~/Documents/1-Projects/Jensen/Misc - Transcripts/`), verified against live code
2026-07-07. Already-shipped asks from the same call (NOT below): template family
grouping, per-PO-line transport %, category sort order + vertical picker, paint
per-line colour/scope/finish, additive svaj pricing, test-data cleanup, AI
part-image fetch. Explicitly **won't do**: creating a part inline from inside the
PO add-part screen (keep part creation on the parts screen — owner+dev agreed).

Build order (no-schema wins first, then two batched migrations).
**All seven SHIPPED as of 2026-07-08, including the optional item-6 phase-2**
— the July-2 backlog is fully closed:
1. ✅ **Qty at template pick-time** — SHIPPED (1176597). Shared
   `category-checklist-row.tsx` `onPick(partId, qty)` + 3 callers (template
   recipe, MO parts, build workbench).
2. ✅ **Back-dated purchase date on stock adjust** — SHIPPED (7b0e4c9).
   Surfaces `inventory_movements.occurred_at`. ✅ *Phase 2* SHIPPED
   2026-07-08: currency picker on the unit-cost field; foreign cost
   auto-looks-up the ECB rate for the purchase date (shared `lookupFxRate`),
   editable override, DKK computed server-side, original amount + rate +
   ECB date appended to the movement reason (ledger stays DKK-only).
3. ✅ **Template duplication** — SHIPPED (9c6ef6b). Copy a template into a
   brand-new one (version=1), distinct from "save as new version".
4. ✅ **Supplier + supplier-SKU on the new-part screen** — SHIPPED (136d0ed).
   Optional preferred `part_supplier_offerings` row written at create; extra
   suppliers still added on the detail page.
5. ✅ **Family as controlled vocab** (migrations 52 + 53) — SHIPPED. New
   `bike_families` (`name` unique, `sort_order`, `is_active`) +
   `bike_templates.family_id` FK; backfilled from distinct `family` strings,
   then the text column dropped (expand/contract: mig 52 additive, mig 53 drop
   after deploy). Admin CRUD at `/admin/families` + tile; template form family
   `<Select>`; list groups/orders by `sort_order`. ~37 read sites moved to the
   `family:bike_families(name)` embed. Single `name` (not bilingual).
6. ✅ **Import-tax origin model** (migration 54) — SHIPPED 2026-07-08.
   `parts.origin` (`eu`/`non_eu`, nullable = unclassified; picker on the part
   form) + `suppliers.import_duty_prepaid_default` (checkbox on the supplier
   form); a per-PO-line "Apply import tax" checkbox defaulting from
   `origin='non_eu' AND NOT supplier prepaid`, driving the snapshotted
   `tariff_pct`/`anti_dumping_pct` to 0 (fits frozen-at-purchase; HS code stays
   for records). Covers Dennis's "duty paid by supplier" (Shimano) + "EU vs the
   rest" asks. Also snapshots a **frozen**
   `purchase_order_lines.import_tax_basis` enum (`applied | zero_rated |
   unclassified | eu_origin | supplier_prepaid`) alongside `tariff_pct` — a
   *derived* reason can't be reconstructed later without reading mutable
   part/supplier/HS state (would fabricate history, breaking
   frozen-at-purchase). Lets a correct 0 (eu_origin/supplier_prepaid) read
   differently from a data-quality gap 0 (unclassified — amber in the PO lines
   table). Existing lines stayed `NULL` (pre-tracking). Decision logic is pure
   and shared in `src/lib/purchasing/import-tax.ts` (UI default + hint + basis);
   `resolveImportTaxInputs` in `po-snapshots.ts` replaced the two per-rate
   resolvers, so both line writers (`manage-lines.ts` + `draft-pos.ts`) freeze
   the same conclusion. Machine-drafted POs apply the derived default and
   flag unclassified-origin lines "set the part's origin" in the line note.

(Numbered by build order, not the plan doc's item numbers.)

### Dashboard overhaul (2026-07-08/09, ALL 4 phases + backfill SHIPPED)

Redesign around three bands: act (money/commitments) / watch (pipelines) /
learn (trends). **Owner's hard requirement: no busy screen — sections whose
data is too thin to be useful must fold away.** Shipped:
- **Money band** (`src/lib/dashboard/queries.ts` + top of `src/app/page.tsx`):
  uninvoiced work (reuses `uninvoiced.ts` + `findUnbilledFeePeriods`, incl.
  sitting draft invoices), overdue invoices (issued past due_date, CN rows
  excluded), agreements expiring ≤90 days, late POs (past expected_date) +
  draft-PO count. Cards with nothing to report DON'T render; if the whole
  band is clear it collapses to a single all-clear line.
- **12-month trend charts** (migration 58, RPC `dashboard_monthly_stats`;
  Recharts used directly — deliberately no shadcn chart wrapper/CLI re-init):
  bikes sold (bike_state_log in_stock→assigned) / serviced (distinct bikes on
  completed WOs) / fleet under agreement (documented approximation — current
  owner projected back, no ownership history exists); invoiced DKK ex VAT
  split sales/service/fees via line `service_agreement_id` + invoice
  `sales_order_id`, DKK-only (non-DKK excluded, not mixed).
- **Chart drill-down (2026-07-09):** clicking a trend-chart bar opens a
  side sheet with the records behind that month's number (sold → bike
  roster, serviced → completed WOs, invoiced → the month's DKK invoices
  ex VAT, purchasing → POs w/ landed totals), loaded on demand via
  `loadMonthDetailAction` → `src/lib/dashboard/month-detail.ts` (semantics
  mirror the RPC incl. soft-delete + Copenhagen month buckets). Months
  covered by the Excel backfill have no per-record history — the sheet
  shows the legacy row's count + source note instead of an empty list.
  The under-agreement line is deliberately not clickable (a level, not a
  flow — no month roster exists).
- **FoldSection** (`src/components/dashboard/fold-section.tsx`): fold state
  has DATA-AWARE defaults (charts collapse while history is thin; the header
  keeps a one-line text summary so folding hides detail, not signal) with a
  per-device localStorage override (`dashboard.fold.<id>`) that always wins.
  Children only mount while open (Recharts can't measure hidden containers).
- **Phases 3–4 (2026-07-09):** three `PipelineCard` strips (Build:
  planning→building→at painter→in stock, using `loadAtPainterBikeIds`;
  Repair: tickets→WOs→done-7d; Orders in flight: SOs w/ DKK value→MOs→POs)
  replaced the 7 flat KPI cards — parts/customers counts moved to the
  footer reference strip beside cost basis. Purchasing trend chart
  (landed DKK by PO order_date, aggregated app-side in
  `loadPurchasingTrend` — no migration needed) + a "Data housekeeping"
  fold (always default-collapsed): parts w/o origin, w/o HS code,
  offerings w/o price, suppliers w/o email — the CLAUDE.md data-entry
  backlog, now self-serve in-app.
- **History backfill (2026-07-09, owner said "yes, backfill"):** migration
  59 adds `legacy_monthly_stats` (month PK + the chart measures + source
  text) which the RPC ADDS onto live numbers — rows must only cover
  pre-system months (backfill ends 2026-04, live capture starts 2026-05;
  clean boundary). Also fixed the RPC to exclude soft-deleted bikes from
  sold/serviced (test remnants were counting). Imported: 836 bikes / 132
  months (2012-04 → 2026-04) extracted from the owner's Excel
  service-agreement register ("Bikes and customers.xlsx", 12
  anniversary-month sheets, per-bike `Købt` dates; 93% sheet-month
  consistency check). KNOWN LIMITS: agreement bikes only (undercounts
  one-off sales); serviced + revenue columns left 0 — fillable later by
  hand or via 3E/e-conomic. JSX gotcha hit here: multi-line text after an
  `{expr}` can lose its leading space — write row copy as one template
  literal.

### 3E — e-conomic push (STARTED 2026-07-09, slice 1 code side SHIPPED)

Design verified against the live REST API (restapi.e-conomic.com; the
public demo/demo tokens are READ-ONLY — writes fail E02002 — so the write
path is contract-verified from the POST schemas; the first real push is
the live write test, same pattern as Resend was).
- **Issued invoices push as DRAFT JOURNAL VOUCHERS** (manualCustomerInvoice
  entries: debit customer, contra revenue account + VAT code), NOT as
  e-conomic invoices — the FMS owns the INV number series; e-conomic
  issuing its own numbers would fork it. The bookkeeper reviews + books
  the voucher in e-conomic (kassekladden). One entry per distinct VAT rate
  on the invoice; 0%-rated entries (export / reverse charge) carry no VAT
  code; the VAT amount is deliberately NOT passed (e-conomic derives it
  from the code — avoids sign-convention bugs). Credit notes push as
  negative entries without the `customerInvoice` int (the INT is derived
  from the INV number digits, e.g. INV-2026-0007 → 20260007; CRE would
  collide). Accounting year resolved by issued_date range from
  `/accounting-years` (fiscal-straddle safe). Idempotent via
  `invoices.economic_voucher_id` (format "2026 J1 V123") +
  `economic_synced_at`.
- **Customer auto-create on first push** — e-conomic assigns the number
  (omitted on POST) → stored in `organizations.economic_customer_number`
  (migration 60, unique partial index). Payload uses org CVR/EAN/address/
  email + config vocabularies. If the remote create succeeds but the local
  mapping save fails, the error says to set the column manually (avoids a
  duplicate customer on retry).
- **Config vs secrets**: tokens = env (`ECONOMIC_APP_SECRET_TOKEN`,
  `ECONOMIC_AGREEMENT_GRANT_TOKEN`); operational numbers = migration 60
  `app_settings.economic_*`, edited at Admin → Settings → "Accounting
  (e-conomic)" — enable toggle, journal, revenue account, outgoing VAT
  code, customer group / VAT zone / payment terms, plus **Test connection**
  (reads /self + journals + open accounting years so the owner copies real
  numbers instead of guessing). Seeded/pre-filled: U25, group 1, zone 1,
  journal 1, account 1010 (standard DK chart) — **confirm journal +
  revenue account with the revisor before the first real push**;
  payment terms set to 3 (Netto 14 dage) 2026-07-09 from the trial's
  vocabulary — re-verify the number on the production agreement.
- Files: `src/lib/economic/{client,settings,push-invoice}.ts` (thin fetch
  wrapper, no SDK), action `src/app/invoices/_actions/push-economic.ts`,
  `EconomicSyncCard` on the invoice detail (shows for non-draft/cancelled
  invoices once enabled; push button blocked-with-reason on config/env
  gaps; e-conomic errors surfaced verbatim).
- **Live write test PASSED (2026-07-09, against a TRIAL agreement).**
  Owner created the developer-agreement tokens; the grant is on a fresh
  e-conomic **trial** agreement 2446940 ("Din virksomhed") — access to
  the real production Jensen agreement isn't expected until **end of
  July 2026**. Tokens in `.env.local`; `economic_enabled = true`,
  `economic_payment_terms = 3` (Netto 14 dage — trial vocabulary; re-check
  on the production agreement). Full path verified end-to-end via the
  invoice-detail push button on a temporary fixture invoice (mixed
  25% + 0% export lines): draft voucher `2026 J1 V1` landed in the trial's
  kassekladde with two `manualCustomerInvoice` entries (1.250 kr w/ U25,
  500 kr export w/o VAT code, contra 1010, due date carried), customer
  auto-created (#1) with CVR/address/terms/zone, `economic_voucher_id` +
  `economic_synced_at` + `economic_customer_number` all stamped locally.
  FMS fixture deleted after; the voucher + customer #1 were left in the
  trial for inspection (Regnskab → Kassekladde "Daglig").
- **⚠️ Before switching tokens to the production agreement**: any
  `organizations.economic_customer_number` and
  `invoices.economic_voucher_id`/`economic_synced_at` stamped while
  pointing at the trial refer to TRIAL entities and must be cleared, or
  pushes will silently reference wrong/missing customers. Currently none
  exist (test fixture cleaned) — keep it that way by not pushing real
  invoices to the trial, or expect to re-clear.
- **Remaining for 3E**: swap the grant token to the production agreement
  (~end of July), re-run Test connection + confirm the config numbers
  against the real books (journal / account 1010 / U25 / payment terms)
  with the revisor, then the first push of a real issued invoice.
  Phase 2: payment-status pull (booked-entry remainder → `paid_date`,
  feeds the dashboard receivables card) and the EAN/OIOUBL e-invoicing
  transmission question.

### July 2026 plan — vacation month (owner call 2026-07-09)

Full plan in **`docs/plan-july9-vacation-month.md`** (tracks, sequence,
pipeline deep-dive, provider decisions). The frame: Dennis is away until
Aug 3, Nazar leaves Aug 4 — July output must be self-serve for Dennis's
solo August onboarding. July tracks in order: housekeeping drill-down
links + mobile photo verify (W1) · **paint per-part price remodel** (W1,
painter's list analyzed in the plan doc — 8 part types × 3 qty tiers,
his item numbers become ours) · **i18n whole-app
Danish** (next-intl, worker screens first, `de` scaffolded untranslated)
· **phone→ticket pipeline v1** (harness-first: upload-a-voicemail test
UI + Azure Speech EU + Claude extraction + deterministic matching in
shadow mode; Twilio wired last with fetch-and-delete recordings) ·
**device-role cookie** (owner/workshop, `can()` helper shaped for M1) ·
**global identifier search** · maintenance/workshop-floor polish pass.
Explicitly deferred to mid-August with Dennis: old-system data migration
(owner-of-record lookups), invoicing-parity workshop + "paid" remark on
the e-conomic voucher, role matrix refinement, e-conomic production
cutover, supplier-email go-live.

### Carry-over data notes
- **Every part has `origin = NULL`** (post-migration-54, 2026-07-08): with the
  new origin model, unclassified origin means new PO lines default to **no
  import tax** (`import_tax_basis = 'unclassified'`) until the owner sets
  origins on the part edit form — owner-confirmed behaviour ("initially
  without tariff, click to add"), but it flips the old always-apply-HS-tariff
  default. The line dialog nudges, machine-drafted PO lines carry a "set the
  part's origin" note, and the PO lines table shows the amber "unclassified"
  label. Classifying the China-sourced fast movers as `non_eu` restores
  tariff-by-default where it matters.
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

- **Full UI internationalisation — UNPARKED 2026-07-09, July track.** Scope
  decided: **whole app to Danish** (not just worker screens), `de` locale
  scaffolded but untranslated (German ops is strategic, no user yet — from
  the Jul-9 call). Build order: next-intl foundation → worker screens keyed
  off `worker_language` (the employee who can't work in English) → app-wide
  sweep keyed off `app_language`. The two settings exist (migration 49) and
  currently only capture the preference. Customer-facing documents keep
  their own per-document `language`. `worker_language` becomes per-user at
  M1. See `docs/plan-july9-vacation-month.md`.

- **Phone-call → ticket AI pipeline — UNPARKED 2026-07-09, July track.**
  Provider decisions locked (Twilio w/ fetch-and-delete recordings; Azure
  Speech EU, not plain OpenAI Whisper; Claude haiku extraction; GatewayAPI
  SMS unchanged) and the build is **harness-first**: upload-a-voicemail
  test UI + processing pipeline + shadow-mode tickets before any telephony
  is wired. Full deep-dive in `docs/plan-july9-vacation-month.md`; the
  design below remains the reference.
  Original design (parked June 2026, designed in-session).
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

- **Sales track: website bike-configurator + AI lead-gen agent (parked
  2026-07-09, by the owner's own call — "lay the bottom first").** Two ideas
  from the Jul-9 call, both explicitly after the system is the daily
  workhorse (his framing: earliest next year, debt down first):
  - Homepage configurator that talks to the app: customer designs a bike on
    jensenproduction.dk (phone-first), colour input → closest RAL from the
    `colors` vocab, pick paintable parts with live pricing (the per-part
    paint catalog makes this priceable), "send me an offer" → offer/quote in
    the FMS.
  - Lead-gen agent: monitor for prospect signals (e.g. companies relocating
    to nearby business parks — his DXC/Nordhavn example), identify the right
    contact, auto-draft outreach with the configurator link. Both belong
    with the offers/quotes module (Tier 5).
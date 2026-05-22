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
- Sentence case in UI text — never Title Case, never ALL CAPS.
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
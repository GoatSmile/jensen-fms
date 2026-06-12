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

## Current status & roadmap (handoff — updated at v0.10.0)

This section is the cross-thread handoff. A new chat won't have prior
conversation transcripts; it has this file + git history + the live DB.

### Where we are
- **v0.10.0**, deployed on Vercel (push-to-`main` → prod), gated behind
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

### M1 — Auth + RLS: DELAYED until further notice (owner's call)
The publishable key has full table access; only Vercel SSO protects prod.
This is the gate to a real `1.0` and to public internet exposure, but it is
**deliberately deferred**. Do not start it unless the owner re-prioritises it.
When it resumes: Supabase auth + login + middleware + `profiles`/role table +
per-table RLS, plus a `DEV_AUTH_BYPASS` escape hatch for local dev. Open
decisions to confirm first: sign-in method (magic link vs Google Workspace
vs password), and the role model.

### Next phases (owner's stated priority order)
The next work is the **commercial / billing** cluster, roughly:
1. **Customers** — deepen the organizations module as needed.
2. **Invoices (3D)** — biggest missing business capability. SOs and WOs
   already compute costs; schema for invoices/invoice_lines exists; no UI yet.
   Closes the quote → build → deliver → **bill** loop.
3. **Purchase orders** — further enhancements.
4. **Service agreements (M3c)** — coverage is currently *inferred* on work
   orders (findActiveCoverageForBike in save-wo.ts); there's no UI to manage
   the agreements themselves.
5. **e-conomic push (3E)** — accounting integration, after invoicing exists.

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

### Hardening backlog (do as it bites)
- audit_log triggers (wait on auth for user_id); SQL-side pagination for the
  parts list at scale; offline write-queue for the workshop floor; Whisper
  voice fallback; bulk CSV import for parts/suppliers.

### Parked ideas
The durable home for ideas parked mid-session (session "chips" die with the
app). Add new ones here with enough context to act cold; delete the entry
when the work ships or the idea is rejected.

- **Ticket picker: guard against unbuilt bikes** (parked June 2026). The
  new-ticket bike picker (`src/app/maintenance/tickets/_components/
  load-pickables.ts`) only excludes retired / lost_or_stolen / soft-deleted,
  so tickets and WOs can be opened against `planning`/`building` bikes that
  don't physically exist yet (happened: WO-2026-0004 on a planning-stage
  bike). Fix: exclude `planning` (probably `building` too) from the picker,
  plus the same guard server-side in `save-ticket.ts`. Softer alternative
  considered: show lifecycle status in the picker and let the human decide.

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
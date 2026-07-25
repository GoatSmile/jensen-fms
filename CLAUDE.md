# Jensen FMS

Fleet management system for Jensen Production / Logocykler — a Danish workshop
that builds custom branded bikes for hotels, municipalities, hospitals, and
similar organizations. Replaces fragmented Excel + paper workflows.

## How the docs are organized (read this first)

This file holds **durable rules only** — what must be true in every session:
stack, invariants, conventions, vocabulary. Everything with a shorter shelf
life lives in `docs/`, one job per file, each with its own write rule:

- **`docs/STATUS.md`** — where the work stands right now: what's live, what's
  in flight, what's blocked, data-entry debts. **Read it at session start.**
  *Overwrite at session end — never append.*
- **`docs/DECISIONS.md`** — dated, append-only log of decisions locked with
  the owner (the why + rejected alternatives). *Supersede, never edit.*
- **`docs/OPERATIONS.md`** — external accounts, where every secret lives,
  scheduled jobs, deploy, DNS, backups, cold-start runbook, off-repo knowledge
  index. *Names and locations only, never values.*
- **`docs/BACKLOG.md`** — parked ideas + hardening list ("do as it bites").
  *Delete an entry when it ships or is rejected.*
- **`docs/plan-*.md`** — active plan documents; *move to `docs/archive/`
  when closed.*
- **`docs/archive/`** — **`HISTORY.md`** (curated shipped-work narrative with
  commit refs) + closed plans. Never needed to act; exists so history survives
  context loss. *Write-once.*
- **`docs/WORKLOG.md`** — hours ledger (ritual below).

**Munin (`~/workspace/code/munin`) uses this same seven-slot scheme with the
same file names and write rules** (decided 2026-07-25) — the rituals below
transfer between the two projects unchanged.

### Session rituals
- **Session start (first exchange of a new working day)**: append today's
  WORKLOG row (date · hours · one-line summary) and reconcile the previous
  row's hours from commit timestamps (mark estimates `~`; the user corrects
  with "log: Jul 9 was 7h"). Update the monthly total. Days without a row =
  didn't work; never backfill gaps unasked. One line per row — it's an hours
  ledger, not a diary.
- **Session end**: update `docs/STATUS.md` — overwrite, don't append. A new
  session must be able to resume from this file + STATUS.md alone.
- **When something ships**: reduce, don't grow. Durable residue (a new
  invariant, a new gotcha) lands here; the narrative goes to
  `docs/archive/`; STATUS.md gets rewritten. Budget for this file: ~450
  lines. The test for every line: *would a fresh session behave incorrectly
  without it?*
- **When a decision is locked with the owner**: add a dated DECISIONS.md
  entry in the same commit as the code that implements it.

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres) — EU West (Ireland), project ref `jzlphajunfrqvpogzsiz`
- `@supabase/ssr` for server components; `@supabase/supabase-js` elsewhere
- Publishable key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser-safe with RLS)
- Secret key in `SUPABASE_SECRET_KEY` (server-only, bypasses RLS)
- Real auth (M1) deliberately delayed — see docs/STATUS.md. Perimeter today:
  Vercel SSO + the people-&-roles role-password UX wall.

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
  basis on historical lines. The *reason* for a zero is frozen too:
  `purchase_order_lines.import_tax_basis` (`applied | zero_rated |
  unclassified | eu_origin | supplier_prepaid`) — a derived reason can't be
  reconstructed later without reading mutable state. The per-line "Apply
  import tax" default comes from `parts.origin` (`eu`/`non_eu`, NULL =
  unclassified ⇒ no tax) and `suppliers.import_duty_prepaid_default`;
  decision logic is pure and shared in `src/lib/purchasing/import-tax.ts`,
  and `resolveImportTaxInputs` in `po-snapshots.ts` feeds both line writers.
- **HS / TARIC codes** live in `hs_codes` (code unique, description,
  `tariff_pct`, `anti_dumping_pct`). `parts.hs_code_id` is optional —
  unclassified parts snapshot `tariff_pct = 0` and skip the import-tax
  bucket. Admin at `/admin/hs-codes`. Archiving (`is_active = false`) hides
  a code from new-part pickers but leaves historical snapshots alone.
- **Configuration doctrine — three tiers (standing rule, formalized
  2026-07-14).** Every configurable knob goes in exactly one place by its
  nature; apply this to all new config:
  1. **Secrets → env / Vercel only.** API keys, tokens, passwords. NEVER in
     the DB or UI. The admin surface may show a secret as *present/missing*
     (a `process.env[...]` boolean, never the value) — e.g.
     `economicEnvReady()`, `inboundSecretStatus()`.
  2. **Operational config → `app_settings` + `/admin/settings`.** Emails,
     phone numbers, domains/DNS, feature flags, defaults, **provider
     selection**, and a provider's non-secret params. Read via a per-domain
     loader in `src/lib/<domain>/settings.ts` (e.g.
     `loadCommunicationSettings`, `loadInboundSettings`) — never
     `process.env` for these.
  3. **Vocabulary / reference data → controlled-vocab tables + `/admin/*`.**
     Colours, categories, service types, etc. (localized via `localizedName`).
  - **Swappable providers (registry pattern).** A "provider" for a swappable
    capability (transcription, telephony, extraction-LLM, email, geocoding)
    is an **adapter behind a stable interface**. Config *selects* which
    already-built adapter runs + holds its params; it can NOT conjure an
    unbuilt integration. Each capability has a registry
    (`src/lib/inbound/settings.ts` → `TRANSCRIPTION_PROVIDERS` etc.) listing
    `{ key, envSecrets[] }`; `app_settings` stores the selected key; the
    admin card shows the selected provider's secret present/missing. Adding
    a provider = build its adapter + add a registry entry, never a
    config-only switch. Provider *endpoints* (base URLs) stay hardcoded in
    the client lib.
- **App-wide defaults** live in a singleton `app_settings` row (id = 1),
  edited at `/admin/settings`: `default_transport_pct`, the
  location-visibility pair (`primary_location_id` + `hide_location_info`),
  communication + e-conomic operational config, the inbound-pipeline
  provider selection + params (`inbound_*`), and the locale pair
  (`app_language` / `worker_language`).
- **Single-location simplification + location visibility.** The shop runs
  one stock location (`WH-MAIN`), so location detail is hidden app-wide by
  default (`hide_location_info` seeded `true`), designed to scale to a
  second location later.
  - `resolveDefaultLocationId()` (`src/lib/inventory/default-location.ts`)
    is the single source for "which location does a consumption/receipt
    target" — `app_settings.primary_location_id`, else first active
    location by code. `finishBikeBuild` and work-order part consumption
    call it. The primary location **cannot be archived**.
  - When `hide_location_info` is on, location surfaces collapse (single
    on-hand total, no location column, no picker — forms target the primary
    location). Driven by a `hideLocations` / `primaryLocationId` prop pair
    threaded from server pages — not a query-time filter.
  - **All location config lives at `/admin/locations`** (CRUD, hide/reveal
    toggle, per-row "Make primary"). Settings has no Locations section.
- Catalog (`parts`) and inventory (`inventory_movements`) are separate.
  Current stock is a query (`SUM(quantity_delta)`), never a stored field.
- `part_categories` is hierarchical (parent_id self-reference).
- **Kits (kitting) ≠ part categories.** `kits` ("Red 1", "Green 9" — colour +
  number sticker labels on part boxes) are an assembly-floor *picking* aid,
  not catalog taxonomy. Colour+number is the identity
  (`UNIQUE NULLS NOT DISTINCT (sticker_color, kit_number)`); colours repeat
  freely. **The number is optional** — a bare colour ("Red") is a valid code;
  NULLS NOT DISTINCT means at most one bare kit per colour. Bare sorts before
  numbered via `compareKits` in `src/lib/kits/colors.ts`. `part_kits` is a
  plain M-to-N — parts carry 0..n labels, no snapshotting (picking aid, not
  cost basis). The sticker-colour palette is an app constant
  (`src/lib/kits/colors.ts`), not a DB table. Labels are independent of
  BOMs: the "label this BOM" bulk action is a one-shot writer; later recipe
  edits don't move labels. Archived kits keep their labels on parts (greyed)
  but drop out of pickers, pick lists, and filters. Admin at `/admin/kits`
  (+ printable sticker sheet); the build workbench groups the bike's parts
  by kit as a pick list.
- Bikes have polymorphic identifiers: frame, lock, battery, charger, QR,
  RFID, AirTag, fleet_number (customers' own numbering).
- `audit_log` table exists; apply triggers per-table as needed.
- **Product entity = `bike_templates`** (models/variants collapsed,
  migration 09). Size and color split:
  - **Frame size** is baked into the template — `Norma S` and `Norma L` are
    two separate templates, grouped by `bike_templates.family_id` →
    `bike_families` (controlled vocab, admin at `/admin/families`).
  - **Color** is picked at order time (`sales_order_line.color_id`) and at
    build time (`manufacturing_orders.color_id`). FK to controlled-vocab
    `colors` (carries `ral_code` + `coating`); never free-text.
  - Templates are versioned (`version` + `is_current`); the as-built BOM is
    snapshotted into `manufacturing_order_parts.origin` so editing a
    template doesn't rewrite history.
- **Two build paths**:
  - From a template — MO references `bike_template_id`, BOM expands from
    `bike_template_parts` into `manufacturing_order_parts`.
  - One-off / by-parts — MO has `bike_template_id = NULL`, parts list
    assembled by hand. Both paths consume inventory the same way.
- **Per-bike parts are the source of truth at build time.** `bike_parts`
  (one row per bike per part, with `inventory_movement_id`) records what was
  actually consumed for a specific bike. The MO recipe
  (`manufacturing_order_parts`) is just the default copied to `bike_parts`
  when the build starts.
  - The **build workbench** at
    `/manufacturing-orders/<mo>/bikes/<bike>/build` lets a tech edit the
    bike's parts before *Finish build* — it writes to `bike_parts`, never
    the MO recipe.
  - Bulk **"Mark X built"** calls `markBikeBuilt`: (1) lazily copies the
    recipe into `bike_parts` if empty, (2) calls `finishBikeBuild`, which
    consumes inventory per `bike_parts` row, stamps `bike.build_cost_dkk`,
    and transitions to `in_stock`. Same final code path either way.
  - **Batch build** (N identical bikes) splits shared work (parts = recipe)
    from per-bike-unique work (frame + identifiers):
    `/manufacturing-orders/<mo>/build-batch` (grid; `bulkBuildBikesWithIds`
    loops `confirmBikeFrame` → register identifiers → `markBikeBuilt`;
    blank-frame rows skipped, at-painter/duplicate/shortfall reported) and
    `/manufacturing-orders/<mo>/pick-list/print?n=N` (recipe × N grouped by
    kit bucket; soft-deleted parts excluded).
  - **Build gates**: `finishBikeBuild` requires `frame_number_confirmed`
    (flips only at the deliberate "Confirm frame" step — new bikes start
    with a provisional generated frame number) and blocks at-painter bikes.
    "At painter" is **derived** (bike ∈ service order with a blocking
    status via `src/lib/services/at-supplier.ts`), never a bike column. No
    silent MO auto-complete — completion is a one-click "Complete MO".
  - `bike_parts` rows with `inventory_movement_id IS NOT NULL` are frozen
    (qty / removal disallowed); pre-consumption rows are editable.
- **Paint is the first SERVICE TYPE in a generic external-services model.**
  Not a BOM line. One machine shared by painting / future washing / priming:
  - **Vocabulary + pricing layer**: `service_types` (w/ `blocks_build` —
    paint TRUE: bikes on a sent order are physically away and gate the
    build floor) · `service_part_types` (stel, forgaffel… 8 today) ·
    `service_price_lists` (PER SUPPLIER, one row per REVISION with its own
    CURRENCY, `is_current` flip like bike_templates — never edit-in-place) ·
    `service_price_items` (qty-tiered 1–9/10–19/20+, supplier item
    numbers). Pricing brain in `src/lib/services/pricing.ts`: tier basis =
    the part type's TOTAL qty on the order; colours share a tier. Tier
    overlaps are impossible (app validation + a btree_gist EXCLUDE
    constraint). New revisions publish via the atomic
    `publish_service_price_list` RPC; a partial unique index forbids two
    current lists.
  - **Order layer**: `service_orders` / `service_order_bikes` /
    `service_order_items` (part type × qty × nullable color_id). Status
    `planned → sent → at_supplier → received_back / cancelled`. Item lines
    editable while `planned` with LIVE estimates; **send freezes**
    supplier_item_no + unit_price + currency + fx_rate_to_dkk onto each
    line (the purchase_order_lines pattern) and is blocked while any line
    is unpriced. Libs: `src/lib/services/{vocab,status,at-supplier,pricing,
    template-paint}.ts`.
  - **Nav/routes are PER SERVICE TYPE, permanently** — "Paint orders" stays
    at /paint-orders; a future service type gets its own nav item; shared
    components parameterized by type, no unified list page.
  - **Template cost-to-paint**: `bike_template_service_parts` declares what
    one bike sends to the painter; priced live against the type's default
    supplier's current list (`service_types.default_supplier_id`); joins
    the recipe box: parts + paint → cost to produce → margin.
  - JP-lak service SKUs are retired (soft-deleted); demand/pick surfaces
    skip soft-deleted parts — there is no SKU-prefix exclusion convention.
- **Inbound is a generic trunk; voicemail is just the first channel.**
  `inbound_messages` (channel enum) with a normalized `body_text` that
  extraction + matching read EXCLUSIVELY (never the channel payload);
  `channel_meta` jsonb for channel-shaped data; a plain `ticket_id` action
  column (no polymorphic action framework until a second action type is
  real). Libs in `src/lib/inbound/` are channel-blind;
  `channels/voicemail.ts` owns transcription (providers via the registry
  pattern). Matching is deterministic code, not the model — attach a bike
  only if exactly one candidate survives; otherwise store candidates for
  the tech. Review queue at `/inbox` (Daily ops nav — a review queue, not
  admin config). Runs in prod in SHADOW MODE (`inbound_shadow_mode`);
  graduation criteria + next arc in `docs/plan-inbound-triage.md`. GDPR:
  recording announcement, media retention days in app_settings, EU
  residency.
- **People & roles (auth v0.5).** Four separated concepts — person / role /
  credential / assignment — across `people`, `roles`, `person_roles`,
  `role_capabilities`, `role_notifications` (capability/event keys
  validated against code registries in `src/lib/people/`). One scrypt
  password PER ROLE (the password IS the role selector); signed
  `{role, person}` cookie on top of the existing `fms_auth` gate; `can()`
  gates nav (via shared nav-items ids) / routes / dashboard bands; per-role
  `home_path` landing. Explicitly a **UX wall, not a security boundary**
  (perimeter stays Vercel SSO until M1; at M1 the role passwords die and
  the model survives — RLS policies get written against
  `role_capabilities`). Design: `docs/plan-people-roles.md`; build state:
  `docs/STATUS.md`.
- **Bike-to-customer assignment is intentionally overloaded** — no separate
  "slated_for" column. `bikes.owner_organization_id` is set in two
  conceptually distinct moments:
  - **Slating** during `planning` / `building` — earmark for a known
    customer. Status stays put.
  - **Delivery** from `in_stock` — physical handover; transitions
    `in_stock → assigned` (fires `trg_bikes_state_log`).
  - **Reassignment** from `assigned` / `in_service` — owner change in place.
  `assignBikeToCustomer()` blocks only terminal statuses and archived bikes;
  dialog copy flexes between "Slate" and "Assign". If this overloading ever
  bites (e.g. "intended" vs "delivered" customer for billing), promote to a
  separate `slated_organization_id` column.
- **Soft-archive convention is non-uniform** — three genuinely different
  concepts share the "hide from pickers" surface:
  - **`deleted_at` (soft delete)** — `parts`, `bikes`, `contacts`,
    `organizations`, `organization_units`, `suppliers`, `attachments`,
    `part_categories`. Existed and is gone; audit trail kept. Hide with
    `.is("deleted_at", null)`.
  - **`is_active` (controlled-vocab archive)** — `colors`, `vat_codes`,
    `hs_codes`, `bike_types`, `bike_identifier_types`, `bike_identifiers`,
    `customer_groups`, `customer_segments`, `inventory_locations`,
    `tax_identifier_types`, `bike_families`, `kits`. Still valid
    historically; hidden from new-entry pickers. Query `.eq("is_active", true)`.
  - **`is_current` (versioned)** — `bike_templates` and
    `service_price_lists`. Many versions, one current; past versions stay
    queryable so history keeps its recipe/prices. Unreferenced templates can
    be HARD deleted (deleting a current version promotes the newest
    surviving sibling).
  - Some tables (`organizations`, `suppliers`, `part_categories`) carry
    BOTH `deleted_at` and `is_active` — "archived" vs "deleted" are
    distinct lifecycles. Pickers read `is_active = true`; the archive UI
    sets both together.
  - **Transactional tables** (POs, MOs, SOs, invoices, work orders,
    inventory_movements…) have **no** soft-archive flag — status enums only.
  - **Reflex check before writing a query**: adding `.is("deleted_at", null)`
    on a table without that column makes Supabase silently return zero rows
    — bit us once (commit 98cef10).
- **Sales orders drive slating + delivery automatically.** SO
  `draft → confirmed` slates every unbuilt bike on linked MOs to the SO's
  customer; SO → `delivered` flips those bikes that are `in_stock` to
  `assigned` in one bulk write. Cancelling unslates still-unbuilt bikes;
  built ones stay slated (workshop unpacks by hand). New bikes added to an
  MO whose SO is past-draft inherit the slate at create time. Spawn-MO
  lives at `src/app/sales-orders/_actions/spawn-mo.ts`; v1 is one MO per
  template line (schema allows N).
- **Invoicing rules**: the INV number is allocated at issue (drafts carry
  `DRAFT-xxxx`); issued invoices are immutable — corrections are credit
  notes (full reversals, own `CRE-` series). Deposits (`invoices.kind`)
  and the prepayment model: see DECISIONS.md 2026-06-21.

## Internationalisation (whole-app Danish; both locales currently `en`)
- next-intl **without URL routing**. Locale comes from `app_settings`,
  resolved per surface: `src/middleware.ts` stamps `x-pathname`;
  `src/i18n/request.ts` maps worker surfaces (`/work`, `/scan`, build
  workbench + batch build — see `WORKER_PATH`) to `worker_language`,
  everything else to `app_language`. Messages in `messages/{en,da,de}.json`
  (`de` scaffolded, untranslated); missing keys deep-merge back to English.
- Every UI surface and server-action error string is swept. New code must
  follow: UI strings via namespaced messages; action errors localized AT
  THE SOURCE via the flat `errors` namespace
  (`getTranslations("errors")` → `t("key")` / `t("key", { detail })`).
  Only human-authored literals — verbatim DB/API messages ride along as
  `{detail}`.
- Enum labels are message namespaces (`bikeStatus`, `moStatus`, `poStatus`,
  …): `t(status)` with a `t.has(status)` guard. The old `*Label()` helpers
  are unused — don't reintroduce them (deletion queued in BACKLOG.md).
- Controlled-vocab names render via `localizedName(locale, en, da)`
  (`src/i18n/vocab.ts`) — never raw `name_en` on a translated surface.
- Deliberately English: `parts.name_en` / template / family names, org
  identity, `hs_codes.description`, kit sticker colours, `countries` lib.
  Per-document language (not UI locale): invoice print (per
  `invoices.language`), PO print (always English — supplier-facing), the
  public `/b/[bikeId]` + `/report` flow.
- Go-live = flip `app_language` / `worker_language` to `da` in app_settings.
  Sweep history: `docs/archive/i18n-danish-sweep.md`.

## Conventions
- **Git workflow: commit on `main` and push to `origin` every time.** No PRs,
  no feature branches, no waiting to push. Solo-dev shop; speed beats
  process here.
- **Pre-commit hygiene (TODO — not enforced):** `tsc --noEmit` +
  `next build` are necessary but not sufficient — they miss RSC boundary
  violations and other runtime-only failures (lesson: commit fa1dbed).
  Until the CI pipeline exists (BACKLOG.md), manually smoke-test new routes
  in the browser before declaring a phase done.
- Server-render initial page, client components for interactive state.
- URL search-params drive list filters (filtered views are shareable links).
- shadcn/ui components by default; custom only when shadcn lacks it.
- **shadcn style is `radix-nova`** — composition uses Radix `Slot` and
  `asChild` (`<Button asChild><Link…/></Button>`). Do NOT re-init shadcn
  fresh; recent CLI defaults pick `base-nova` (`@base-ui/react`, `render`
  prop), which won't compose with the existing components.
- Sentence case in UI text — never Title Case, never ALL CAPS in headings,
  buttons, or body copy. **Accepted exception:** "eyebrow" micro-labels
  (KPI captions, `dt` field labels, legend headers) rendered ALL CAPS via
  CSS (`uppercase tracking-wide text-xs`) are a design token — keep the
  underlying string sentence-case; don't "fix" these.
- **Primary action buttons + empty-state CTAs use "New X"** (e.g. "New
  part", "New MO") — not "Add X" or "Create X".
- **Navigation / IA (set with owner 2026-06-20).** Left nav grouped with
  hairline separators, most-used first: *Dashboard* · *Daily ops* (Bikes ·
  Bike templates · Parts · Maintenance · Inbox · Workshop floor) · *Orders &
  commercial* (Manufacturing orders · Purchase orders · Sales orders · Paint
  orders · Invoices · Service agreements · Customers) · *Admin*.
  - Both navs render from the shared `src/components/nav-items.ts` — add or
    move items THERE so desktop sidebar and mobile drawer can't drift.
  - The customer **Map** (`/organizations/map`) is not in the sidebar — it
    lives on the **Admin** landing page (`src/app/admin/page.tsx`), whose
    tiles are grouped into tinted section cards: *Catalog & inventory* ·
    *Purchasing & landed cost* · *Customers* (incl. Map) · *System*.
- **Section-tint hue vocabulary.** Pages that stack *different kinds* of
  sections (dispatch surfaces: `/invoices`, `/admin`, `/admin/settings`,
  ticket + agreement details) tint each section card; hues carry stable
  meaning app-wide — **sky = workshop/ops · emerald = customers/sales/
  communication · violet = agreements/system · amber = money/purchasing**.
  Class pattern: `border-{hue}-200/70 bg-{hue}-50/70
  dark:border-{hue}-900/40 dark:bg-{hue}-950/20` (shared `Section` takes
  `className`); inner tables/chips sit on `bg-background`. Do NOT tint
  homogeneous entity-detail or single-list pages — color is meaningful only
  while it's scarce. Two entity pages carry a partial tint (part detail, SO
  detail) because they genuinely stack foreign domains; section order =
  descending question frequency. Tech screens (workbench banners) don't use
  the tint vocabulary. Exception: the "Push to e-conomic" button wears
  e-conomic brand orange `#ef7d00` (hover `#e86807`) + the `EconomicMark`
  logo (destination branding, not vocabulary).
- Plan-then-build: before writing code, list files you intend to
  create/modify and wait for confirmation.
- Time estimates quoted as `~X human-dev-min (Y min wait)` — X is the
  human-developer-equivalent, Y is actual wall-clock waiting time.

## Known caveats / "good enough for now" decisions
- **Parts list pagination + stock filter** are in-memory in
  `src/app/parts/page.tsx`. Fine at small scale; past a few thousand rows,
  push down to SQL (extended view or RPC).
- **Pagination prev/next links don't preserve other filters** — thread
  `searchParams` through to `PartsPagination` or make it a client component.
- **MO stock coverage is per-MO** (`src/lib/manufacturing/coverage.ts`) —
  cross-MO competition for stock isn't modelled (same for /work readiness).
  Coverage, /work readiness, pick lists, and the build-time recipe copy all
  skip SOFT-DELETED parts (frozen history rows must not read as demand or
  get consumed).
- **PostgREST self-join embeds** (e.g. `invoices!credited_invoice_id`)
  resolve direction-ambiguously — fetch the other side with a second query.
- **JSX gotcha**: multi-line text after an `{expr}` can silently lose its
  leading space — write such row copy as one template literal.

## Local environment
- Env file is `.env.local` (leading dot — Next.js won't auto-load any other
  name); it's read at startup, not via HMR — **restart the dev server after
  editing**. The variable list, every external account, secret locations,
  backups, and the cold-start runbook live in **`docs/OPERATIONS.md`**.

## Domain vocabulary
- `jpNumber` — supplier's SKU (Eastek HK uses JP-prefix codes)
- `internal_sku` — our internal item code, also JP-prefix
- **Frame number** — unique per bike, primary physical identifier
- **Service agreement** — customer contract; if active, covered repairs are
  not invoiced
- **Customer segments** — Hospital, Municipality, Facility Management (FM),
  B2B, B2C, Hotel

## Out of scope for v1.0
- RLS policy tightening (RLS is ON across all tables — migration 50 — with a
  permissive `anon_all` policy; user-scoped replacements land with auth/M1,
  which is deliberately delayed — see docs/STATUS.md)
- Multi-tenancy (schema assumes a single bike shop)
- Materialized views (regular views; switch if movements exceed ~100k)
- Full-text search beyond the existing trigram indexes on `parts.name`
  and `organizations.legal_name`

## Migrations
Never modify SQL files that have already been applied. Add new ones with
sequential numbering and apply them through the Supabase SQL editor or via
`supabase db push` once the CLI is configured.

## Strategy escalation
Architectural questions ("should this be one table or two?", "how do we
model service-agreement billing?") get escalated to the human — these often
live in a separate planning chat on claude.ai. Tactical implementation
questions stay here. Decisions that come back get a DECISIONS.md entry.

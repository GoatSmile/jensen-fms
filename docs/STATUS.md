# Status — Jensen FMS

**Last updated: 2026-07-28.** Most recent: **harness doctrine only — no app
code changed.** The CLAUDE.md line-count hook is deleted and replaced by a
monthly consolidation read (DECISIONS 2026-07-28); two stale counts it could
never have caught were fixed. The session before it shipped design-refresh
Phase 2 (every list page on `Panel`) + Tier 1 CI — details below and in
`docs/archive/HISTORY.md`. Gates green as of `4956f76`: `tsc` clean, lint 0
errors (14 long-standing warnings), `npm run build` exit 0 / 52 static pages,
CI green.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
That applies to this header too: what shipped in earlier sessions belongs in
`docs/archive/HISTORY.md` and `docs/WORKLOG.md`, not in a growing parenthetical
here. History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`,
parked ideas in `docs/BACKLOG.md`.

## Where we are
- **v0.10.0+**, deployed on Vercel (push-to-`main` → prod), gated behind
  Vercel SSO. 78 migrations, single-tenant, solo-dev.
- **Operationally feature-complete** for the workshop's daily job: parts +
  categories + inventory ledger; suppliers + offerings; POs + additive frozen
  landed cost + email-to-supplier (test mode); bike templates (versioned,
  families); MOs + build workbench + batch build; bikes + lifecycle + QR;
  service orders (paint, on the generic external-services model); sales orders
  + slating automation; organizations/contacts/units + customer map;
  maintenance tickets + work orders; workshop floor (`/work`); invoicing 3D
  complete; e-conomic push (verified against a trial agreement); inbound
  voicemail + live-call recording → ticket pipeline **live in prod in shadow
  mode**; whole-app Danish i18n swept (locales still `en`).
- **People & roles P1–P4 shipped 2026-07-23** (migrations 73 + 74) — the interim
  system is complete. **No role passwords are set in prod**, so login behaviour
  is unchanged until they are, and P4 notifications stay in the test-mode
  reroute (nothing reaches real inboxes yet). Design in
  `docs/plan-people-roles.md`, mechanics in DECISIONS 2026-07-23.
- Inbound shadow-testing rides the US trial number **+1 762 500 0850**; Dennis's
  company number remains the production plan.
- **The July queue is complete** and its plan is archived. Owner-facing
  `docs/PLAYBOOK-AUGUST.md` covers Dennis's solo stretch from 3 Aug.

## The frame: CUTOVER is now what everything serves
`docs/plan-cutover.md` (working plan: stage ladder, risks, open decisions) +
`docs/CUTOVER-BRIEF.md` (Dennis's, English, hand-over ready).

- **Proposed transfer date: Mon 31 Aug** — one hard line after which no new work
  is recorded in Excel or on paper. Confirm or move it in Meeting 1.
- **Three meetings, week of 17 Aug**: workshop Mon 18th (reality check, agree
  the date) · Nazar's place Wed 19th (invoicing-parity workshop, revisor on the
  phone, restore rehearsal) · team session on transfer day.
- **Ladder, ordered by irreversibility**: internal ops → supplier email +
  phone → first real invoice → e-conomic. e-conomic is deliberately LAST.
- **Migrate almost nothing**: customers + bikes in the field only. Opening stock
  is a physical count on the morning, not a data task.
- Two things it surfaces that are not code: **Stage 3 trips the agreed M1-auth
  trigger** (first real invoice), and **every account is in the dev's name** —
  a backup on Dennis's NAS gives him data and code, not a running service.
- Off-site copy to Jensen's on-site NAS as an **AES-256 `.7z`** (the backup
  kit's sparsebundle is macOS-only, so a NAS can store it and nobody there can
  open it). Owner's call; runbook in the plan, to be rehearsed on the 19th.

## Design refresh — SHIPPED, with a known remainder
`docs/plan-design-refresh.md` **§14** is the authoritative "what shipped and
where this doc is now wrong" list. Decisions in DECISIONS 2026-07-26 +
2026-07-27. Mock-up
`docs/mockups/design-directions.html` is now history, not the target.

Live in prod: direction **B "Emalje"** in signal blue `#2E5FD1` (Geist kept, no
display face, pill buttons) · `Panel`/`Metric`/`Rule` primitives with `Section`
re-exporting `Panel` · 517 raw palette colours swept onto six hues across 79
files · **seven grouped nav items** with `nav_open` cookie state resolved
server-side · both boxed KPI rows killed · the **`/admin/settings` sub-rail**
(five sections, `?section=`; 48 form controls rendered at once before, 5 on
arrival now) · three of the four audit bugs.

- **The colour vocabulary is now in CLAUDE.md and is load-bearing.** Six hues,
  closed list. Two rules that are easy to get wrong: **caution is `money`'s
  ochre, not `alert`** (red is reserved for genuine alarms — mapping cautions to
  red painted normal progress red), and **`text-on-{hue}` on any filled hue**,
  never `text-white`. Two decorative palettes are exempt
  (`bike-templates/family-colors.ts`, `kits/colors.ts`).
- **Contrast is measured, not eyeballed.** All **78** fg/bg pairs clear AA per
  theme — including every hue on every *foreign* wash, since a `hue` panel lets
  any two meet. The ink ramp is DARKER than the mock-up's in light and LIGHTER
  in dark, because secondary text now sits on washes, where the mock-up's
  values failed. If you touch a hue, re-measure the whole matrix, not just
  hue-on-its-own-wash — that narrower check passed while three cross pairs
  were failing.
- **Dark mode is unreachable** — no theme provider, no `prefers-color-scheme`
  wiring, so `.dark` is never applied. Tokens are complete and measured anyway;
  a toggle was deliberately not built. If one lands, it should just work.
- **The remainder — card soup is dented, not cleared.** Phase 2 ran five
  slices on 2026-07-27 (see below). Across `src/**/*.tsx`: `rounded-md border`
  occurrences **298 → 208**, dashed **46 → 28**, files with any hand-rolled
  bordered surface **184 → 156**. The counting method differs from the audit's
  345/187 (and drifts a little between sessions), so trust the delta, not the
  absolute. The rest inherit B's tokens so they read as *plainer*, not broken.
  **Every list page is now on `Panel`.** What is left is concentrated in
  **forms and detail sections** — `mo-batch-form`, `build-workbench`,
  `paint-from-so-form`, the sales-order lines section, contacts/units,
  `admin/people`, `admin/fx-rates`, and the six entity forms' own
  `<section className="rounded-md border">` shells. Also still open: the
  `/admin/lists` consolidation (18 routes → 1), the floor/office mode split
  (§6 — still the highest-value structural idea nobody has built), and §9's
  repeated category chips. Full list in plan §14.
- **Turbopack bit once during this work**: the served CSS had new light-theme
  values with stale dark ones. `rm -rf .next` + restart, not code debugging.

## Shipped 2026-07-27 — design-refresh Phase 2, five slices + verification
Narrative and commit refs in `docs/archive/HISTORY.md`; the ten decisions in
`docs/DECISIONS.md`. **The durable rules all live in `CLAUDE.md`** (panel-table
convention, `bg-ground` is in-panel only, no value imports from a `"use client"`
module, folded sections lose native validation, net-14 payment terms). What a
fresh session needs beyond those:

- **Slices 1–4**: `/inbox` + `/bike-templates` onto `Panel`; the panel-table
  convention applied app-wide (zero boxed tables inside a panel); §9's form
  folds (`src/components/form-section.tsx`, shared by organisation / part /
  supplier — a section's default is computed from the record, never
  remembered); §9's inbound provider summary rows. **Plan §9 is closed except
  the category chips.**
- **Slice 5**: every list page is on `Panel` (eleven surfaces), plus the shared
  `TableSkeleton`, the PO receive form + lines section, and the batch-build
  grid.
- **The verification pass** ran eight checks against the production DB in a
  browser. Five passed untouched; four findings were fixed forward, the largest
  pre-existing and much older than Phase 2 — `EMPTY_*` shells spread in server
  pages evaluated to `{}`, so five create forms had been shipping blank
  defaults (fixed at all 20 forms). **No revert was needed.**
- **Owner-visible behaviour change**: a new customer now pre-fills payment terms
  of 14 days, not 30. Net 14 is the schema default, what invoicing uses, and
  what 531 of 535 existing customers hold.
- **Tier 1 CI is live** — `.github/workflows/ci.yml`, `npm ci` → `tsc` →
  `lint` on every push, green since `e765bdc`; the 14 lint warnings show as run
  annotations. Next 16 does **not** run ESLint during `next build`, so this is
  the only thing catching that class before prod. **Pinned to Node 24 / npm 11
  on purpose**: npm 10 rejects our lock file, and a CI failure naming
  `@swc/helpers` is the pre-existing tree inconsistency in `docs/BACKLOG.md`,
  not your code.

**Three things real data cannot verify** (so they have only ever been seen with
stub props): no bike template has paintwork rows; **all 25 bikes were
soft-deleted 2026-07-01**, so `/bikes` is empty by design, not broken, and both
bike-detail empty states and the batch-build grid are unexercised; and no
inbound message is spam-flagged, so that banner's `money` hue is code-verified
only.

## Next actions, in order
1. **Walk the rest of the app with fresh eyes before 3 Aug** — whether the six
   hues still read as a system across a whole working session rather than
   screen by screen.
2. **Chase the external blockers** in cutover plan §7 (revisor in one
   conversation with four questions; `orders@valent.dk`; e-conomic production
   token; company CVR/bank/address).
3. **First session of August: consolidate `CLAUDE.md`** — step 3 of
   `/session-start`. Read it end to end for rules that contradict each other
   and counts that have drifted. **This is now the only instrument pointing at
   that file**; the line-count hook was deleted 2026-07-28 on the grounds that
   it never refused anything, so if this pass slips, the trade becomes "removed
   the gate, kept nothing". The file is 537 lines and the honest reduction is
   extracting narrative to `docs/archive/HISTORY.md` — **never deleting a
   rule.**

### The Phase 2 queue, in the order it is worth taking
Nothing here needs owner input except where noted.
1. **The forms and detail sections** — the rest of the ~156 files, now that the
   list pages are done: `mo-batch-form`, `build-workbench`,
   `paint-from-so-form`, the sales-order lines section, contacts/units,
   `admin/people`, `admin/fx-rates`, and the six entity forms' own
   `<section className="rounded-md border">` shells. Same mechanical shape as
   the fifth slice; the form shells are the `FormSection`/`Panel` pattern that
   already exists.
2. **§9's repeated category chips** — the last §9 line, small.
3. **`/admin/lists` consolidation** (18 routes → 1) — **ask first.** It
   changes IA Dennis navigates by.
4. **Floor/office mode split** (plan §6) — **ask first**, and not before
   31 Aug. Highest-value structural idea in the plan, and the largest.

## Waiting on (external)
- **e-conomic production agreement** grant token — expected ~end of July.
  Then: re-run Test connection, confirm journal / revenue account 1010 /
  U25 / payment terms with the revisor, then the first real push.
- **`orders@valent.dk`** alias (or catch-all) in Google Workspace — direct
  replies to PO emails bounce until it exists.
- **Supplier emails** — 18 still blank (dashboard housekeeping card).
- **Revisor nods pending**: weighted-avg stock valuation + deposit VAT
  timing (before the first real prepayment invoice); e-conomic config
  numbers (before the first real push).
- **Owner data entry** (debts below) + fill the CVR/bank/address
  placeholders in `src/lib/invoicing/company.ts` before the first real
  invoice (the print page warns until then).

## Deferred to mid-August with Dennis (agreed 2026-07-17)
Old-system data migration · invoicing-parity workshop + "paid" remark on
the e-conomic voucher · role-matrix refinement (against the people-roles
model) · e-conomic production cutover · supplier-email go-live (untick
`outbound_test_mode`) · leave-shadow-mode graduation · voice commands VC-3 ·
Dennis's company number onto the inbound trunk.

## Landmines
- **The commit gate was inert for `git add … && git commit` one-liners**
  (found + fixed 2026-07-27). `gates.sh` is a PreToolUse hook, so it runs
  BEFORE the command: with that idiom the index is still empty when it looks,
  and `[ -z "$staged" ] && exit 0` skipped tsc, lint, tests and build entirely.
  Two React-rule lint errors reached main through it. Fixed — the hook now
  detects a pending `git add` and decides the docs-only skip from the dirty
  tree. **Still true regardless: the gate skips `npm run build` whenever a dev
  server holds :3000**, and that is the class tsc and lint both miss (RSC
  boundary violations). Stop the dev server and build before trusting a run of
  commits. Tier 1 CI (2026-07-27) now re-runs tsc + lint on every push, so a
  skipped local gate no longer means *nothing* checked — but CI does not build.
- **A green toolchain does not mean the page works.** Twice on 2026-07-27:
  `tsc`, `lint` and `next build` were all clean while five create forms had
  been shipping blank defaults for weeks (the client-reference shell bug), and
  again while a page-level notice rendered as invisible text (`bg-ground` on a
  ground background). Both rules are in CLAUDE.md now. This class only shows up
  in a browser, against real data.
- **The publishable/anon key is a DB master key — keep it out of the
  browser.** anon_all RLS (migration 50) means the anon key can read/write
  every table. It's safe today ONLY because nothing browser-side references
  it (`src/lib/supabase/client.ts` is unimported dead code). The instant any
  `"use client"` component imports that client — or any `@supabase/supabase-js`
  browser client — the key inlines into public JS app-wide and becomes a live
  critical exposure on `/b` + `/report`. All browser data access must go
  through server components / server actions (`src/lib/supabase/server.ts`).
  This resolves at M1 when user-scoped RLS replaces anon_all. (Perimeter
  audit 2026-07-23; guardrail header in `client.ts`.)
- **Before switching e-conomic tokens to production**: any
  `organizations.economic_customer_number` /
  `invoices.economic_voucher_id` / `economic_synced_at` stamped against the
  TRIAL agreement refer to trial entities and must be cleared first.
  Currently NONE exist — keep it that way (don't push real invoices to the
  trial).
- `outbound_test_mode` is the only thing between "Email supplier" and real
  supplier inboxes — verify it before demoing send flows.
- Both locales sit at `en`; if a surface suddenly renders Danish, someone
  flipped `app_settings` — that's the go-live switch, not a bug.

## Data-entry debts (owner/admin, not code)
Self-serve via the dashboard "Data housekeeping" fold:
- **Every part has `origin = NULL`** → new PO lines default to NO import tax
  (`import_tax_basis = 'unclassified'`) until origins are set on the part
  edit form. Classifying the China-sourced fast movers as `non_eu` restores
  tariff-by-default where it matters.
- **5 parts lack an HS code**: `JP-AND-M100-PWR`, `JP-AND-M100-CS`,
  `JP-AND-DSP-NTC`, `JP-SLFFH01B`, `JP-SP207- 27,2 350` — they snapshot 0 %
  tariff until classified. TARIC note: the customs broker (DA Custom
  Brokers) files some parts under favourable "for cycle manufacture" splits
  (e.g. 8714911077, 8714913072, 8714961010) to dodge the 48.5 %
  anti-dumping; our classification uses the standard splits — confirm with
  the broker before reclassifying. Anti-dumping (48.5 %) is set on
  8714963090 + 8714991099; it's origin-agnostic — fine while sourcing is
  ~all China.
- **Supplier offerings mostly lack `default_purchase_price`** → drafted POs
  land at 0 kr. with a "set price before placing" note.
- **No part has `reorder_point` / `reorder_quantity`** → the `/parts`
  reorder banner stays hidden until the owner fills them in.
- **Supplier country codes** were name-inferred (migration 25): Herrmans→FI,
  RYDE→NL, SAPIM→BE, Shimano Nordic→SE, MessingschKG→DE are best-guesses
  worth confirming.

## Standing "not now" decisions (reasons in docs/DECISIONS.md)
- **M1 auth + RLS tightening — DELAYED (owner's call).** RLS is ON across
  all tables (migration 50) with a permissive `anon_all` policy; only
  Vercel SSO protects prod. Do not start unless the owner re-prioritises.
  Agreed trigger to reconsider: **the first real invoice issued**. When it
  resumes: Supabase auth + login + middleware + user-scoped policies
  (written against `role_capabilities`) + a `DEV_AUTH_BYPASS` escape hatch;
  open decisions: sign-in method, role-model refinement.
- **CI Tier 2 (runtime routes + Vitest over the actions)** — parked; needs the
  Supabase env vars as repo secrets, so it lands alongside auth/M1 (details in
  `docs/BACKLOG.md`). Tier 1 (tsc + lint on push) shipped 2026-07-27.
- **Sales track** (configurator + lead-gen) — parked by the owner; earliest
  next year (`docs/BACKLOG.md`).

# Status — Jensen FMS

**Last updated: 2026-07-26, end of day.** Most recent: the **design refresh is
built and live in prod** — direction B in signal blue, surface primitives, the
517-colour sweep and the seven-group nav all shipped so Dennis meets the new
look when he returns **Mon 3 Aug**. Earlier the same day: cutover plan + owner
brief, sales-lead drafting, live model picker.

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
where this doc is now wrong" list. Decisions in DECISIONS 2026-07-26. Mock-up
`docs/mockups/design-directions.html` is now history, not the target.

Live in prod: direction **B "Emalje"** in signal blue `#2E5FD1` (Geist kept, no
display face, pill buttons) · `Panel`/`Metric`/`Rule` primitives with `Section`
re-exporting `Panel` · 517 raw palette colours swept onto six hues across 79
files · **seven grouped nav items** with `nav_open` cookie state resolved
server-side · part detail's boxed KPI row killed · three of the four audit bugs.

- **The colour vocabulary is now in CLAUDE.md and is load-bearing.** Six hues,
  closed list. Two rules that are easy to get wrong: **caution is `money`'s
  ochre, not `alert`** (red is reserved for genuine alarms — mapping cautions to
  red painted normal progress red), and **`text-on-{hue}` on any filled hue**,
  never `text-white`. Two decorative palettes are exempt
  (`bike-templates/family-colors.ts`, `kits/colors.ts`).
- **Contrast is measured, not eyeballed.** All 37 token pairs clear AA in both
  themes. The ink ramp is DARKER than the mock-up's in light and LIGHTER in
  dark, because secondary text now sits on washes, where the mock-up's values
  failed. Re-measure on the washes, not just on the ground, if you touch it.
- **Dark mode is unreachable** — no theme provider, no `prefers-color-scheme`
  wiring, so `.dark` is never applied. Tokens are complete and measured anyway;
  a toggle was deliberately not built. If one lands, it should just work.
- **The remainder, honestly**: ~140 files still hand-roll `rounded-* border`
  surfaces. They inherit B's tokens so they read as *plainer*, not broken — that
  property is what made truncating safe. `/admin/settings` (7 domains, ~40
  controls, 6 raw `<section>`s), `/admin/lists` consolidation, the settings
  sub-rail, the floor/office mode split, and form folds are all untouched. Full
  list in plan §14.
- **Turbopack bit once during this work**: the served CSS had new light-theme
  values with stale dark ones. `rm -rf .next` + restart, not code debugging.

## Shipped this session
- **The design refresh, built and live** — see the section above and plan §14.
  Seven commits: audit bugs · tokens + vocabulary · brand assets · primitives ·
  colour sweep · grouped nav · KPI row + ink ramp.
- **Three real audit bugs fixed, one retired as a misdiagnosis.** All-clear
  dashboard messages no longer render in red/amber; the mobile header uses the
  lettermark instead of an illegible 20px lockup; text on a filled accent got
  per-theme tokens. The Scan-FAB-over-Collapse bug **does not exist** — the FAB
  is `md:hidden` and the sidebar `hidden md:flex`; the audit saw the Next.js
  dev-tools badge.
- **`StatCard` deleted** (no callers anywhere) and the hue→fill map
  de-duplicated. `Section` is now a re-export of `Panel`.
- **Earlier the same day** (morning session): lint into the commit gate with the
  4 genuine errors fixed; sales-lead drafting from an `order_inquiry` via the
  VC-1 command agent (P1 follow-up date/owner deliberately NOT built); model
  selection as a live discover-or-type picker with `inbound_extraction_model` =
  **`claude-sonnet-5`** in prod; a docs audit that corrected six repo
  contradictions, backfilled HISTORY for 07-23 → 07-25, removed the unused
  Trello integration, pruned `settings.local.json` 171 → 17 (so **a migration
  now shows its SQL in a prompt before it runs**), and added the
  `worklog-row-budget` + `worklog-session-check` hooks. Only the DECISIONS
  same-commit rule is still honour-system.

## Next actions, in order
1. **Look at the shipped refresh with fresh eyes before 3 Aug** and decide
   whether any of the remainder is worth doing while Dennis is still away. The
   two highest-value items: the **dashboard money band** (interpolated amounts
   inside 12px uppercase panel titles render "…2.000,00 KR."; the amount wants
   to be a figure, not part of the eyebrow) and **`/admin/settings`**, still the
   most overwhelming screen in the app.
2. **Chase the external blockers** in the cutover plan §7 (revisor in one
   conversation with four questions; `orders@valent.dk`; e-conomic production
   token; company CVR/bank/address).
3. **Phase 2 proper — after 31 Aug**: surface primitives across the remaining
   ~140 files, then the floor/office mode split (plan §6), which is still the
   highest-value structural idea nobody has built.

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
- **CI smoke-test pipeline** — parked; build alongside auth (details in
  `docs/BACKLOG.md`).
- **Sales track** (configurator + lead-gen) — parked by the owner; earliest
  next year (`docs/BACKLOG.md`).

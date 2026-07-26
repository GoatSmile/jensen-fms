# Status — Jensen FMS

**Last updated: 2026-07-26, end of day.** Most recent: the **design direction is
locked** (B "Emalje" in Geist, grouped nav with remembered state), the **cutover
plan + owner brief** are drafted for the 17–21 Aug sessions with Dennis, and the
**sales-lead dead end is closed** plus model selection became a live picker.

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

## Design refresh — direction locked, not yet built
`docs/plan-design-refresh.md` + live mock-up
`docs/mockups/design-directions.html` (Current vs B, three pages, 14-flat vs
7-group nav, light + dark).

- **Locked**: Direction **B "Emalje"** — colour / shading / flat-fill system with
  pill buttons. Direction A rejected. **Keep Geist, no display face.** Keep the
  "Ægte Jensen · KVALITETSCYKLER" wordmark. **Seven grouped nav items.**
- **Group open/closed state is remembered per person** — independent toggles,
  **not** an accordion (an accordion would undo the setting on the next click).
  **Persist in a COOKIE, not localStorage**: the sidebar renders server-side, so
  localStorage means a layout shift on every navigation. Absent cookie (→ code
  defaults) must stay distinct from empty cookie (→ deliberately all closed).
- **Sequencing against the cutover.** Only **15 of 187 files** use the shared
  `Section`; 159 hand-roll `rounded-* border` (345 occurrences), and shadcn
  `Card` is imported zero times. Tokens propagate; structure does not. So:
  **Phase 1 = tokens + the four shared dashboard components + rail restyle**
  (one day, ~one file, revertable) is safe before Dennis. **Phase 2 = surface
  primitives + the 159-file migration is a September project** — do NOT attempt
  it before 31 Aug. Phase 3 = grouped nav, `/admin/lists`, settings sub-rail.
- **Still open**: B's accent is signal blue `#2E5FD1` vs today's navy `#1e4a7a`
  — adopting it touches `themeColor`, the PWA splash and the icons, so it is a
  brand call. And colour governance needs one written owner before Phase 2.
- **When Phase 1 lands, CLAUDE.md's section-tint hue vocabulary (sky/emerald/
  violet/amber) must be replaced** by B's six hues — the two must not coexist.
  CLAUDE.md is deliberately unchanged until then, because it still describes
  what the code does.

## Shipped this session
- **Sales leads no longer dead-end (P2).** An `order_inquiry` in `/inbox` gets
  "Draft from this call" → `planFromInquiry` phrases the call as a staff task →
  the VC-1 command agent proposes draft customer / sales-order actions → the
  same CommandPlanPanel reviews and applies them. Writes only `command_plan`
  (status/error/processed_at belong to extract → match → triage) and carries the
  same re-plan lock as `rerunCommandAgent`, since plan action ids are positional.
  Verified on the real 0.37-clarity Gladsaxe call. **P1 (follow-up date + owner
  on a lead) was NOT built** — deliberately deferred, so a lead still relies on a
  human acting on the plan.
- **Model selection is discover-or-type.** `src/lib/inbound/models.ts` lists the
  live catalogue (`GET /v1/models`), the admin picks or types, and **Test**
  proves it with a real forced tool-use call. `inbound_extraction_model` =
  **`claude-sonnet-5`** in prod, driving BOTH extraction and the command agent
  (the proposed second setting was rejected as premature). Aliases sort above
  dated snapshots on purpose.
- **Lint is now in the commit gate** (morning session), with the 4 genuine
  errors fixed and the SSR/RSC noise silenced.

## Next actions, in order
1. **Fix the dark-mode contrast bug** — `--primary-foreground` stays near-white
   in both themes while `--primary` flips lightness: `#FAFAFA` on `#3F96D9` =
   **3.07:1**, below WCAG AA. Every dark-mode primary button, active nav item and
   filled badge is failing *today*. Two-line token fix, independent of the
   redesign. Plus the other three bugs in `plan-design-refresh.md` §11 (Scan FAB
   overlaps the sidebar Collapse control; `AttentionCard` renders all-clear
   messages in red/amber; the logo is illegible in the mobile header).
2. **Decide the accent** (navy vs B's blue) — gates Phase 1.
3. **Phase 1 design tokens** — before Dennis sees this version.
4. **Chase the external blockers** in the cutover plan §7 (revisor in one
   conversation with four questions; `orders@valent.dk`; e-conomic production
   token; company CVR/bank/address).

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

# Status — Jensen FMS

**Last updated: 2026-07-28.** Most recent: **design-refresh Phase 2 slices
A–E** — four commits (`85b668a`, `843a4dd`, `1293bb5`, `38b6eae`) that took the
remaining card soup out of the forms, detail sections, dialogs and `/work`, and
found that most of it was *duplication* rather than styling. Both "ask first"
gates on the queue are now cleared by the owner (DECISIONS 2026-07-28). Gates
green as of `38b6eae`: `tsc` clean, lint 0 errors (14 long-standing warnings),
`npm run build` exit 0, CI green.

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

## Design refresh — Phase 2 essentially done; slice F is what's left
`docs/plan-design-refresh.md` **§14** is the authoritative "what shipped and
where this doc is now wrong" list; **§15** holds the build plans for the two
newly-approved items. Decisions in DECISIONS 2026-07-26 / -27 / -28. Mock-up
`docs/mockups/design-directions.html` is history, not the target.

Live in prod: direction **B "Emalje"** in signal blue `#2E5FD1` · `Panel` /
`Metric` / `Rule` primitives · six hues, closed list · **seven grouped nav
items** with `nav_open` cookie state · the `/admin/settings` sub-rail · every
list page, detail section, admin form and dialog on `Panel`.

- **The remaining card soup was mostly duplication.** Three clusters, each
  identical down to the class list, are now one component each — and a new copy
  of any of them is a regression: `FormSection` (six local copies),
  `ArchivePanel` (seven), `FormSaveBar` (eight). They are listed in CLAUDE.md's
  Conventions so a fresh session reaches for them.
- **A `rounded-md border` is NOT automatically card soup.** Nine of the last
  sweep's hits are native `<select>` / `<input>` elements styled to match
  shadcn's `Input`; plus print routes, photo-thumb frames and button groups.
  Those borders belong to the control. **The count will never reach zero and
  should not be driven there** — read each hit before changing it.
- **Contrast: a destructive control constrains the surface under it.** The
  archive footer's caution wash measured 4.25:1 behind its destructive button
  against the 4.5:1 gate, so it ships untinted. And when measuring a
  *translucent* pill, composite it on a canvas and read the pixel —
  `getComputedStyle` hands back an un-normalised `oklab()` and hand-parsing it
  produces confident wrong numbers (it did, twice).
- **Zero raw Tailwind palette colours remain** outside the two exempt
  decorative palettes (`bike-templates/family-colors.ts`, `kits/colors.ts`).
  `/work`'s four accent bars were the last, and they were never deliberate
  exceptions — the original sweep's pattern just missed `border-l-*`, `from-*`
  and `fill-*`.
- **Dark mode is unreachable** — no theme provider, no `prefers-color-scheme`
  wiring, so `.dark` is never applied. Tokens are complete and measured anyway;
  a toggle was deliberately not built. If one lands, it should just work.
- **Turbopack bit once during this work**: the served CSS had new light-theme
  values with stale dark ones. `rm -rf .next` + restart, not code debugging.

**Three things real data cannot verify** (so they have only ever been seen with
stub props): no bike template has paintwork rows; **all 25 bikes were
soft-deleted 2026-07-01**, so `/bikes` is empty by design, not broken, and both
bike-detail empty states and the batch-build grid are unexercised; and no
inbound message is spam-flagged, so that banner's `money` hue is code-verified
only. Add to that: **the archive/restore round trip has never been clicked** —
there is one Supabase project and no staging copy, so exercising it flips
`is_active` in production.

## Next actions, in order
1. **Walk the rest of the app with fresh eyes before 3 Aug** — whether the six
   hues still read as a system across a whole working session rather than
   screen by screen. Judgement, not mechanics, and it is the one item with a
   date pressing on it.
2. **Chase the external blockers** in cutover plan §7 (revisor in one
   conversation with four questions; `orders@valent.dk`; e-conomic production
   token; company CVR/bank/address).
3. **Next `CLAUDE.md` consolidation: first session of September** — step 3 of
   `/session-start`, and the only instrument pointing at that file now the
   line-count hook is gone. The 2026-07-28 pass found what no counter could
   (a nav IA bullet describing a superseded layout two days after the refresh
   shipped). The honest reduction is extracting narrative to
   `docs/archive/HISTORY.md` — **never deleting a rule.**

### The design-refresh queue, in the order it is worth taking
1. **Slice F — the behaviour-carrying workbenches.** Deliberately last:
   `build-workbench` (11 bordered surfaces), `mo-batch-form` (7),
   `add-parts-workspace` (7), `paint-from-so-form`, `deposit-form`, `scanner`,
   the build `pick-list`. These carry scan handlers and per-row inputs on
   workshop-critical screens, so it is **one file per commit, browser-verified
   individually** — not a batch. Two of them cannot be exercised against real
   data (see above), which is the main reason to go slowly.
2. **`/admin/lists`** (18 routes → 1) — **approved 2026-07-28**, build plan in
   plan §15. Not a sweep: the six vocabularies' fields genuinely differ, so it
   needs a descriptor layer, and the entity-specific archive copy needs a home
   in a row-based UI.
3. **Floor/office mode** (plan §6) — **approved 2026-07-28 but deliberately
   NOT before 31 Aug.** Largest item in the plan, and it reshapes the screen
   mechanics use daily; do not ship it into Dennis's solo stretch. Build plan
   and the contrast-re-measurement requirement in plan §15.

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
- **Blanket `git add -A` is blocked by a hook** and should stay blocked: it once
  swept an unrelated change into a docs commit, and push-to-`main` deploys.
  Stage explicit paths; `git status` first.
- **A green toolchain does not mean the page works.** Four times in three days
  now: five create forms shipping blank defaults (the client-reference shell
  bug), a page-level notice rendering as invisible text (`bg-ground` on a ground
  background), a contrast gate failure behind a destructive button, and
  `bg-ground` chips inside hue-washed panels. All four were found in a browser
  against real data, with `tsc`, `lint` and `next build` clean.
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
  Agreed trigger to reconsider: **the first real invoice issued.** When it
  resumes: Supabase auth + login + middleware + user-scoped policies
  (written against `role_capabilities`) + a `DEV_AUTH_BYPASS` escape hatch;
  open decisions: sign-in method, role-model refinement.
- **CI Tier 2 (runtime routes + Vitest over the actions)** — parked; needs the
  Supabase env vars as repo secrets, so it lands alongside auth/M1 (details in
  `docs/BACKLOG.md`). Tier 1 (tsc + lint on push) shipped 2026-07-27.
- **Sales track** (configurator + lead-gen) — parked by the owner; earliest
  next year (`docs/BACKLOG.md`).

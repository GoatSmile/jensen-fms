# Status — Jensen FMS

**Last updated: 2026-07-29.** Most recent: **Slice F is done — the design refresh
has no card soup left to migrate.** Seven behaviour-carrying files, one commit
each, each browser-verified against real data; two pre-existing `scanner` bugs
found and fixed on the way (see below). Also today: **service part types became
the 8th `/admin/lists` tab**, **the paint estimate stopped substituting a
supplier's price list** and the default supplier is now set with "Make default" on
a price-list panel, and **`/admin/lists` replaced 18 vocabulary routes**. Gates
green throughout: `tsc` clean, lint 0 errors (14 long-standing warnings),
`npm run build` exit 0 with the dev server stopped each time.

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

## Design refresh — COMPLETE except floor/office mode
`docs/plan-design-refresh.md` **§14** is the authoritative "what shipped and
where this doc is now wrong" list; **§15** holds the build plans for the two
newly-approved items — **§15's `/admin/lists` plan is now marked shipped, with
the four ways it was wrong.** Decisions in DECISIONS 2026-07-26 / -27 / -28 /
-29. Mock-up `docs/mockups/design-directions.html` is history, not the target.

Live in prod: direction **B "Emalje"** in signal blue `#2E5FD1` · `Panel` /
`Metric` / `Rule` primitives · six hues, closed list · **seven grouped nav
items** with `nav_open` cookie state · the `/admin/settings` sub-rail · every
list page, detail section, admin form and dialog on `Panel` · **`/admin/lists`,
one page for EIGHT controlled vocabularies** (18 routes retired to it; service part
types added 2026-07-29) · **every Slice F workbench** — build workbench, batch
form, add-parts, pick list, scanner, deposit and paint-from-SO forms.

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
- **Elevation is for floating surfaces only.** `--popover` IS `--surface`, so a
  dropdown over a white `Panel` measured **1.000:1** with a 1.225:1 hairline as
  its whole edge. All five overlay primitives now wear `shadow-popover`
  (`--elevation-popover`, per theme). Never put it on an in-flow panel. Chasing
  WCAG 1.4.11's 3:1 on the edge was rejected — it needs ~`#949494` around every
  dropdown, and the list items carry the information, not the container.
- **Verify soft edges at a 1:1 viewport.** Screenshots come back downscaled to
  800px, which flattens shadows — the DOM/computed-style method that caught the
  contrast failure and the wrong chip fills is BLIND to this class, and that is
  how the 1.000:1 dropdown survived four commits of checking. Set an 800px
  viewport for anything shadow- or edge-related.
- **Dark mode is unreachable** — no theme provider, no `prefers-color-scheme`
  wiring, so `.dark` is never applied. Tokens are complete and measured anyway;
  a toggle was deliberately not built. If one lands, it should just work.
- **Turbopack bit once during this work**: the served CSS had new light-theme
  values with stale dark ones. `rm -rf .next` + restart, not code debugging.

**What real data still cannot verify** (narrowed 2026-07-29): no bike template
has paintwork rows — though the paintwork section and its no-price messages WERE
exercised on 2026-07-29 with a temporary row on Norma CS (since deleted), so the
surface is no longer unseen, only unpopulated — and no inbound message is spam-flagged, so that banner's
`money` hue is code-verified only. **`/bikes/new` has still never been
submitted** — its owner-required and status-whitelist branches are read, not
posted.

Three items came OFF this list on 2026-07-29:
- **`/bikes` is no longer empty.** The owner added bikes, and MO-2026-0015 carries
  four in `planning` (`JP-2026-E_BIKE-034`–`037`, White, frames unconfirmed,
  notes marked TEST DATA, safe to cancel). **The batch-build grid has now been
  seen with real data** — four rows, provisional frame numbers as PLACEHOLDERS
  not values (so "Build 0 bikes" is correct; the tech types over them, which is
  what the `frame_number_confirmed` gate expects).
- **The archive/restore round trip has been clicked** — create → rename →
  archive → restore, on a throwaway `bike_families` row since hard-deleted.
- **`JP-3333-12`, the stranded MO-less bike, is gone** (soft-deleted by the owner
  2026-07-28 18:16). A second pre-fix MO-less bike remains: **`JP-3333-155`**, in
  `planning` with no MO, created 17:11 that day — before `f580845` closed the
  trap at 17:39. It cannot advance (`planning → building` needs an MO) and there
  is still no adopt path.

One caution the test data introduced: **`Jp -test 1` consumed real stock** (44
`bike_parts` rows, build cost 5,047.63 kr) on completed MO-2026-0014. Harmless
before the 31 Aug opening count, which is a physical count anyway — but it is
live inventory, not stub data.

## Bike creation is now one meaning per route (locked 2026-07-28)
Doctrine is in `CLAUDE.md` under "Bike creation"; the reasoning and the rejected
alternatives in DECISIONS 2026-07-28 (evening). Four scenarios, not three —
build-to-stock is distinct from build-to-order, and "a bike needs fixing" is not
a creation scenario at all:

| Scenario | Route |
|---|---|
| Customer orders bikes | SO → MO → Add bike |
| Build to stock (no customer) | MO with no SO → Add bike |
| Record a bike that already exists | `/bikes/new` |
| Fix a bike | bike must exist; ticket → Start work order, or the `?bike=` link |

- `/bikes/new` may produce ONLY `in_service` (owner required) or `in_stock`.
  Never `planning` — that is what made a bike strandable.
- **One stranded bike remains in prod: `JP-3333-12`**, in `building` with no MO.
  Nothing shipped can rescue it, because adopting an existing bike into an MO
  does not exist. Manual recovery: new MO → Add bike → build that one → retire
  the stranded one. It is a test bike ("test, can be deleted"), so deleting it is
  also fine.
- **Adopting an existing bike into an MO is UNDECIDED** — not rejected. It is the
  capability behind the owner's "Create manufacturing order" button idea and the
  only real fix for the stranded bike. If it gets built, do NOT reuse
  `addBikeToMO` (it inserts rather than updates, re-registers a frame-number
  identifier that already exists against a UNIQUE column, and applies the SO
  slate over an existing owner). See DECISIONS for the full note.
- The bike detail "…" menu now links **New work order** and **New ticket** with
  `?bike=<id>`. Both target forms had accepted that param all along with **zero
  callers** — worth remembering that a wired-but-unlinked capability looks
  exactly like a missing feature.

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

### The queue
**Only floor/office mode is left** (plan §6) — approved 2026-07-28, deliberately
**NOT before 31 Aug**, and the owner wants to talk it through with Dennis first.
It is the largest item in the plan and it reshapes the screen mechanics use daily.
Plan §15 has the four steps and the contrast-re-measurement requirement.

### Slice F is done (2026-07-29) — what it taught
All seven files are migrated: `deposit-form`, `paint-from-so-form`, `scanner`,
`mo-batch-form`, `add-parts-workspace`, the build `pick-list`, `build-workbench`.
Three things worth carrying:
- **Two real bugs surfaced, both in `scanner`, neither cosmetic, both invisible to
  the toolchain.** Manual entry never worked for a frame number — `new URL(v,
  origin)` never throws for a plain string, so the frame-number fallback was
  unreachable and typing one 404'd, on the exact path a mechanic uses when the
  camera fails. And leaving `/scan` after declining the camera threw a runtime
  error, because html5-qrcode's `stop()` throws SYNCHRONOUSLY and the existing
  `.catch()` could only see a rejection. This is the case for one-file-per-commit
  browser verification, not a batch.
- **A `rounded-*` grep misses leftovers.** `build-workbench`'s footer was
  `border-t bg-muted/20 px-4 py-3` — no rounded corner, and its padding fought the
  Panel's once inside one. Grep `bg-muted` and bare `border-t`/`border-b` too.
- **Console-testing a React form:** a synthetic `blur` does NOT fire React's
  `onBlur`; React listens on `focusout`, which bubbles. A working quantity writer
  looked broken because of this.

### `/admin/lists` — done, with two things to know
- **A new vocabulary is a descriptor entry, not a route.** `src/lib/admin/vocabularies.ts`
  declares each list's own fields; one renderer reads them. The seven share ONLY
  `is_active` — four different name shapes, two without `sort_order` — so do not
  try to unify the fields. Doctrine is in CLAUDE.md's config tier 3; the why-trail
  and the plan's wrong premise are in DECISIONS 2026-07-29 and plan §15.
- **Left undone on purpose:** the seven `manage-*.ts` actions still carry
  `revalidatePath` calls for their now-redirect-only routes. Harmless no-ops;
  not worth churning seven files in the commit that deleted 15 components.
  Tidy them next time one of those files is opened.
- **Unexercised:** "Make primary" — there is one stock location and it is already
  primary, so the button never renders. The archive-block path around it IS
  verified (archiving the primary fails with its error).

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
- **A green toolchain does not mean the page works.** Every defect below passed
  `tsc`, `lint` and `next build`, and every one was found by looking at the screen
  or clicking the thing. No tally — it keeps growing; what matters is the classes:
  - **Server/client boundary**: five create forms shipped blank defaults because a
    server component spread a `"use client"` export.
  - **A token used at the wrong level**: `bg-ground` at page level renders as
    invisible text; `bg-ground` chips inside a hue-washed panel go muddy.
  - **Contrast only measurable by measuring**: a destructive button on a caution
    wash at 4.25:1; a dropdown at 1.000:1 against a white panel (and screenshots
    come back downscaled, which flattens shadows — capture edges at 1:1).
  - **Copy that outlived its behaviour**: a form subtitle describing what it no
    longer did.
  - **Silent fallbacks**: the paint estimate priced off a supplier nobody chose
    (2026-07-29) — a wrong number is worse than a blank one.
  - **Handlers that never reach their fallback**: `/scan`'s manual entry 404'd on
    every frame number because `new URL(v, origin)` never throws (2026-07-29).
  - **Teardown that throws instead of rejecting**: html5-qrcode's `stop()` throws
    SYNCHRONOUSLY, so a `.catch()` on it never fires (2026-07-29).
  Several were found by the OWNER rather than by any check here, which is the more
  useful signal: read the screen's copy against what the code now does.
- **The preview pane's console buffer survives dev-server restarts.** Stale
  `MISSING_MESSAGE` errors from an earlier compile read as current and will send you
  chasing a fixed bug. Confirm against a fresh fetch of the route instead — and note
  that next-intl embeds the whole message dictionary in a script tag, so grepping
  raw HTML for a message string gives a false positive. Query the rendered DOM,
  excluding `<script>`.
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

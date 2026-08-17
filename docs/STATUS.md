# Status — Jensen FMS

**Last updated: 2026-07-29 (session end).** Most recent: **a preflight pass
before the app goes to Dennis, and the handover documents reframed around it.**
A repeatable harness now exists (`npm run smoke` + `scripts/audit-invariants.sql`,
below); every write flow has been driven end to end through the real UI; the
Danish locale switch was flipped and verified across all 103 routes and put back.
It found three real defects — all fixed — the worst of which was **CLAUDE.md's
landed-cost formula missing `anti_dumping_pct`** for seven weeks. Narrative in
`docs/archive/HISTORY.md` (2026-07-29); decisions in DECISIONS 2026-07-29.
CI is green on HEAD and the tree is clean.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
That applies to this header too: what shipped in earlier sessions belongs in
`docs/archive/HISTORY.md` and `docs/WORKLOG.md`, not in a growing parenthetical
here. History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`,
parked ideas in `docs/BACKLOG.md`.

## Where we are
- **v0.11.0** (tagged 2026-07-29 — the release Dennis reviews), deployed on
  Vercel (push-to-`main` → prod), gated behind Vercel SSO. Single-tenant,
  solo-dev. **`v1.0.0` is reserved for cutover**, not for a feature count: the
  convention set by the v0.10.0 tag is "pre-auth, so pre-1.0", and 1.0 now also
  means the day this becomes Jensen's system of record. Don't spend it early.
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
- **The July queue is complete** and its plan is archived.
- **There is now exactly ONE Dennis-facing document: `PLAYBOOK-AUGUST.md`**
  (owner's call 2026-08-07). `CUTOVER-BRIEF.md` was **demoted to a working
  reference** — it stays in `docs/` for our own use and Dennis never sees it, so
  it no longer needs to stay in sync with anything he reads. Consequence to
  carry: **the account-ownership question** (GitHub / Vercel / Supabase / domain
  / phone all under Nazar) now lives ONLY in the brief and `plan-cutover.md` §10
  — it is deliberately absent from everything Dennis has, and gets raised in
  person instead. The playbook was rewritten the same day: every ask reworded as
  a suggestion (he is a client running a business, not a team member), the
  cutover-brief references removed, a plain-language **backup-to-his-own-server**
  section added that asks whether a NAS exists, and the **calls → tickets**
  pipeline promoted to its own prominent section with a step-by-step for
  pointing the bridge at his own mobile. It contains no day-level date. **It is
  an owner-facing artifact, not a session slot**: rewrite when the period or
  audience changes, archive when the period ends.

## The frame: CUTOVER is now what everything serves
`docs/plan-cutover.md` (working plan: stage ladder, risks, open decisions) +
`docs/CUTOVER-BRIEF.md` (**our working reference since 2026-08-07 — not sent to
Dennis**; still the fullest written form of the ladder and the asks).

- **Proposed transfer date: Mon 31 Aug** — one hard line after which no new work
  is recorded in Excel or on paper. Confirm or move it in Meeting 1.
- **Three meetings, week of 17 Aug, in this ORDER — no days assigned**
  (owner's call 2026-07-29; the brief had said "Monday 18 August", which is a
  Tuesday, so the days came out rather than getting a corrected weekday —
  Dennis picks them): workshop first (reality check, watch one real job, agree
  the transfer date) · then a session at Nazar's a day or two later
  (invoicing-parity workshop, revisor on the phone, restore rehearsal) · team
  session on transfer day. **Don't reintroduce weekday names** — the order is
  what carries meaning and a named day drifts the moment the week moves.
  - **The playbook deliberately proposes only the first TWO, both as half
    days** (2026-08-07). That is not drift: the transfer-day team session still
    happens, it is simply not something Dennis needs to book now, and the
    playbook is a preliminary document rather than the full plan. Nazar's
    session was also cut from a full day to a half. Don't "reconcile" the two
    files by adding the third meeting back to the playbook.
- **Ladder, ordered by irreversibility**: internal ops → supplier email +
  phone → first real invoice → e-conomic. e-conomic is deliberately LAST.
- **Migrate almost nothing**: customers + bikes in the field only. Opening stock
  is a physical count on the morning, not a data task.
- Two things it surfaces that are not code: **Stage 3 trips the agreed M1-auth
  trigger** (first real invoice), and **every account is in the dev's name** —
  a backup on Dennis's NAS gives him data and code, not a running service.
- Off-site copy to Jensen's on-site NAS as an **AES-256 `.7z`** (the backup
  kit's sparsebundle is macOS-only, so a NAS can store it and nobody there can
  open it). Owner's call; runbook in the plan, to be rehearsed at the full day
  at Nazar's — unpack an archive, load it into a fresh project, open the app
  against it, so Dennis has seen a restore work rather than been told it does.

## Design refresh — COMPLETE except floor/office mode
`docs/plan-design-refresh.md` **§14** is the authoritative "what shipped and
where this doc is now wrong" list; **§15** holds the build plans for the two
newly-approved items — **§15's `/admin/lists` plan is now marked shipped, with
the four ways it was wrong.** Decisions in DECISIONS 2026-07-26 / -27 / -28 /
-29. Mock-up `docs/mockups/design-directions.html` is history, not the target.

Live in prod: direction **B "Emalje"** in signal blue `#2E5FD1` · `Panel` /
`Metric` / `Rule` primitives · six hues, closed list · **seven grouped nav
items** with `nav_open` cookie state · the `/admin/settings` sub-rail · every
list page, detail section, admin form, dialog and workbench on `Panel` ·
**`/admin/lists`, one page for EIGHT controlled vocabularies** (18 routes retired
to it).

**Every durable lesson from this work is already a rule in `CLAUDE.md`** — the six
hues and their meanings, elevation being for floating surfaces only, `bg-ground`
as an in-panel fill, the contrast gate, the shared primitives (`FormSection` /
`ArchivePanel` / `FormSaveBar` / `Panel` / `EmptyState` / `TableSkeleton`), and
the measurement gotchas. Don't re-derive them from here; the narrative is in
`docs/archive/HISTORY.md` (2026-07-26 through -29).

Two live facts a fresh session needs:
- **Dark mode is unreachable** — no theme provider, no `prefers-color-scheme`
  wiring, so `.dark` never applies. Tokens are complete and measured anyway; a
  toggle was deliberately not built. If one lands, it should just work.
- **A `rounded-md border` is NOT automatically card soup**, so the sweep's hit
  count will never reach zero and must not be driven there — native
  `<select>`/`<input>`, print routes, photo thumbs and button groups own their
  borders. Read each hit before changing it.

**What real data still cannot verify:** no bike template has paintwork rows (the
section and its no-price messages were exercised 2026-07-29 with a temporary row
since deleted, so the surface is seen but unpopulated), and no inbound message is
spam-flagged, so that banner's `money` hue is code-verified only.

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
  Never `planning` — that is what made a bike strandable. **Both branches have
  now been posted** (2026-07-29): the owner-required rejection writes nothing,
  and `in_stock` mints a bike with no owner, no `build_cost_dkk`, no MO, one
  frame identifier and one state-log row, exactly as documented.
- **No stranded bikes remain in prod.** `JP-3333-12` was soft-deleted by the
  owner 2026-07-28; `JP-3333-155`, the last one, on 2026-07-29 at the owner's
  instruction. Both were test data. Check 1 of the invariant audit is the
  standing guard, so this does not need watching by hand.
- **Adopting an existing bike into an MO is UNDECIDED** — not rejected. It is the
  capability behind the owner's "Create manufacturing order" button idea. If it
  gets built, do NOT reuse `addBikeToMO` (it inserts rather than updates,
  re-registers a frame-number identifier that already exists against a UNIQUE
  column, and applies the SO slate over an existing owner), and it must handle
  the owner-consistency case in **audit check 2.5**. Full note in DECISIONS
  2026-07-28.

## Preflight harness (2026-07-29) — run this before showing anyone the app
Two commands, both read-only, both safe against prod:

```
npm run smoke                      # 103 routes, needs `npm run dev` running
scripts/audit-invariants.sql       # 16 invariants; SQL editor, psql, or the MCP
```

- **Smoke sweep**: fetches every page route with real ids pulled from the DB and
  asserts status + error-overlay markers + missing i18n keys. Baseline **92 pass ·
  19 redirect · 0 skip · 0 fail**. The 19 are the 18 retired vocab routes plus
  `/whoami`. A SKIP is not a pass — it means no row exists to render that route.
- **Invariant audit**: each check must return zero offenders. **Baseline is 14 of
  16 clean**; the two standing hits are real and tracked below (negative stock,
  e-conomic trial stamps), so treat 14/16 as green and anything else as new.
- Why the audit is a `.sql` file and not a script, why two of its first four hits
  were bugs in the checks, and what Tier 1 covered: DECISIONS 2026-07-29
  (afternoon). **Tier 2 — issuing an invoice, any e-conomic push, any real send —
  is excluded on purpose and must stay manual.**
- **Negative stock, `JP-sap271` (Sapim spokes): −207.** One receipt of 83 in May,
  then eight real builds consuming 36 each. Opening stock was never entered, so
  this is a data debt, not a code defect — the 31 Aug physical count resolves it.
  It does confirm a build is allowed to run the ledger negative without blocking;
  whether that should warn is an owner question, not a bug.

## Next actions, in order
1. **Send Dennis the playbook** — `PLAYBOOK-AUGUST.md` only (PDF alongside the
   markdown). `CUTOVER-BRIEF.md` is NOT sent. Nothing is blocking this, and the
   window is already open — the playbook describes the stretch before the week
   of 17 Aug.
2. **Chase the external blockers** in cutover plan §7 (revisor in one
   conversation with four questions — **including what number the invoice series
   should start at, since `INV-2026-0001` is already spent on a test**;
   `orders@valent.dk`; the e-conomic production token, now overdue; company
   CVR/bank/address).
3. **The whole-session fresh-eyes read is DONE** (2026-07-29) — all 103 routes
   swept in both locales, every write flow driven, the six hues seen across a
   full working session rather than screen by screen. Nothing outstanding was
   found beyond what is recorded here. The next genuinely useful pass is
   **Dennis's**, which is what the playbook is for.
4. **Next `CLAUDE.md` consolidation: first session of September** — one cycle
   skipped deliberately (owner's call 2026-07-29): the 2026-07-28 pass ran late
   in July and was thorough, so an August pass days later would find nothing.
   A skip, not a new cadence. It is step 3 of `/session-start` and the only
   instrument pointing at that file now the line-count hook is gone. **Reading
   alone is not enough** — 2026-07-28 found a nav bullet describing a superseded
   layout, and 2026-07-29 found the landed-cost formula missing a whole term;
   the second was invisible to reading and took one `information_schema` query.
   The honest reduction is extracting narrative to `docs/archive/HISTORY.md` —
   **never deleting a rule.**

### The queue
**Only floor/office mode is left** (plan §6) — approved 2026-07-28, deliberately
**NOT before 31 Aug**, and the owner wants to talk it through with Dennis first.
It is the largest item in the plan and it reshapes the screen mechanics use daily.
Plan §15 has the four steps and the contrast-re-measurement requirement.

### Two small debts left on purpose
- The seven `manage-*.ts` vocabulary actions still carry `revalidatePath` calls
  for their now-redirect-only routes. Harmless no-ops; tidy them next time one of
  those files is open, not in a commit of their own.
- **`/admin/lists` "Make primary" is unexercised** — there is one stock location
  and it is already primary, so the button never renders. The archive-block path
  around it IS verified (archiving the primary fails with its error).

## Waiting on (external)
- **e-conomic production agreement** grant token — was expected ~end of July,
  so it is due now; chase it (it is the long-lead item in cutover Stage 4).
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
  - **A durable doc that reads well and is simply false**: CLAUDE.md's landed-cost
    formula was missing `anti_dumping_pct` for seven weeks (2026-07-29). No screen
    was wrong; every piece of *reasoning* from that paragraph was. Reading cannot
    catch a missing term — only checking the claim against
    `information_schema` / the module that owns the behaviour can.
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
  **FOUR SUCH RECORDS EXIST** (found 2026-07-29 by `scripts/audit-invariants.sql`;
  this entry previously claimed none did, which was wrong from 2026-07-09 —
  they are the residue of that day's live push test):
  - `organizations.economic_customer_number` — `Nazar Taras` (2),
    `TEST Hotel Strandvejen ApS` (3)
  - `invoices.economic_voucher_id` — `INV-2026-0001` (`2026 J1 V2`),
    `TEST-2026-0001` (`2026 J1 V3`), both `economic_synced_at` 2026-07-09
  Clearing these is a **prerequisite of the production cutover**, not
  housekeeping: left in place, the first real push reconciles against trial
  entities. Re-run check 14 of the audit to confirm zero before the token swap.
- `outbound_test_mode` is the only thing between "Email supplier" and real
  supplier inboxes — verify it before demoing send flows.
- Both locales sit at `en`; if a surface suddenly renders Danish, someone
  flipped `app_settings` — that's the go-live switch, not a bug. **The switch is
  proven** (flipped to `da` and back 2026-07-29): all 103 routes render Danish
  with zero missing keys, both dictionaries are key-identical at 3979, and the
  worker surfaces follow `worker_language` independently. Go-live is one setting,
  not a project.

## Data-entry debts (owner/admin, not code)
Self-serve via the dashboard "Data housekeeping" fold:
- **Every part has `origin = NULL`** → new PO lines default to NO import tax
  (`import_tax_basis = 'unclassified'`) until origins are set on the part
  edit form. Classifying the China-sourced fast movers as `non_eu` restores
  tariff-by-default where it matters.
- **Parts lack an HS code** — they snapshot 0 % tariff until classified. The
  count was 5 here and is **11** as of 2026-07-29: the five May originals plus
  Shimano wheels/hubs added 17 Jun and 1 Jul. Don't re-fix the number — query
  it (`parts where hs_code_id is null and deleted_at is null`) or read the
  dashboard's Data housekeeping fold, which is live. TARIC note: the customs broker (DA Custom
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

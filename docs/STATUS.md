# Status — Jensen FMS

**Last updated: 2026-09-02 (session end).** Most recent: **painted parts are
stock** (migration 91, `docs/plan-painted-parts.md`, phase 1 shipped): a part
can be paintable, a painted variant is a part per colour, a stock paint order
coming back converts raw stock into painted stock with a real cost, and
`/parts/painted` shows raw beside painted per colour. Before that, **the whole
sales order → paint order path became walkable without knowing a frame number.** The
painter receives a document (print + *Email painter*, in the supplier's own
language, migration 89; emailing marks a planned order sent and freezes prices
first); the paint order's *Add bike* picker groups bikes by customer order with
multi-select; an MO built for an SO offers *Send frames to painter* as its next
step; the SO detail shows frames per MO with an at-painter count; and `/bikes`
gained a paint filter (at painter · painted, not yet built · not painted) with
row badges. The PO document reads the same supplier language, and country
names on both documents follow it. All verified in the browser on the local copy, including a real
Resend send to the owner's test inbox. Decisions in DECISIONS 2026-09-01 and
2026-09-02. tsc + lint + build clean; smoke 0 fail.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`, parked
ideas in `docs/BACKLOG.md`.

## The frame, re-set on 1 September
The 31 August cutover **did not happen** and no new date is set. The owner's
choice (DECISIONS 2026-09-01): **parallel running** — the old system stays the
system of record while the workshop does small things in the FMS as it is
fine-tuned. Targets: **core functionality by October, go-live by Christmas.**
Nazar acts as project manager with Dennis's consent: **weekly Tuesday-morning
check-ins**, deadlines, follow-ups; Dennis spends 15–20 min in the system each
morning so every meeting has findings.

Scope is two-pronged: **modules** (bike templates + parts) and **processes**
(sales order → paint order first). Purchase orders and work orders are parked
until those two are solid. `docs/plan-cutover.md` keeps the ladder
(irreversibility ascending, e-conomic last) for whenever a date is set; its
August dates are stale and its header says so. The cutover brief and the
August playbook are archived (2 Sep), and every plan in `docs/` was swept the
same day for facts the re-plan made false.

**What Dennis actually did on 1 Sep** (checked in prod, not remembered): created
paint order `PNT-2026-0008` for Metacoat — five lines in RAL 1006, zero bikes,
no sales order behind it — after creating the colour "Maisgleb 1006"; booked
150 stems at a stated cost through the new stock-arrival path. Both Dennis and
Nazar have passwords since 1 Sep; **Dennis's app is Danish** (person language),
so a screen you demo in English looks different on his tablet.

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod),
  gated behind Vercel SSO + the person-password wall. `v1.0.0` is reserved for
  the day this becomes the system of record.
- Operationally feature-complete for the workshop's daily job (parts, stock
  ledger, suppliers + POs with frozen landed cost + PO email in test mode,
  templates, MOs + build workbench, bikes + QR, paint orders with document,
  sales orders + slating, customers + map, tickets + work orders, `/work`,
  invoicing, e-conomic push against a trial agreement, inbound voicemail →
  ticket in shadow mode, whole-app Danish with both locales still `en`).
- **Paint-from-SO already exists** (`/sales-orders/<id>/paint/new`, D3
  2026-06-20). Dennis did not find it because he started from the paint-order
  side, whose bike picker searches frame number and template only — that is
  item B below, a discoverability fix, not architecture.
- **Painted frames** are derived state (DECISIONS 2026-09-01 §5): a filter over
  bikes, not a SKU. Item C below.
- **Local database copy** refreshed from the 2 Sep production dump, then
  migration 89 applied. Known divergences from production: the local
  `PNT-2026-0008` was flipped to `sent` + emailed by today's test (prod: still
  `planned`), the walk-through fixture below exists only locally, and every
  clearly-test row on local now carries the `TEST` prefix (owner's rule,
  DECISIONS 2026-09-02) while production's copies of the same July test rows
  do not yet. Re-dump before trusting local for anything data-shaped.
- **Jerudan is gone from both databases** (owner's call 2 Sep): it was an
  unreferenced duplicate of Jeudan. `Jeurodan` remains as version 1 of the
  Jeudan chain.

## Next actions
0. **Painted parts, phases 3–4** (plan §4): the shelf view gains demand from open
   MOs per colour and counts *at the painter* from sent-order lines; the
   fill-from-bikes seeder names the specific BOM parts so order-tied paint orders
   convert stock without a hand edit. Phase 2 (colour-aware build) shipped
   2026-09-02 — builds pick the painted variant, *needs paint* blocks the floor.
1. **Tuesday's meeting with Dennis — walk the fixture.** On the LOCAL copy:
   customer *TEST Midtjysk Ejendomsmægler ApS* → `SO-2026-0012` (confirmed, two Norma
   CS in Maisgleb 1006) → `MO-2026-0017` (two bikes) → `PNT-2026-0009` (sent,
   both frames, linked back to the SO). Every step was driven through the real
   UI today, so it is the demo script as well as the test. Also on local: TEST
   stock paint order `PNT-2026-0010` (two frames + a fork in Maisgleb, received
   back) and the three painted variants it created — show Dennis `/parts/painted`
   and the base part's *Painted variants* section. Point the dev
   server at local (`scripts/use-db.sh`), sign in with `dev-login.mjs`.
2. **Then decide with Dennis** whether the same order goes into production for
   real (his real-estate customer), and whether Metacoat's real email replaces
   the test address (see Waiting on).
3. **Kit = sub-assembly** goes to the planning chat (BACKLOG has the three
   questions).
4. Parked deliberately: painted frames as a dashboard metric (not asked for).
   The PO document reads the supplier language since the same afternoon
   (DECISIONS 2026-09-02, later) — set it on the supplier form.

## Preflight harness — run before showing anyone the app
```
npm run smoke                      # every page route; needs `npm run dev`
scripts/audit-invariants.sql       # SQL editor, psql, or the MCP
```
- **Smoke** against the LOCAL copy today: **86 pass · 18 redirect · 7 skip ·
  0 fail.** The 7 skips are routes with no row to render (invoices, work orders,
  service agreements) since the 26 Aug cleanup — production would skip the same.
  A SKIP is not a pass. The 18 redirects are the retired vocab routes.
- **Invariant audit**: baseline **16 of 18 clean** (unchanged since 26 Aug):
  check 17 (`JP-BasJen`, 499 units with no known cost — needs the owner's
  estimate) and check 18 (legacy movements with `unit_cost_basis = 'none'`,
  can only shrink). Tier 2 — issuing an invoice, any e-conomic push, any real
  send — is excluded on purpose and stays manual.

## Waiting on (external / owner)
- **Metacoat's real email address.** `suppliers.email_primary` for Metacoat is
  the OWNER'S TEST ADDRESS (`nazar@valent.dk`) on both databases, on purpose,
  so the flow can be tested. Replace it before `outbound_test_mode` is switched
  off, or the first real paint order goes to Nazar.
- **Kit = sub-assembly** modelling question — escalated to the planning chat
  (BACKLOG, "Parked product ideas"). Until answered: kits are box stickers,
  template reuse is Duplicate template.
- **e-conomic production agreement** grant token — long overdue; the long-lead
  item in the ladder's last rung.
- **`orders@valent.dk`** alias in Google Workspace — it is the outbound
  from/reply-to address in production, so replies bounce until it exists.
- Supplier emails still blank on most suppliers (dashboard housekeeping card).
- Revisor nods: weighted-avg stock valuation + deposit VAT timing; e-conomic
  config numbers. CVR/bank/address placeholders in
  `src/lib/invoicing/company.ts` before the first real invoice.
- **Danish number** onto the inbound trunk — Dennis wants to hand customers a
  number to call; the trial number is US and shadow mode is on. No inbound
  traffic since 19 Aug. This is the cutover's data step (customers + bikes in
  the field), not a test fixture.

## Landmines
- **Ad-hoc SQL against a wrong slug returns nothing and looks like "not set".**
  The paint service type's slug is `painting`, not `paint`; a query on the wrong
  one reported "no default painter" today when Metacoat had been default all
  along. Check `service_types.slug` before concluding anything from a null.
- **`supabase gen types typescript --local` does not reproduce the committed
  types file** — it drops `__InternalSupabase` and the `Relationships` arrays.
  Hand-patch the affected tables (Row + Insert + Update) or regenerate through
  the MCP against production after the migration is applied there.
- **Every migration lands on BOTH databases**, and production must have it
  BEFORE the push that deploys code reading the new columns.
- **The commit gate skips `npm run build` while a dev server holds :3000.**
  Stop the server, build, then commit. **Blanket `git add -A` is blocked** and
  should stay blocked; stage explicit paths.
- **A green toolchain does not mean the page works** — RSC boundary violations,
  tokens at the wrong level, contrast, copy that outlived its behaviour, silent
  fallbacks all passed tsc/lint/build and were found by looking at the screen.
  Browser-verify every route touched; read the screen's copy against the code.
- **The preview pane's console buffer survives dev-server restarts** — stale
  errors read as current; confirm against a fresh fetch.
- **The publishable/anon key is a DB master key** while RLS is `anon_all`. Safe
  only because nothing browser-side imports a Supabase client; all data access
  stays in server components / actions. Resolves at M1.
- **Anything stamped against the e-conomic TRIAL agreement must be cleared
  before the production token swap** — check 14 is at zero today; re-run it
  before the swap.
- `outbound_test_mode` is the only thing between "Email supplier" / "Email
  painter" and real inboxes — verify it before demoing send flows.
- Both locales sit at `en`; Danish appearing app-wide means someone flipped
  `app_settings` (the proven go-live switch), except for Dennis, whose PERSON
  language is `da`.
- **Adopting an existing bike into an MO is undecided, not rejected**; if built,
  do not reuse `addBikeToMO` (DECISIONS 2026-07-28).
- Dark mode is unreachable (no provider); tokens are complete anyway. A
  `rounded-md border` is not automatically card soup — read each hit.

## Data-entry debts (owner/admin, not code)
Self-serve via the dashboard "Data housekeeping" fold; the numbers live there,
not here — query them, don't trust a remembered count.
- **Part origin** unset on almost every part → new PO lines default to NO import
  tax (`unclassified`) until set. Forward-looking only.
- **HS codes** missing on some parts → 0 % tariff snapshotted until classified.
  Confirm splits with the customs broker (DA Custom Brokers) before
  reclassifying; anti-dumping 48.5 % sits on 8714963090 + 8714991099.
- **Supplier offerings** mostly lack `default_purchase_price` → drafted POs land
  at 0 kr.
- **No part has `reorder_point`** → the low-stock heuristic (≤ 20 % of last
  purchase qty) drives every badge.
- **`JP-BasJen`** 499 baskets with no cost (check 17). **`JP-AND-DSP-NTC`** 93
  units of "test" stock counted as real — owner decides.
- Written up for Dennis in `docs/PARTS-REVIEW-2026-08.md` (+ PDF).

## Standing "not now" decisions (reasons in docs/DECISIONS.md)
- **M1 auth + RLS tightening — delayed (owner).** Trigger to reconsider: the
  first real invoice.
- **CI Tier 2** (smoke in CI + Vitest over actions) — parked with M1.
- **Floor/office mode** (design plan §6) — approved, deliberately parked; the
  owner wants to talk it through with Dennis first.
- **Sales track** (configurator + lead-gen) — earliest next year.
- **Next `CLAUDE.md` consolidation: first session of October** (the September
  pass ran 2026-09-02 and fixed seven drifted facts).

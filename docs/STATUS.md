# Status — Jensen FMS

**Last updated: 2026-09-03 (session end).** Most recent: **"Paintable as" is
generated from the part category** (migration 97) — a painter type claims a
category, new parts inherit it, a button on the type's row fills every
undecided part, and `parts.paint_exempt` is the deliberate *not painted* the
fill must skip. **Both databases now carry the data**: Frame→Frames,
Fork→Forks, Cargo bed→Front Cargo Platform, 15 parts assigned, 3 marked not
painted. Earlier the same session: **every outgoing message is kept**
(migrations 94–96) with its exact body, readable in a *Sent messages* panel per
order and at `/admin/outbox`; **each supplier keeps its own email message** and
the send dialog names the real recipient (93); **spawning an MO asks whether the
frames need painting**; the frame-number generator reads both tables so a spawn
can no longer abort half-created; `/parts/painted` is now **Paint shelf**; the
MO list carries date, client and sales order, sortable. Decisions in DECISIONS
2026-09-02 and 2026-09-03. tsc + lint clean; smoke 87 pass / 0 fail.

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
August dates are stale and its header says so.

**Dennis's app is Danish** (person language), so a screen demoed in English
looks different on his tablet. Both he and Nazar have passwords since 1 Sep.

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod),
  gated behind Vercel SSO + the person-password wall. `v1.0.0` is reserved for
  the day this becomes the system of record.
- Operationally feature-complete for the workshop's daily job (parts, stock
  ledger, suppliers + POs with frozen landed cost, templates, MOs + build
  workbench, bikes + QR, paint orders with document, sales orders + slating,
  customers + map, tickets + work orders, `/work`, invoicing, e-conomic push
  against a trial agreement, inbound voicemail → ticket in shadow mode,
  whole-app Danish with both locales still `en`).
- **Migrations 93–97 are on production AND local.** 93 supplier email message ·
  94–96 `outbound_messages` (supersedes `notification_log`) · 97 painter-type
  category defaults + `parts.paint_exempt`.
- **PRODUCTION now knows what goes to the painter** (entered 3 Sep, identical on
  both databases): 8 frames, 5 forks, 1 cargo bed, 1 mudguard set assigned;
  `CJ700CST201-1`, `QC700CST201` (stainless) and `JP-WSLFH01` (WOLT, arrives
  white) marked *not painted*; 154 of 172 base parts still undecided, which is
  correct — handlebars and chains never see a painter. **This changes what
  Dennis sees**: MO coverage will now say *N parts need paint* where it used to
  say "all covered", and *needs paint* blocks readiness. Tell him before he
  meets it.
- **Basket and Mudguards are deliberately unmapped** — majority-exception
  categories, so a category default there would be wrong more often than right.
  Their parts get marked by hand.
- **Local divergences from production** (re-dump before trusting local for
  anything data-shaped): the walk-through fixtures (`SO-2026-0012` →
  `MO-2026-0017` → `PNT-2026-0009`, stock order `PNT-2026-0010`, painted
  variants in Maisgleb, TEST-prefixed rows); today's test MOs `MO-2026-0019`,
  `MO-2026-0020` (half-spawned, 1 of 2 bikes), `MO-2026-0021`; `SO-2026-0014`
  given a colour to exercise the paint prompt; `PNT-2026-0012`/`0013` and their
  conversions; one failed outbound row from a send test; repaired frame-identifier
  drift (audit 19/20 — production never had any).

## Next actions
1. **Tuesday 8 Sep with Dennis.** Two things to walk: the paint chain end to end
   (`docs/WALKTHROUGH-PAINT-2026-09.md` + PDF for the local fixture) and the
   guide written for him, `docs/PAINT-FLOWS-DENNIS-2026-09.md` (+ PDF) — the map
   from question to screen, then three flows: a colour we don't have, a colour
   already on the shelf, a stock batch with no order behind it. **Both are in
   English buttons by the owner's call**, while his app is Danish.
2. **Watch one real paint order go round in production** now that the parts are
   marked — and decide whether Metacoat's real email replaces the test address
   (see Waiting on) before `outbound_test_mode` goes off.
3. **Jeudan declares Basket ×1 and Sign ×2** to the painter with no parts behind
   them; the template now flags both as *not marked in the recipe*. Dennis's call
   whether those parts should exist at all.
4. **Kit = sub-assembly** goes to the planning chat (BACKLOG has the three
   questions).
5. Loose ends, none blocking: `MO-2026-0020` on local is half-spawned (finish or
   cancel it); the spawn prompt's zero-paint branch has not been clicked in a
   browser (both spawnable lines had paintable parts); the paint-from-SO screen
   pre-fills the colour only when every eligible frame agrees.

## Preflight harness — run before showing anyone the app
```
npm run smoke                      # every page route; needs `npm run dev`
scripts/audit-invariants.sql       # SQL editor, psql, or the MCP
```
- **Smoke** against the LOCAL copy: **87 pass · 19 redirect · 7 skip · 0 fail.**
  The 7 skips are routes with no row to render (invoices, work orders, service
  agreements) since the 26 Aug cleanup — production would skip the same. A SKIP
  is not a pass. 18 of the redirects are the retired vocab routes; the 19th is
  `/sales-orders/<id>/edit`, which redirects because the SO the smoke picks is
  confirmed and the edit page is draft-only — data-dependent, not a regression.
- **Invariant audit**: baseline **18 of 20 clean**. Standing hits: check 17
  (`JP-BasJen`, 499 units with no known cost — needs the owner's estimate) and
  check 18 (legacy movements with `unit_cost_basis = 'none'`, can only shrink).
  Checks 19 and 20 are new (3 Sep) and clean on both databases: frame identifiers
  that disagree with their bike, and live bikes with no frame identifier.
  Tier 2 — issuing an invoice, any e-conomic push, any real send — is excluded
  on purpose and stays manual.

## Waiting on (external / owner)
- **Metacoat's real email address.** `suppliers.email_primary` for Metacoat is
  the OWNER'S TEST ADDRESS (`nazar@valent.dk`) on both databases, on purpose,
  so the flow can be tested. Replace it before `outbound_test_mode` is switched
  off, or the first real paint order goes to Nazar. The send dialog now prints
  the address it will use, so this is visible at the moment of sending.
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
  one reported "no default painter" when Metacoat had been default all along.
  Check `service_types.slug` before concluding anything from a null.
- **A frame number lives in TWO tables** — `bikes.frame_number` and a
  `bike_identifiers` row under a table-wide unique index. The generator reads
  both now (`loadUsedFrameNumbers`); anything that renames a frame number
  outside the app must update both, or audit check 19 lights up.
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
  painter" and real inboxes — verify it before demoing send flows. Every attempt
  is now recorded either way, at `/admin/outbox`.
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
- **Painted stock in production is still empty** — the parts are marked, but no
  paint order has come back there yet, so the shelf shows raw only.
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

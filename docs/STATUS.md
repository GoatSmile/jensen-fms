# Status — Jensen FMS

**Last updated: 2026-09-03 (session end, evening).** The day's second half went
to the 3 September call with Dennis. Its headline finding — *"the paint order
only sends frames"* — **was false**; the order created live already carried four
lines, and what misled two people was a button counting BIKES in a unit that
names one of the parts. That is fixed at the root: the paint screen now shows
**What goes to the painter** before you commit, computed by the same pure
functions the action uses. Then: "frames" gave way to "bikes" everywhere the app
meant bikes; **painted stock became a panel you can act on** beside Raw stock,
with Adjust per colour; **painted stock the shop already owns can be recorded**,
creating the colour's variant and asking *"take these off the raw count too?"*
with no default; and **a scrap is now a `disposed`**, not an adjustment. Two
silent bugs were found on the way (below). Decisions in DECISIONS 2026-09-03.
tsc + lint + build clean; smoke 89 pass / 0 fail.

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
until those two are solid. **Dennis's app is Danish** (person language), so a
screen demoed in English looks different on his tablet.

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod).
- Operationally feature-complete for the workshop's daily job. No migrations
  today — 93–97 remain the latest, on production AND local.
- **`docs/plan-sep3-meeting.md` is the live plan**: what the call got wrong,
  what production actually holds, and the work in five tiers. Read it before
  Tuesday.
- **`docs/PRODUCTION-CHECKLIST-DENNIS-2026-09.md` (+ PDF) is written and
  committed** — every figure in it queried from production today, with two
  screenshots. It has NOT been sent to Dennis yet.

## Next actions
1. **Give Dennis the production checklist.** It is the Tuesday material. Three
   production-only screenshots would finish it (Svajer cargo F 350 → Paintwork,
   the RAL 5013 colour row, `Jp -test 1` in the bike list) — blocked only on the
   Chrome extension not being connected, or on Dennis/Nazar pasting them.
2. **Decide the offer: build `offers`, or make SO-draft the offer.** Owner's
   call, and it blocks the thing Dennis asked for first. `offers` + `offer_lines`
   + the status enum + expiry + `is_price_template` + the `OFF-` series +
   `sales_orders.converted_from_offer_id` **all exist in production with zero
   rows and zero app code**. It is parked in BACKLOG behind the website
   configurator, which is the wrong thing to park it behind now.
3. **Two small copy fixes from the call** (Tier 1 in the plan): the template
   Paintwork note only advises "mark the part", which misdirects when the recipe
   has no such part at all — 5 unbacked declarations in production, two on
   Dennis's own new template; and the MO's disabled *Remove* explains itself
   only through a `title` tooltip, which is why Dennis concluded a purchase
   order was blocking him.
4. **Confirm whether Vercel SSO is deliberately off** (see Landmines).
5. Loose end: `docs/PAINT-FLOWS-DENNIS-2026-09.md` §6 still says the template
   and the parts "do not check each other yet" — the check shipped ten minutes
   after that sentence was written. The owner said to leave it (3 Sep); it is
   Tier 0 in the plan if that changes.

## Preflight harness — run before showing anyone the app
```
npm run smoke                      # every page route; needs `npm run dev`
scripts/audit-invariants.sql       # SQL editor, psql, or the MCP
```
- **Smoke** against the LOCAL copy: **89 pass · 19 redirect · 5 skip · 0 fail**
  (was 87/19/7 — two previously-skipped routes now have rows). A SKIP is not a
  pass.
- **Invariant audit**: standing hits are check 17 (`JP-BasJen`, 499 units with
  no known cost) and check 18 (legacy `unit_cost_basis = 'none'`, 11 rows in
  production, can only shrink). Checks 19/20 clean on both databases.
- Tier 2 — issuing an invoice, any e-conomic push, any real send — stays manual.

## Waiting on (external / owner)
- **The offer decision** (next action 2) — the largest thing blocked.
- **Three production-only screenshots** for Dennis's checklist.
- **Metacoat's real email.** `suppliers.email_primary` is the OWNER'S TEST
  ADDRESS (`nazar@valent.dk`) on both databases, on purpose. Replace it before
  `outbound_test_mode` goes off.
- **Kit = sub-assembly** modelling question — escalated to the planning chat.
- **e-conomic production agreement** grant token — long overdue.
- **`orders@valent.dk`** alias in Google Workspace — replies bounce until it exists.
- Revisor nods: weighted-avg stock valuation + deposit VAT timing. CVR/bank/address
  placeholders in `src/lib/invoicing/company.ts` before the first real invoice.
- **Danish number** onto the inbound trunk; shadow mode is on, no traffic since 19 Aug.

## Landmines
- **Production has NO Vercel SSO in front of it** (verified 2026-09-03):
  `https://jensen-fms.vercel.app/parts` returns the app's own 307 to `/login`,
  no SSO interstitial, no `_vercel_sso` cookie. The perimeter is the
  person-password wall alone, which CLAUDE.md calls "a UX wall, not a security
  boundary". Probably deliberate — Vercel SSO needs a Vercel account and Dennis
  logs in daily — but **confirm it**, because "SSO is in front" was part of why
  M1/RLS was safe to defer. The anon key is NOT in the public bundle (all 17
  login-page scripts checked the same day), so the `anon_all` RLS landmine is
  not currently reachable by a stranger.
- **`movement_type` is written in seven places and READ in exactly one** — the
  part page's movement list, for display. No view, report, cost resolver or
  audit check aggregates by it; stock is `SUM(quantity_delta)` and type-blind.
  That is why adding `disposed` was free, and why any future reporting on it
  needs building from scratch.
- **A dialog's `currentOnHand` comes from its `locations` prop.** Handing a
  variant's dialog the page-level (base part) options made it say "Currently 89"
  for a part holding 13 — and that value also drives what "Set on-hand to…"
  writes, so it would have posted a delta of −76. Any new caller of
  `AdjustStockDialog` must pass THAT part's per-location on-hand.
- **A frame number lives in TWO tables** — `bikes.frame_number` and a
  `bike_identifiers` row under a table-wide unique index.
- **`supabase gen types typescript --local` does not reproduce the committed
  types file** — hand-patch, or regenerate through the MCP against production.
- **Every migration lands on BOTH databases**, production BEFORE the push.
- **The commit gate skips `npm run build` while a dev server holds :3000.** When
  the server must stay up, build a copy instead: `git ls-files` + untracked into
  a temp dir, symlink `node_modules`, `npm run build` there. Used all session.
- **A green toolchain does not mean the page works.** Both bugs above passed
  tsc, lint and build. Browser-verify every route touched.
- `outbound_test_mode` is the only thing between "Email painter" and real inboxes.
- Both locales sit at `en`; Dennis's PERSON language is `da`.
- **Adopting an existing bike into an MO is undecided, not rejected.**

## Local divergences from production (re-dump before trusting local)
The walk-through fixtures (`SO-2026-0012`…`PNT-2026-0010`, TEST-prefixed rows);
today's `SO-2026-0015`/`0016`, `MO-2026-0022`/`0023`, `PNT-2026-0014`; **the
demo set `default_category_id` on Chain guard and Mudguards + stays, where
production has both null and STATUS records Mudguards as deliberately
unmapped**; and this session's test data on `JP-LS2b` — raw 86, `JP-LS2b-RED` 10
(three TEST-marked movements incl. one `disposed`), the inline-created colour
`TEST Petrol` and its variant `JP-LS2b-TEST-PETROL` at 3.

## Production data debts — the full list is Dennis's checklist
`docs/PRODUCTION-CHECKLIST-DENNIS-2026-09.md` holds all of it with click paths.
The ones that change numbers: **Jeudan declares Frame ×2** where its recipe
holds one (365 kr./bike of phantom paint cost); **Norma CS, Norma FS and Svajer
F declare no paintwork** while their recipes hold marked parts, so their margins
are overstated; **no `Sign` part exists** yet three templates send one to the
painter; **colour "RAL 5013" carries code 2150**; `Jp -test 1` is a test bike in
real stock and `JP-AND-DSP-NTC` holds 93 units whose reason reads "test"
(~26.000 kr.); 169/172 parts have no origin, 11 no HS code, 166 offerings no
price, no part a reorder point, 17 suppliers no email. **Production's paint
shelf is empty and that is correct** — `PNT-2026-0005` predates the model.

## Standing "not now" decisions (reasons in docs/DECISIONS.md)
- **M1 auth + RLS tightening — delayed (owner).** Trigger: the first real invoice.
  Re-read the SSO landmine above before reaffirming that.
- **CI Tier 2** (smoke in CI + Vitest over actions) — parked with M1.
- **Floor/office mode** (design plan §6) — approved, deliberately parked.
- **Sales track** (configurator + lead-gen) — earliest next year. The offers
  module is parked *behind* it and should probably be pulled out (next action 2).
- **Next `CLAUDE.md` consolidation: first session of October.**

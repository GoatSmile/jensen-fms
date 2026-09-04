# Status — Jensen FMS

**Last updated: 2026-09-04 (session end).** The offer got built. It was the
largest thing blocked on an owner decision, and the decision came back as
*build it as designed, on a shared lines layer* — so the sales order's 1,300-line
lines UI became one machine both documents use, and `/offers` was built on top of
it: list, create, edit, a customer-facing document in the customer's language,
print, email through `sendAndRecord`, reopen-for-revision, and convert to a sales
order. Migration 98. Around it: Danish *tilbud* was reserved for the customer
document before the module existed to confuse it; the bike designer on
logocykler.dk was reverse-engineered and a plan agreed for putting its picture on
the offer; an invalid RAL code became impossible to save; and the company
letterhead got a real address. Decisions in DECISIONS 2026-09-04.
tsc + lint + build clean; smoke 93 pass / 0 fail.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`, parked
ideas in `docs/BACKLOG.md`.

## The frame
The 31 August cutover **did not happen** and no new date is set. The owner's
choice (DECISIONS 2026-09-01): **parallel running** — the old system stays the
system of record while the workshop does small things in the FMS as it is
fine-tuned. Targets: **core functionality by October, go-live by Christmas.**
Nazar acts as project manager: **weekly Tuesday-morning check-ins**, Dennis
spends 15–20 min in the system each morning so every meeting has findings.
Scope is **modules** (bike templates + parts) and **processes** (sales order →
paint order first). **Dennis's app is Danish** (person language), so a screen
demoed in English looks different on his tablet.

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod).
- **Migration 99** is the latest. 98 is on production (owner-reported, not
  independently verified — the Supabase MCP did not connect). **99 is LOCAL
  ONLY and must reach production before the next deploy**: without
  `offer_revisions`, `markOfferSent` logs a failed insert on every send and the
  print page silently falls back to rendering live.
- **`/offers` is live in production and has never been used there.** The route
  answers (307 → `/login`); no production offer exists. The first real one is
  the test.
- **`docs/plan-sep3-meeting.md` is still the live plan.** Its Tier 2 item 8
  (build `/offers`) shipped today; item 9 (a picture on the offer) did not, and
  Tier 0/1 items remain. Do not archive it yet.

## Next actions
1. **Two documents now wait on Dennis, and neither has been sent.**
   `docs/PRODUCTION-CHECKLIST-DENNIS-2026-09.md` (data debts, with click paths)
   and `docs/COLOUR-LISTS-DENNIS-2026-09.md` (new today). The colour one asks a
   single question — *may we change your website's colours to match the
   system's?* — and **it blocks the bike-picture work**.
2. **B′ — the bike picture on the offer.** Decided this session; see the section
   below. Blocked on (1).
3. **The last of the sharing: the header FORM.** `offer-form.tsx` is largely
   `so-form.tsx` — a shared form with a slot for document-specific fields (the
   SO's delivery week, the offer's expiry). Pure refactor, no visible change, so
   it can wait for a quiet hour. The lines half is done: `draft-writers.ts` now
   calls `insertLine`, and `src/lib/commercial/options.ts` holds the picker
   queries and row mapping both detail pages had inlined.
4. **Margin beside each line on the offer.** The template page already computes
   cost to produce from `v_part_last_cost` plus paint; the offer shows none of
   it, so Dennis prices blind. **Blocked on the paintwork data debts** in
   Dennis's checklist, or the margin lies.
5. **Offer quick-paths.** The Offers panel on a customer's page has a *New
   offer* button that does NOT carry that customer — a defect, and the cheapest
   fix (`/offers/new?org=<id>` + a header button). Then **duplicate an offer**,
   the only sane path for a *converted* offer, since those cannot reopen.
6. **A picture per offer LINE** (sep3 plan Tier 2 #9). `attachments.entity_type`
   is free text so it needs no migration, but it needs an upload action, a slot
   on the shared lines table, thumbnails in print + email, orphan cleanup on line
   delete, and copy-on-convert.
7. **Company details: CVR, invoice email, bank name + reg. + account.** Address
   and phone went in today; the red *"Firmaoplysninger mangler"* banner on every
   offer and invoice stays until all five are filled, and they block the first
   real invoice.
8. Still open from the 3 Sep call: the two small copy fixes (sep3 plan Tier 1),
   and confirming whether Vercel SSO being off is deliberate (Landmines).

## The bike picture — B′ (decided 2026-09-04, unbuilt)
Dennis's designer at **logocykler.dk/cykeldesigner** cannot be queried: static
Lovable SPA, no API, no URL state, *Download PDF* is client-side jsPDF and *Send
via email* is a `mailto:`. But the picture is **~16 pre-registered 1182×796
greyscale PNGs** under `/assets/`, four of them (frame, mudguards, front carrier,
plate) tinted with a CSS filter chain, plus a 191-entry RAL table in the
`Designer-*.js` chunk. **Proved renderable outside the browser** — see the
session's scratch renders.

**B′ = render in the FMS, from a manifest published on his site.** The render
happens here and the result is **frozen onto the offer**, because an offer sent
in March must print identically in June — the same argument as the frozen cost
snapshots and `outbound_messages.body_html`. That rules out calling his site at
document-render time. The art comes from a stable, versioned manifest on
logocykler.dk (unhashed paths; his current filenames are content-hashed and
`immutable`, so any hardcoded URL breaks on his next rebuild), synced into
Supabase Storage. Domain survey in `docs/OPERATIONS.md`; we have modify access to
all his sites.

**The blocker is colour.** Our RAL deck and his disagree on **188 of the 191
codes they share** — 82 visibly, 10 by a different colour. Neither is wrong; both
are approximations of the same physical standard, and ours matches its cited
source (Wikipedia) exactly. One deck has to win or the offer picture will not
match what the customer configured. That is Dennis's call — hence document (1).

## Preflight harness — run before showing anyone the app
```
npm run smoke                      # every page route; needs `npm run dev`
scripts/audit-invariants.sql       # SQL editor, psql, or the MCP
```
- **Smoke** against the LOCAL copy: **93 pass · 20 redirect · 5 skip · 0 fail**
  (was 89/19/5 — the four new passes are the offers routes; the extra redirect is
  `/offers/[id]/edit` correctly refusing a converted offer). A SKIP is not a pass.
- **Invariant audit**: standing hits are check 17 (`JP-BasJen`, 499 units with
  no known cost) and check 18 (legacy `unit_cost_basis = 'none'`, 11 rows in
  production, can only shrink). Checks 19/20 clean on both databases.
- Tier 2 — issuing an invoice, any e-conomic push, any real send — stays manual.

## Waiting on (external / owner)
- **Dennis's answer on the RAL deck** — blocks the bike picture (next action 2).
- **Both Dennis documents delivered** (next action 1).
- **CVR, invoice email and bank details** (next action 5).
- **Three production-only screenshots** for Dennis's checklist.
- **Metacoat's real email.** `suppliers.email_primary` is the OWNER'S TEST
  ADDRESS (`nazar@valent.dk`) on both databases, on purpose. Replace it before
  `outbound_test_mode` goes off.
- **Kit = sub-assembly** modelling question — escalated to the planning chat.
- **e-conomic production agreement** grant token — long overdue.
- **`orders@valent.dk`** alias in Google Workspace — replies bounce until it exists.
- Revisor nods: weighted-avg stock valuation + deposit VAT timing.
- **Danish number** onto the inbound trunk; shadow mode is on, no traffic since 19 Aug.

## Landmines
- **`sendAndRecord` now writes `offer_id` on EVERY outbound row.** Against a
  database without migration 98 the insert is refused — and recording never
  blocks a send, so mail would still go out while silently ceasing to be
  recorded. Any environment running this code needs 98.
- **Production has NO Vercel SSO in front of it** (verified 2026-09-03). The
  perimeter is the person-password wall alone, which CLAUDE.md calls "a UX wall,
  not a security boundary". Probably deliberate — **confirm it**, because "SSO is
  in front" was part of why M1/RLS was safe to defer. The anon key is NOT in the
  public bundle. (`docs/OPERATIONS.md` said otherwise until today.)
- **A green toolchain does not mean the page works.** Today's example: `asText()`
  returns `null`, not `""`, so a first cut of the invalid-RAL flag fired on every
  colour that simply has no code — tsc, lint and build all passed. Browser-verify
  every route touched.
- **`movement_type` is written in seven places and READ in exactly one** — the
  part page's movement list, for display. Any future reporting on it is built
  from scratch.
- **A dialog's `currentOnHand` comes from its `locations` prop.** Any new caller
  of `AdjustStockDialog` must pass THAT part's per-location on-hand.
- **A frame number lives in TWO tables** — `bikes.frame_number` and a
  `bike_identifiers` row under a table-wide unique index.
- **`supabase gen types typescript --local` does not reproduce the committed
  types file** — hand-patch Row + Insert + Update (done for 98 today), or
  regenerate through the MCP against production.
- **Every migration lands on BOTH databases**, production BEFORE the push.
- **The commit gate skips `npm run build` while a dev server holds :3000.** Stop
  the server, or build a copy in a temp dir.
- `outbound_test_mode` is the only thing between "Email painter" / "Email
  customer" and real inboxes.
- Both locales sit at `en`; Dennis's PERSON language is `da`.
- **Adopting an existing bike into an MO is undecided, not rejected.**

## Local divergences from production (re-dump before trusting local)
The walk-through fixtures (`SO-2026-0012`…`PNT-2026-0010`, TEST-prefixed rows);
`SO-2026-0015`/`0016`, `MO-2026-0022`/`0023`, `PNT-2026-0014`; **the demo set
`default_category_id` on Chain guard and Mudguards + stays, where production has
both null and STATUS records Mudguards as deliberately unmapped**; test data on
`JP-LS2b` — raw 86, `JP-LS2b-RED` 10 (three TEST-marked movements incl. one
`disposed`), the inline-created colour `TEST Petrol` and its variant
`JP-LS2b-TEST-PETROL` at 3; **the offers verification: `OFF-2026-0001`
(converted, revision 2) and the `SO-2026-0017` it converted into**; and
**`OFF-2026-0004`** (snapshot verification: two revisions, accepted at rev 2)
and **`OFF-2026-0003`, an empty EUR offer kept deliberately** — it is the only
fixture that exercises the retail-price currency guard, since every template is
priced in DKK. All TEST-marked in their notes.

## Production data debts — the full list is Dennis's checklist
`docs/PRODUCTION-CHECKLIST-DENNIS-2026-09.md` holds all of it with click paths.
The ones that change numbers: **Jeudan declares Frame ×2** where its recipe holds
one (365 kr./bike of phantom paint cost); **Norma CS, Norma FS and Svajer F
declare no paintwork** while their recipes hold marked parts, so their margins
are overstated; **no `Sign` part exists** yet three templates send one to the
painter; **colour "RAL 5013" carries code 2150** — new colours can no longer be
saved with an invalid code and the row is flagged in the colours list, but which
half of it is wrong is still Dennis's answer, and it is on two orders;
`Jp -test 1` is a test bike in real stock and `JP-AND-DSP-NTC` holds 93 units
whose reason reads "test" (~26.000 kr.); 169/172 parts have no origin, 11 no HS
code, 166 supplier offerings no price, no part a reorder point, 17 suppliers no
email. **Production's paint shelf is empty and that is correct** —
`PNT-2026-0005` predates the model.

## Standing "not now" decisions (reasons in docs/DECISIONS.md)
- **M1 auth + RLS tightening — delayed (owner).** Trigger: the first real invoice.
  Re-read the SSO landmine above before reaffirming that.
- **CI Tier 2** (smoke in CI + Vitest over actions) — parked with M1.
- **Floor/office mode** (design plan §6) — approved, deliberately parked.
- **Sales track** (configurator + lead-gen) — earliest next year. Half of it
  turns out to exist already, on logocykler.dk; what is missing is the link back
  into the FMS. BACKLOG says so now.
- **Offers v1 deliberately omits** price templates (`is_price_template` stays an
  unused boolean) and revision rows.
- **A sales-order → offer reverse path is UNBUILT, not rejected.** Nothing about
  the offers decision says Dennis should stop starting at the sales order — a
  repeat customer ordering "another 20, same as last time" has nothing to quote.
  It is unbuilt only because six draft SOs are cheaper to migrate by hand than a
  button is to build. If his habit is to start at the order, build it: restrict
  it to a DRAFT SO with no MO, invoice or paint order, copy the lines to a new
  offer, and **delete** the draft — `cancelled` means *we lost this deal*, which
  is the mismodelling offers exist to end, so it must not be used for a draft
  that was never an order.
- **Next `CLAUDE.md` consolidation: first session of October.**

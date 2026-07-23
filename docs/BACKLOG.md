# Backlog — parked ideas & hardening

The durable home for ideas parked mid-session (session "chips" die with the
app). Add entries with enough context to act on cold; delete an entry when
the work ships or the idea is rejected. Active/sequenced work lives in
`docs/STATUS.md`; designed work has its own `docs/plan-*.md`.

## Hardening (do as it bites)
- **CI smoke-test pipeline** — curl every route on a running dev server
  (assert 200 + no "Runtime Error" / "TypeError" in the HTML) + a Vitest
  suite over the server actions. `tsc --noEmit` + `next build` are
  necessary but not sufficient — they miss RSC boundary violations and
  other runtime-only failures (lesson: commit fa1dbed, a server component
  calling a `"use client"` function). Owner parked it deliberately June
  2026 — manual browser verification before every commit is the safety net
  ("I like the discipline"). **Agreed revisit: the auth/first-real-invoice
  milestone** — build it alongside auth, since auth touches every page.
  Handover note: this is also the executable half of any team handover —
  the manual-verification discipline doesn't transfer with the repo.
- `audit_log` triggers (wait on auth for user_id).
- SQL-side pagination + stock-status filtering for the parts list at scale
  (currently in-memory in `src/app/parts/page.tsx`).
- Offline write-queue for the workshop-floor PWA.
- Whisper voice fallback for dictation.
- Bulk CSV import for parts/suppliers.
- Dashboard service-order aging card + the service-order detail page don't
  filter by service type — fix when service type #2 becomes real.
- Delete the now-unused enum-label helpers (`bikeStatusLabel`,
  `moStatusLabel`, `soStatusLabel`, `poStatusLabel`,
  `serviceOrderStatusLabel`, `invoiceStatusLabel`, `saStatusLabel`,
  `woStatusLabel`, `IMPORT_TAX_BASIS_LABELS`) when convenient — replaced by
  message namespaces; don't reintroduce them on new surfaces.

## Parked product ideas
- **Sales track: website bike-configurator + AI lead-gen agent** (parked
  2026-07-09 by the owner — "lay the bottom first"; his framing: earliest
  next year, debt down first):
  - Homepage configurator that talks to the app: customer designs a bike on
    jensenproduction.dk (phone-first), colour input → closest RAL from the
    `colors` vocab, pick paintable parts with live pricing (the per-part
    paint catalog makes this priceable), "send me an offer" → offer/quote
    in the FMS.
  - Lead-gen agent: monitor prospect signals (e.g. companies relocating to
    nearby business parks — the owner's DXC/Nordhavn example), identify the
    right contact, auto-draft outreach with the configurator link.
  Both belong with the offers/quotes module below.
- **Offers/quotes module** (old "Tier 5") — the price-breakdown surface
  lives here; service-contract → auto-add to the maintenance fleet rides
  along.
- **Template retirement flag** — an `is_active` archive for a
  referenced-but-discontinued template: designed, not built; add it when
  the first real case appears (unreferenced templates can already be
  hard-deleted).
- **Category ↔ HS-code suggestion table** — deferred 2026-06-19; the
  searchable HS combobox solved the actual gripe.

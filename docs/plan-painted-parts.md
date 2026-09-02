# Plan — painted parts are stock

**Status: model locked with the owner 2026-09-02 (chat); all four phases built
the same day. Open: question 1 below (one colour per bike).** Working document; the decision record is DECISIONS
2026-09-02 ("Painted parts are stock, per part and colour").

## 1. The problem, stated once

Dennis has raw frames on the shelf, painted frames on the shelf, frames away at
the painter, and frames built into bikes — and the same for forks, cargo beds,
mudguards, carriers, signs, anything the painter touches. He asks two questions
at the shelf: *how many painted X do I have, in which colours?* and *how many
raw?* Until today the system modelled the raw state (a part with stock) and the
built state (a bike), and faked the middle by making a bike-in-planning stand in
for a painted frame. That works when a frame is painted for a specific order and
breaks the moment a frame is painted for stock and later used for an order: the
order spawns its own MO with its own new bikes, and there is no path to hand the
painted frame across.

## 2. The model

A frame has three physical states; each has a home.

| State | Physically | In the system |
|---|---|---|
| Raw | A part in a box, per model | The base part, with stock |
| Painted | The same part, now model × colour, on the shelf | A **painted variant** of the base part, with stock |
| Built | A bike | A bike |

- **A part can be paintable.** `parts.service_part_type_id` says which of the
  painter's part types it is (frame, fork, cargo bed, …). That is what makes a
  specific part pickable on a paint-order line and priceable from the painter's
  tiered list — the same list the pricing brain already reads.
- **A painted variant is a part** with `base_part_id` (the raw part) and
  `color_id`. Created lazily, only when something is actually painted for stock,
  so the catalogue grows by the colours the shop really stocks, not model × RAL.
  Variants inherit category, unit, HS code and origin from the base; their SKU
  is the base SKU plus the RAL (or colour slug), their name the base name plus
  the colour name in each language.
- **Painting is the event that converts raw into painted.** When a stock paint
  order (one with no bikes attached) is received back, every line that names a
  specific part and a colour posts a movement pair: `paint_out` on the base
  part, `paint_in` on the variant, cost = the base part's prevailing unit cost
  plus the paint price frozen on the line (converted to DKK at the frozen FX
  rate), basis `derived`. The paint order is the source entity on both rows, so
  the ledger explains itself.
- **Painting for an order keeps today's flow** (bikes attached, build gate,
  traceability) and does NOT convert stock yet — phase 2 makes consumption
  colour-aware so the two paths can share one rule without double-consuming the
  raw part.
- **Paint stays a service type** with its own price lists and the freeze at
  send. Painted variants are the *product* of that service; products with stock
  are parts. This is not the retired "paint-as-part" SKU idea, which priced the
  painter's *work* as a catalogue item.
- **Bikes stay bikes.** They appear when a build is intended and nothing pretends
  a loose painted fork is a vehicle.

## 3. What the shop does differently

Nothing until it paints for stock. Then: a paint order with no bikes, whose
lines name the specific part (Norma 48 frame, not just "frame"), the quantity
and the colour. Send it as usual; mark it received back as usual. The painted
variants appear in stock with a real cost. Building a bike in that colour uses
them (phase 2 automates the pick; until then the workbench's substitute-part
dialog does it by hand).

For the painted frames already on the shelf today: create the variant by hand
(`New part`, name it base + colour, set base/colour once the form has them) and
book the count as a stock adjustment with a stated cost. Twenty minutes with
Dennis at the shelf. Every count afterwards is a query.

## 4. Phases

**Phase 1 — catalogue, lines, conversion (shipped 2026-09-02).**
Migration 91: `parts.service_part_type_id`, `parts.base_part_id`,
`parts.color_id` (both-or-neither check; one variant per base × colour), 
`service_order_items.part_id`, enum values `paint_out` / `paint_in`. Part form
gains "Paintable as". Paint-order lines gain an optional specific part, filtered
to raw parts of the line's type. Receiving back a bike-less order converts stock.
The part detail shows a base part's variants with on-hand per colour, and a
variant's base. The painter document names the specific part under the type.

**Phase 2 — colour-aware build (shipped 2026-09-02).** One rule in one place,
`resolvePaintedPick` in `painted-variants.ts`: a paintable requirement for a
bike in colour X draws from the painted variant in X when the shelf has enough,
otherwise from the raw base with *needs paint* set. `applyPaintedVariantsToBike`
re-points a bike's not-yet-consumed `bike_parts` rows by that rule — right
after the recipe copy (so the pick list shows what is physically picked) and
again at the top of `finishBikeBuild` (so the shelf at build time decides;
frozen rows are never touched). Consumption then runs off the rows unchanged,
so the variant's cost (raw + paint) flows into the bike. Order-tied paint orders
convert stock at receipt like stock orders, and the raw part is consumed once,
at the moment it goes to paint. MO coverage counts painted stock in the MO's
colour first and flags what raw still covers as *needs paint*; the floor queue
treats *needs paint* as a block alongside *at painter* and *parts short*.

**Phase 3 — the shelf view (shipped 2026-09-02).** `/parts/painted` shows, per
paintable part and colour, painted on hand, how much of it is promised to
unbuilt bikes on open MOs (same requirement rule as the floor queue, keyed by the
raw base so a row already on the variant and a recipe row on the raw part meet on
one key), what is free, and what is at the painter — counted from sent and
at-supplier order lines that name a part and a colour, because stock frames in
transit have no bike. A colour with demand but no variant yet still gets a line.
The dashboard's build band gained *need paint*: unbuilt bikes whose colour has no
painted stock for at least one part.

**Phase 4 — fill-from-bikes names the part (shipped 2026-09-02).** The seeder
maps each paintwork row to the recipe parts paintable as that type: one part
names the line, several give a line per part (no guessing), none leaves the line
by type only with a hint on the order page that it will not convert. Migration
92 taught the atomic replace RPC the `part_id` column. Receiving an order back
now reports how many lines converted and how many were skipped for lack of a
part.

## 5. Schema (migration 91)

```
parts.service_part_type_id  uuid  → service_part_types   -- paintable as
parts.base_part_id          uuid  → parts                -- variant of
parts.color_id              uuid  → colors               -- in this colour
  check: (base_part_id is null) = (color_id is null)
  unique (base_part_id, color_id) where base_part_id is not null
service_order_items.part_id uuid  → parts                -- the specific part
inventory_movement_type += 'paint_out', 'paint_in'
```

A variant of a variant is refused in code (the base must have
`base_part_id is null`). Variants inherit `service_part_type_id` so a painted
frame can be sent for repaint.

## 6. Files (phase 1)

- `migrations/91_painted_parts.sql` · `src/lib/types/database.ts` (hand-patched)
- Phase 2: `finish-build.ts`, `manage-bike-parts.ts` (recipe copy),
  `coverage.ts` + `coverage-section.tsx`, `bike-readiness.ts` + `/work`, the
  workbench row badge, `transition-status.ts` (order-tied conversion).
- Phase 3: `loadPaintedDemand` in `painted-variants.ts`, `/parts/painted`,
  `src/lib/dashboard/queries.ts` + the build band on `/`.
- Phase 4: `migrations/92_seed_lines_carry_part.sql`, `paint-seed.ts`,
  `seed-items.ts`, the no-part hint on the items section, the receipt summary
  in the paint-order header.
- `src/lib/parts/painted-variants.ts` — find-or-create a variant; convert stock
  for a received-back order.
- `src/app/paint-orders/[id]/_actions/transition-status.ts` — conversion on
  `received_back` for bike-less orders.
- `src/app/paint-orders/[id]/_actions/manage-items.ts`,
  `_components/service-order-items-section.tsx`, `page.tsx` — the specific
  part on a line.
- `src/lib/services/service-order-document.ts` + print + email — part label.
- `src/app/parts/_components/part-form.tsx`, `_actions/save-part.ts`,
  `new/page.tsx`, `[id]/edit/page.tsx` — "Paintable as".
- `src/app/parts/[id]/page.tsx` + a `painted-variants-section.tsx` — variants
  on the base, base on the variant.
- `messages/{en,da}.json`.

## 7. Open questions

1. **One colour per bike, or per part?** Today a bike has one colour and the
   template's paintwork rows all take it. If a customer wants a black frame with
   white mudguards, phase 2 needs per-row colour on `bike_template_service_parts`
   or on the MO. Not asked for yet.
2. **Negative raw stock at conversion.** Receiving back three painted frames
   when the raw SKU shows zero (opening stock never counted) will drive the raw
   part negative — the same standing audit hit as `JP-sap271`. Phase 1 allows it
   and reports it; the physical count fixes it, not a guard.
3. **Repaint.** A painted variant sent to the painter again in a new colour is a
   variant of the base in the new colour, and the old variant is `paint_out`.
   Phase 1 lets a variant be picked on a line; the conversion resolves its base.

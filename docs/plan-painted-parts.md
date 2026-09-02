# Plan — painted parts are stock

**Status: model locked with the owner 2026-09-02 (chat); phase 1 built the same
day. Phases 2–4 open.** Working document; the decision record is DECISIONS
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

**Phase 2 — colour-aware build.** When a bike's recipe is copied into
`bike_parts` (workbench, bulk build), a paintable BOM part is swapped for its
variant in the bike's colour when that variant has stock; otherwise the raw part
stays and the line is flagged *needs paint*. Order-tied paint orders then convert
stock at receipt too, and the raw part stops being consumed twice. MO coverage
reads painted stock first. This is the phase that closes the loop; it touches
`finishBikeBuild`, the recipe copy and coverage, so it gets its own verification
pass against fixtures before it ships.

**Phase 3 — the shelf view.** Parts list groups variants under their base with
a colour column; a "painted parts in stock" panel (per base × colour, with
demand from open MOs in that colour) on the stock-value page; "at the painter"
counted from sent-order lines rather than from bikes.

**Phase 4 — fill-from-bikes sets the part.** The seeder maps a template's
paintwork rows to the specific BOM parts of that type, so an order-tied paint
order arrives with parts named and needs no hand edit before sending.

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

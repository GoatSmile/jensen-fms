# What the parts data still can't tell us

**Jensen Production · parts & stock review · 26 August 2026**

Every live part was checked against stock, cost, duty and reorder settings.
Most of the catalogue is in good shape. Below is what is missing, ordered by
what it costs us to leave alone.

**Four boxes marked *Decision needed* are the whole ask.** Everything else is
here for context.

| | |
|---|---|
| Live parts | 172 |
| Stock held with no cost | 1 part · 499 units |
| Parts whose duty default is wrong | 159 |
| Parts with a reorder point set | 0 of 172 |

---

## Needs a decision

### 499 baskets worth nothing on paper

`JP-BasJen` — Basket for front mount Jensen model.

499 in stock, added on 1 July 2026 with the note *"est 010726"* and no price.
Because nothing records what they cost, they are valued at **0 kr.** in stock
value, and any bike built with one counts the basket as free.

The supplier offering on file is **5,50 USD**, which would put the batch
somewhere near 19 000 kr. — but that is a quote, not what we paid.

> **Decision needed.** What did we pay for these, roughly? An estimate is fine
> and can be back-dated to July.

### 93 display cards entered as a test

`JP-AND-DSP-NTC` — ANANDA 36v Display Canbus NTC card.

93 units on hand, from two stock entries whose reason is literally *"test"* —
one dated April 2024, one August 2026. They are counted as real stock today and
will be picked for builds.

> **Decision needed.** Are these 93 cards physically on the shelf, or should the
> entries be reversed?

---

## Import duty on the next order

### 159 parts will default to no import tax

Import tax is applied only when a part's **origin** says where it comes from.
Right now just **3 of 172** parts have an origin set. The other 159 have an HS
code and a tariff rate on file, but no origin — so a new purchase-order line
leaves the duty box unticked by default.

**Nothing has been lost so far.** 163 past PO lines did carry duty, totalling
**98 233,88 kr.** correctly inside landed cost, and 6 lines carried
anti-dumping on top. This is about what happens on the *next* order if nobody
ticks the box by hand.

> **Decision needed.** Worth an afternoon setting origin (EU / non-EU) across
> the catalogue?

### 11 parts have no HS code at all

Without an HS code there is no tariff rate to apply, so these always land
duty-free regardless of origin. Sixteen historical PO lines already went
through at a zero tariff.

---

## Missing prices

### No retail price — cannot be quoted or billed

`JP-AND-M100-CS` · `JP-AND-M100-PWR` · `JP-BR001` · `JP-brc6001f` · `JP-SLFFH01B`

These five have no customer price, so they cannot go on a work order or an
invoice line without one being typed in each time.

### No supplier on file — cannot be reordered

`JP-EDHC60003RNDHSG` · `JP-BR001` · `JP-AHBIM40PDC` · `JP-ShiRX010`

No supplier offering means no price, no MOQ and no lead time — these cannot be
added to a purchase order at all. `JP-BR001` appears on both lists, and sits in
6 bike recipes.

### Six parts with no cost and no stock

`JP-AND-M100-CS` · `JP-AND-M100-PWR` · `JP-EWHRX010FDAB` · `JP-EWHRX010RDACB` ·
`JP-sh-M405` · `JP-SLFFH01B`

Nothing to value, so no action needed — they will pick up a cost the first time
they are bought. Two of them (`JP-SLFFH01B`, `JP-AND-M100-PWR`) are in bike
recipes, so those templates currently under-state what a bike costs to produce.

---

## Settings worth a look

### No part has a reorder point

None of the 172 parts has an explicit reorder level, so every *low stock*
warning in the app falls back to a rule of thumb: **on hand ≤ 20% of the last
purchase quantity**.

That has one blind spot worth knowing. A part we have never bought through a
purchase order has no "last purchase quantity", so it can never show as low. It
goes straight from fine to out.

> **Decision needed.** Which parts are worth setting a real reorder level on?
> The busy 20 would cover most of it.

### 11 old stock movements without a recorded cost

Historical entries from before costs were required. They are flagged so they
can be found, and do not need fixing unless one of them matters.

---

## Fixed today — no action needed

Context so the numbers do not look surprising next time you open the app.

- **51 328,75 kr. of stock restored** — 766 units across 55 parts. Test bikes
  built in June had consumed real stock; that consumption has been reversed.
- **Sapim 271 spokes** were showing **−207** on hand. Now +9.
- **Test data removed** — 15 test bikes, along with their orders, tickets and
  work orders.
- **Invoice numbering reset.** Only test invoices had ever been issued, so the
  first real one will be `INV-2026-0001`.
- **Paint SKUs retired** — the four remaining `J.Jensen` painting items, which
  belong in the paint price lists rather than the parts catalogue.

---

*Figures read directly from the production database on 26 August 2026, after
the cleanup described above. Counts cover live parts only; archived and deleted
items are excluded.*

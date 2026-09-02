# Paint workflows — a walkthrough on the local copy

**For Nazar, September 2026.** A dated artifact, not a slot: rewrite it when the
flow changes, archive it when the shop has done this for real. Everything here
happens on the LOCAL database and is prefixed `TEST`.

The point is to see with your own eyes what Dennis asked for on 1 September,
where each piece lives in the app, and that the pieces connect. Do the scenarios
in order — each one leaves the shelf in the state the next one needs.

---

## 0 · What Dennis actually asked for

From the transcript, in his words where it matters. Each ask has a home now.

| Time | What he said | Where it lives |
|---|---|---|
| 00:19 | "I had to create the colors first in admin … it works, it's okay." | Admin → Lists → Colours. Scenario A step 1. |
| 00:19 | "I could send the order directly to the painter. I could in our earlier version. There was like a send button." | Paint order → **Print** (PDF) and **Email painter**, in the painter's own language. Emailing marks the order sent. Scenario B step 8. |
| 00:20 | "You cannot attach a specific order to the bike … can you be able to choose an order instead?" | Paint order → **Add bike** groups bikes by customer order; MO → **Send frames to painter**; SO → **New paint order**. Scenarios B and E. |
| 00:22 | "They go in, they find the order … it will say frame at the painter." | Sales order detail → the MO row shows frames and *N at painter*. Scenario B step 9. |
| 00:27 | "Do you want to create a paint order? If it's black and we have it on stock, I just put no." | The MO's coverage says whether painted stock covers the bikes; the *Send frames to painter* step is there when it does not. Scenarios C and D. |
| 00:28 | "At some point I need to know what I have in stock of painted frames." / "Do you have a way to see frames painted vs not painted? — No." | Parts → **Painted stock**: raw, at the painter, painted per colour, promised, free. Bikes list → *Paint* filter. Scenario C. |
| 00:16 | Kits: "if a kit was … the middle motor, cable, display … or if the whole bike is a kit." | Kits are box-sticker labels for picking, nothing else. Copying a bike is **Duplicate template**. His "kit" is a sub-assembly and is an open modelling question. Scenario A step 6. |
| 00:07 | "I saw that I could change the parts now. Put in the price, approximate purchase date." | Part → Stock section → adjust with a stated cost. Not repeated here; it worked for him. |

Not in this walkthrough: the phone flow ("call this number") and work notes — different arcs, different sessions.

---

## 1 · Before you start (10 minutes)

1. **Local database up.** `supabase start` in the repo. Postgres answers on
   `127.0.0.1:54322`.
2. **Start clean (recommended).** The local copy currently holds fixtures from
   the 2 September build session (a TEST customer with two built bikes, three
   TEST paint orders, painted variants in Maisgleb). Starting from a fresh
   production dump means you create every piece yourself, which is the point:

       supabase db dump --linked -f supabase/schema.sql
       supabase db dump --linked --data-only -f supabase/data.sql
       supabase db reset

   Then apply the migrations production has and the dump already contains —
   nothing to do; `db reset` loads the dump as-is. Contact data is anonymised
   by `supabase/anonymise.sql` as part of the reset.
3. **Dev server on LOCAL.** `scripts/use-db.sh local`, then `npm run dev`.
   The banner at the bottom of every page must read **Local database** in
   green. Red means you are about to test on Dennis's data — stop.
4. **Log in as Admin**, password `local-dev`. Admin sees English. If you want
   Dennis's view, log in as *Dennis Jensen* (his language is Danish; on local
   his password is whatever the dump carried — Admin is simpler).
5. **The TEST rule.** Every customer, supplier, template, part or frame number
   you create starts with `TEST` in capitals; every order you create gets
   `TEST —` at the front of its notes. Cleanup is then a query.

---

## 2 · The map — which screen answers which question

| Question | Screen |
|---|---|
| Which colours exist? | `/admin/lists?vocab=colors` |
| Who is the painter, what does painting cost, which language do they read? | `/admin/services` (price list, *Make default*) · `/admin/suppliers/<Metacoat>` (document language, email) |
| Which parts go to the painter? | Part → Edit → *Paintable as* |
| What does one bike send to the painter, and what does that cost? | Bike template → *Paintwork* section → cost-to-paint in the recipe box |
| How many painted frames do we have, in which colours, how many are free, how many are away? | `/parts/painted` |
| Which bikes are at the painter, painted-and-waiting, or unpainted? | `/bikes?paint=at-painter` · `?paint=painted` · `?paint=unpainted` |
| Is this customer's frame at the painter? | Sales order → *Manufacturing orders* table → *Frames* column |
| Can I build this MO, and what still needs paint? | MO → *Stock coverage* |
| What is blocking a bike on the floor? | `/work?tab=build` chips: *At painter*, *N parts need paint*, *N parts short* |
| What did the painter receive? | Paint order → *Print* (PDF) / *Email painter* |

---

## 3 · Scenario A — stage the shop (once)

Everything the later scenarios lean on. Roughly 15 minutes.

1. **A colour.** Admin → Lists → Colours → *New colour*. Name `TEST Blå` /
   `TEST Blå`, RAL `5015`, hex `#0075B2`, coating glossy. Save.
   *What to notice:* this is exactly what Dennis did with Maisgleb 1006. A
   colour is vocabulary; it exists once and is picked everywhere.
2. **The painter.** Admin → Suppliers → *Metacoat A/S*. Set *Document language*
   to Danish. The email is your test address on local (the anonymiser blanks
   real ones; put `nazar@valent.dk` if you want to test a real send — see §8).
   Then Admin → Service price lists: Metacoat's *SIK priser 2026* should carry
   the *Default* badge. Open it and read the tiers — this is where the price of
   painting a frame comes from, and it is per part type, tiered by quantity.
3. **Paintable parts.** Parts → search `Semilav 48cm` → open
   *Semilav 48cm f. Bafang M410 center* (`JP-SL48 B410C`) → Edit → *Paintable
   as: Frame* → Save. Do the same for *Forgaffel for semilav M410+*
   (`JP-KRD-241113-700c`) → *Fork*.
   *What to notice:* on the part page a *Painted variants* section appears,
   empty, saying none has come back painted yet. And Parts → **Painted stock**
   now lists both parts with raw stock and zero painted.
4. **The template's paintwork.** Bikes → Bike templates → *Norma CS* (48 cm).
   In the *Paintwork* section add *Frame* × 1 and *Fork* × 1. The recipe box
   now shows a cost-to-paint next to the parts cost, priced from Metacoat's
   current list at the singles tier, with the batch ladder beside it.
   *What to notice:* this is what one bike sends to the painter. Seeding a
   paint order from bikes reads this list, and names the specific parts from
   step 3.
5. **A TEST customer.** Customers → All customers → *New customer*:
   `TEST Ejendomsmægler Nord ApS`, segment *Real Estate Agency*, country DK.
   This stands in for Dennis's real-estate dealer.
6. **Kits, so the question is settled.** Parts → Kits: read one kit. It is a
   colour and a number for a sticker on a box. Back on the Norma CS template,
   *Label this recipe* would stamp one sticker code on every part of the
   recipe. That is all a kit is. To copy a template, use *Duplicate template*
   on the template page — try it, then delete the copy (it is unreferenced).

---

## 4 · Scenario B — a customer orders one bike in a colour you have not painted

Dennis's real-estate case, end to end. About 25 minutes. This is the one to
walk with him on Tuesday.

1. **The order.** Orders → Sales orders → *New sales order*. Customer: the TEST
   customer. Save. Notes: `TEST — walkthrough B`.
2. **The line.** On the order page, *Add line*: kind *Bike template*, template
   *Norma · 48cm · Norma CS*, quantity **1**, colour **TEST Blå**, unit price
   24 000. Save. The header shows subtotal, VAT, total.
3. **Confirm.** *Move to → Confirmed*. The order is now a commitment; any bike
   built for it will be slated to this customer automatically.
4. **Spawn the MO.** On the line's ⋮ menu → *Spawn MO*. You land on the MO:
   one bike created with a provisional frame number, the template's 47 parts
   as the recipe, and in the header both a link *Sales order SO-…* and the
   button **Send frames to painter**.
   *What to notice in Stock coverage:* every part covered except the frame and
   fork lines, which say *1 needs paint* — there is no blue painted stock. This
   is the system answering Dennis's "do we have it in black?" without a prompt.
5. **The floor already knows.** Work → Workshop floor → *Build* tab: the bike
   carries the chip *2 parts need paint* and is not ready.
6. **Send frames to painter.** Back on the MO, click the button. The form
   preselects the bike, painter Metacoat, colour — pick *TEST Blå*. Create.
7. **The paint order.** You land on `PNT-…`, planned, linked to the sales
   order, the bike attached, and two lines already there: *Frame* naming
   `JP-SL48 B410C` and *Fork* naming `JP-KRD-241113-700c`, both in TEST Blå,
   priced live from Metacoat's list. *Re-fill from bikes* would rebuild exactly
   these lines. Add notes `TEST — walkthrough B`.
8. **Send it.** Click **Print**: the document is in Danish (*Lakeringsordre*,
   *Leverandør*, *Stel*, the specific part named under each type, prices,
   *I alt*). That is the PDF Dennis hands or mails to Metacoat. Then click
   **Email painter**: the dialog says the order is still planned and emailing
   marks it sent, and that outbound test mode reroutes the mail. Send. Status
   is now *Sent to painter*, prices frozen, and the header says when and to
   whom it was emailed. (Without a Resend key on local the mail itself fails
   and the dialog says so honestly — the order is still marked sent. §8 shows
   how to make it really arrive.)
9. **The phone rings.** Open the sales order. The *Manufacturing orders* table
   shows the MO with *1* frame and the badge **1 at painter**. That is the
   answer whoever picks up the phone gives. Also: Bikes → filter *Paint: At
   the painter* lists the bike; Dashboard → Build band → *at painter* is 1;
   Parts → Painted stock → the frame row shows *1 at painter* under TEST Blå.
10. **The build is blocked.** MO → the bike → *Build*: the header says the frame
    is at the painter and *Finish build* is disabled.
11. **It comes back.** Paint order → *Move to → Received back*. A green line
    reads *Received back: 2 lines turned into painted stock*. Now:
    Parts → Painted stock → frame and fork each show *TEST Blå × 1 · 1 promised
    · 0 free*. The base part's page → *Painted variants* → TEST Blå, on hand 1.
    Open that variant: it is a part of its own, *Painted from* the raw one,
    with a movement pair on the raw and the variant and a cost of raw plus
    paint.
12. **Build it.** MO → bike → *Build*. Type a real frame number
    (`TEST-FRAME-B-001`) and *Confirm frame*. *Copy MO recipe*: the pick list
    now shows *Semilav 48cm … — TEST Blå* and *Forgaffel … — TEST Blå*, the
    painted variants, not the raw parts. *Finish build* → confirm who built it.
    The bike is *In stock*; its build cost includes the paint; Painted stock is
    back to zero in TEST Blå; raw stock of the frame is down by one — consumed
    once, when it went to paint.
13. **Deliver.** Sales order → *Move to → In production → Ready → Delivered*.
    The bike flips to *Assigned* to the TEST customer.

---

## 5 · Scenario C — paint for stock, then an order that needs no paint order

Dennis: "if it's black and we have it on stock, I just put no." About 15
minutes.

1. **A stock paint order.** Orders → Paint orders → *New paint order*: supplier
   Metacoat, colour *Black 9005*, notes `TEST — walkthrough C stock`. Create.
   No bikes — this is the difference from Scenario B.
2. **Lines that name the part.** *Add item*: part type *Frame*, specific part
   `JP-SL48 B410C`, quantity **3**, colour Black. Again for *Fork*, quantity 3.
   *What to notice:* the *Specific part* select only offers parts marked
   paintable as that type; leave it on *Any part of this type* and a hint says
   the line will not become painted stock.
3. **Send and receive.** *Move to → Sent to painter* (prices freeze; the 3s sit
   in the 1–9 tier), then *Move to → Received back*. The green line says
   *2 lines turned into painted stock*.
4. **The shelf.** Parts → Painted stock: frame and fork rows show *Black 9005
   × 3*, nothing promised, nothing at the painter. That is Dennis's "what do I
   have painted" answered.
5. **An order in black.** New sales order for the TEST customer, line Norma CS
   × **2**, colour Black 9005, confirm, *Spawn MO*.
   *What to notice on the MO:* coverage says *all covered for 2 bikes*; the
   frame and fork lines read *3 painted*, no *needs paint*. The *Send frames to
   painter* button is still there — because the system does not decide for
   him — but the coverage has already told him the answer is no. Painted stock
   now shows *Black × 3 · 2 promised · 1 free*.
6. **Build both.** For each bike: *Build* → confirm frame (`TEST-FRAME-C-001`,
   `-002`) → *Copy MO recipe* → the pick list shows the black variants →
   *Finish build*. Painted stock ends at *Black × 1 · 1 free*. No paint order
   was ever created for this sales order.

---

## 6 · Scenario D — two bikes, one painted frame

The mixed case, where the arithmetic shows. About 10 minutes.

1. Painted stock has one black frame and one black fork left from Scenario C.
2. New sales order, TEST customer, Norma CS × **2**, colour Black, confirm,
   *Spawn MO*.
3. **Coverage** on the MO: frame line *1 painted · 1 needs paint*, fork the
   same; header badge *2 parts need paint*. Painted stock shows *Black × 1 ·
   2 promised · over-promised by 1*.
4. **Floor**: the first bike would be ready, the second says *2 parts need
   paint* — the queue does not model two bikes competing, so both may read
   ready until one is built; the MO coverage is the honest cross-bike view.
5. *Send frames to painter* → the form offers both frames; **untick one** so
   only one goes. Create, send, receive back.
6. Build both bikes. The first copy takes the painted frame on the shelf; the
   second takes the one that came back. Either way each bike consumed exactly
   one painted frame and one painted fork, and raw stock moved only when frames
   went to paint.

---

## 7 · Scenario E — Dennis's original route: from the paint order side

This is the route he tried on 1 September and got stuck on. About 5 minutes.

1. New sales order, TEST customer, Norma CS × 1, TEST Blå, confirm, *Spawn MO*.
   Do **not** click *Send frames to painter*.
2. Orders → Paint orders → *New paint order* (Metacoat, TEST Blå). Create.
3. *Add bike*. Type the customer's name — `Ejendom` — in the search. The
   list groups by order: your sales order number with the customer's name, the
   bike under it; below, any stock-build MOs, then bikes on no order. *Select
   all* on the customer's group → *Add 1 bike*.
4. *Re-fill from bikes* → *Replace lines*: the lines come from the bike's
   template and name the parts. From here it is Scenario B from step 8.

---

## 8 · If you want the email to really arrive

On local the outbound secrets are absent by design. To see the Danish mail in
your inbox once: append `RESEND_API_KEY=…` from `env/prod.env` to `.env.local`
(never print it), restart the dev server, and on the local database set
`app_settings.outbound_from_email = 'orders@valent.dk'` and
`outbound_test_email = 'nazar@valent.dk'`. Test mode stays on, so every mail
reroutes to you with a TEST banner naming the intended recipient. Remove the
key line afterwards; `supabase db reset` restores the anonymised settings.

---

## 9 · Checklist — every ask, checked off

| Dennis's ask | You saw it at |
|---|---|
| Colours in admin first | A1 |
| A send button that sends something | B8 |
| Attach an order to a paint order | B6 (from the MO), E3 (from the paint order, by customer) |
| "Frame at the painter" when the phone rings | B9 |
| Painted vs not painted frames | C4, B11, and the *Paint* filter on Bikes |
| "Do we have it in stock? Then no paint order" | C5 |
| Prices that do not surprise | A2, B7 (tiers), B8 (frozen at send) |
| What a kit is, and how to copy a template | A6 |

## 10 · Cleanup

Everything you made says `TEST`, so finding it is one query per table
(`… like 'TEST%'` on names, `notes like 'TEST%'` on orders). Or simply
re-dump from production (§1 step 2); the local copy is disposable by design.

## 11 · What to write down as you go

For each step: did the screen say what this document says? Where did you
hesitate? Which label would Dennis not understand? Those three lists are
Tuesday's agenda, and they are the findings I need to fix the next round.

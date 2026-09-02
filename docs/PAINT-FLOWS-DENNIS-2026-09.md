# Painting in the app — where everything lives

**For Dennis, September 2026.** Written after our call on 1 September. Nothing
here is a task list. It is a map plus three flows, so that when you wonder
*"where do I see that?"* or *"what do I click first?"*, it is one line to look
up.

The buttons are named in English. Your login can show the app in Danish — the
buttons then read Danish but sit in exactly the same place.

---

## 1 · The one idea behind all of it

**A painted frame is stock, like any other part.**

A raw frame and the same frame in Maisgleb 1006 are two separate things on the
shelf, each with its own count and its own cost. The painter is what turns one
into the other: when a paint order comes back, the app takes the raw frames off
the shelf and puts painted ones on it, priced at what the raw frame cost you
plus what the painter charged.

That is why you can finally answer *"how many painted frames do we have?"* — and
why the app can tell you, before you build, whether a bike needs a trip to the
painter at all.

---

## 2 · The map — which screen answers which question

| What you want to know | Where you click |
|---|---|
| Which colours exist? | **Admin → Lists → Colours** |
| Who is the painter, and what does painting cost? | **Admin → Service price lists** — one price list per painter. *Make default* marks the painter we use unless told otherwise. |
| Which language does the painter read, and which address do we mail? | **Admin → Suppliers → Metacoat** — document language and e-mail sit on the supplier. |
| Which parts can go to the painter? | **Parts → All parts** → open the part → **Edit** → **Paintable as** |
| What does one bike send to the painter, and what does that cost? | **Bikes → Bike templates** → open the template → the **Paintwork** section. The price lands in the recipe box as **Cost to produce (parts + paint)**. |
| How many painted frames do we have, in which colours, how many are free, how many are away? | **Parts → Paint shelf** |
| Which bikes are at the painter, painted-and-waiting, or not painted? | **Bikes → All bikes** → the **Paint** filter → *At the painter* · *Painted, not yet built* · *Not painted* |
| Is this customer's frame at the painter? | **Orders → Sales orders** → open the order → the **Manufacturing orders** table → the **Frames** column says *"2 at painter"*. |
| Can I build this production order, and what still needs paint? | **Orders → Manufacturing orders** → open the MO → **Stock coverage** |
| What is blocking a bike out on the floor? | **Work → Workshop floor → To build**. The chips on each bike say **At painter**, **N parts need paint** or **N parts short**. |
| What exactly did the painter get from us? | **Orders → Paint orders** → open the order → **Print** (a PDF) or **Email painter**. Both come out in the painter's own language. |

---

## 3 · Flow A — a customer wants a colour we do not have

The normal case: an order comes in, the frames have to go out and come back
before anything can be built.

**1. Make sure the colour exists.**
**Admin → Lists → Colours → New entry.** Name it the way you say it out loud
("Maisgleb 1006"), give it the RAL code and the finish. You only ever do this
once per colour.

**2. Write the sales order.**
**Orders → Sales orders → New sales order** → the customer, the expected
delivery → **Create draft**. On the order, **Add line**: template, colour,
quantity. The colour is chosen here, on the line — not on the template.

**3. Confirm it.**
**Move to → Confirmed.** From this moment the bikes belong to that customer in
the app; you will see the customer's name on them everywhere.

**4. Spawn the production order.**
**Spawn MO** on the sales order. The app creates the MO, copies the template's
parts list into it, and creates the bikes with provisional frame numbers — one
per bike on the line. You do not add the bikes by hand.

**5. Look at what it says about paint.**
Open the MO → **Stock coverage**. If we have no painted frames in that colour,
it says so: *N need paint*. This is the app answering the question you asked me
on the phone — *"do you want to create a paint order? if it's black and we have
it on stock, I just put no."*

**6. Send the frames.**
**Send frames to painter** on the MO. Tick the frames, and you get a paint
order that is linked back to the sales order. (The same thing exists from the
other end — **New paint order** on the sales order — if that is where you
happen to be standing.)

**7. Check what the painter is being asked to do.**
On the paint order, the item lines are *what gets painted*: part type ×
quantity × colour. Prices come from Metacoat's current price list, in their
quantity tiers, and you can see them before anything is sent.

**8. Send it.**
**Email painter** — the document goes to Metacoat's address, in Danish or
English depending on what is set on the supplier. Two things happen at that
moment: the order becomes **Sent to painter**, and every price on it freezes.
A new price list next month will never rewrite what this order cost.
If you would rather hand over paper, **Print** gives you the same document as
a PDF.

**9. Now the shop can see where the frames are.**
The sales order's **Manufacturing orders** table shows *"2 at painter"*. On
**Work → Workshop floor → To build**, those bikes carry an **At painter** chip
and cannot be finished by accident. This is the *"they go in, they find the
order, it will say frame at the painter"* you described.

**10. When the frames come home.**
On the paint order, **Move to → Received back**. The app takes the raw frames
off the shelf and puts painted ones on, at raw cost + the painter's price.

**11. Build.**
Open the MO and build as usual. Each bike picks up the painted frame in *its*
colour by itself — you do not choose the painted part on the build screen.
**Confirm** the real frame number, then build.

---

## 4 · Flow B — we already have the colour on the shelf

Steps 1–4 are identical: colour, sales order, confirm, **Spawn MO**.

**5. Stock coverage says nothing needs paint.**
Because painted frames in that colour are already on the shelf, the MO's
**Stock coverage** shows them as covered and there is no *needs paint* flag.

**6. Skip the painter entirely.**
No paint order, no waiting. **Confirm** the frame numbers and build.

That is the whole flow — and it is the reason **Parts → Paint shelf** matters.
That screen tells you, per colour, how many painted parts are:

- **Painted** — physically on the shelf,
- **promised** — already spoken for by bikes that are not built yet,
- **free** — what is genuinely left for the next order,
- **at painter** — out of the building right now.

*Promised* is the number that stops the mistake of selling the same painted
frame twice. If it ever says **over-promised**, more unbuilt bikes want that
colour than we have painted parts for, and something has to go to the painter.

---

## 5 · Flow C — filling the shelf with no order behind it

This is the batch you send because it is sensible, not because a customer
asked: twenty black frames so the next twenty black bikes need no waiting.

**1. Start from the paint order, not from an order.**
**Orders → Paint orders → New paint order** → the painter, optionally a
**batch default colour** so the lines pre-fill → **Create paint order**.

**2. Say what gets painted.**
**Add item**: part type × quantity × colour. Do not add any bikes — that is
what makes this a stock batch rather than a customer's.

**3. Send it.** **Email painter** (or **Print**). Prices freeze, exactly as in
flow A.

**4. When it comes back: Move to → Received back.**
The frames appear on **Parts → Paint shelf** in that colour, priced at raw +
paint. From then on, any bike ordered in that colour is flow B — no painter, no
wait.

---

## 6 · Two honest limits

- **A colour has to exist before you can order in it.** You noticed this
  yourself: *"I had to create the colors first in admin."* That is deliberate —
  a typed-in colour name cannot be counted, priced or matched to a painted
  frame. Admin → Lists → Colours, once per colour, and it is available
  everywhere.
- **"Kit" still means the wrong thing here.** In the app a kit is a
  colour-and-number sticker on a parts box, so the floor can pick a complete
  set by code. What you described — a middle motor with its cable and display,
  or a whole bike, treated as one item — is a different idea, and a real one. It
  is on my list as an open question, not something the app does today. Copying
  a whole bike is **Duplicate template**.

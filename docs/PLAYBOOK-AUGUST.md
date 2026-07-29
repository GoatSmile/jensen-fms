# August playbook — for Dennis

Two pages for the solo stretch (Aug 3 → mid-August, until Nazar is back).
Dev/ops detail lives in `docs/OPERATIONS.md`; this is what to *do*.

## First day back — 10-minute orientation

**The app looks different.** That's the first thing you'll notice, so it's
first here. Everything works the same — nothing moved, no page changed
address, your bookmarks still land where they did. Details below.

What else shipped while you were away, in one breath: the whole app now
speaks Danish (switch not flipped yet — your call, see switches below);
phone calls to the test number become transcribed, pre-filled tickets
waiting in **Inbox** (shadow mode — a human always reviews); paint became a
general "services" model with your price lists in admin; the dashboard got
the money band + trend charts; and there's a new **Admin → People & roles**
where each role (workshop, accountant, sales…) can get its own login that
only shows their part of the app.

Nothing about your daily flow changed: bikes, orders, tickets, invoicing
all work exactly as before, same password.

## What looks different

The old look was fine but generic — it could have been any company's admin
tool. This version is built around your own colours and shapes instead.

**Colour now means something, consistently.** Six colours, same meaning on
every screen:

| Colour | Means |
|---|---|
| Blue | navigation, the main button, what's selected |
| Sand / gold | money — invoicing, prices, revenue. Also "worth a look" |
| Green | ready, in stock, on schedule |
| Red | genuinely wrong — overdue, blocked, out of stock |
| Rust | buying — suppliers, purchase orders, landed cost |
| Purple | admin, agreements, settings |

Red is deliberately rare. If you see red, something actually needs you. The
softer sand colour is the "keep an eye on this" level — a part shortfall, a
job waiting at the painter.

**Boxes are gone.** Sections used to be white cards with grey outlines
stacked on white. Now each section is a soft block of its own colour, which
is why the screen reads faster: you can see at a glance which parts of a
page are about money and which are about the workshop.

**The left menu is seven items instead of fourteen.** They group the way you
talk about the job — *Bikes · Parts · Work · Orders · Customers*, with
Dashboard and Admin on their own. Click a group to open it; **it stays how
you leave it**, on this machine, until you change it again. If you close a
group while you're working inside it, a small dot on the group reminds you
that's where you are.

Three things worth knowing:
- **Templates, families and kits are now under Bikes and Parts**, not buried
  in Admin. Kits are still on the Admin page too, so either route works.
- **All the drop-down lists live on one page now: Admin → Lists.** Part
  categories, colours, coatings, customer segments, bike families, HS codes,
  stock locations and the paint part types are tabs down the left. Click a row to
  edit it in place; "New entry" adds one. The old separate pages (Admin →
  Colours, Admin → HS codes, and so on) still work — they just send you here, so
  any bookmark you have is fine.
- **Stock value** and **work orders** now have their own menu entries rather
  than being reachable only through another page.

**A fix worth mentioning:** the dashboard used to show good news in alarm
colours — "Every open MO is on schedule." appeared in red. That was a bug.
All-clear messages now show a green tick.

If anything looks wrong rather than just new, send a screenshot (see "If
something looks wrong" below). Nothing about the look changed any data.

## Reading the dashboard (the 30-second morning check)

- **Top band = money on the table**: uninvoiced work, overdue invoices,
  agreements expiring, late POs. Cards only appear when something needs
  you; a green line means all clear.
- **Pipelines**: build (planning → at painter → in stock), repair, orders
  in flight. Click through to the lists.
- **Data housekeeping** (collapsed fold at the bottom): the self-serve
  task list below, with live counts.

## Quiet-hour tasks (each pays off immediately)

In rough priority order — all reachable from Dashboard → Data housekeeping:

1. **Supplier emails** (~18 missing) — Admin → Suppliers → set email per
   supplier. Done when the housekeeping count reads 0. Required before PO
   emailing goes live.
2. **Part origins (EU / non-EU)** — edit each part → Origin. Start with
   the China-sourced fast movers (motors, frames, wheels). Until set, new
   PO lines default to *no* import tax, which understates landed cost on
   Chinese parts.
3. **Purchase prices on supplier offerings** — on each part's page, fill
   the price per supplier. Drafted POs currently land at 0 kr. with a
   "set price" note; with prices filled they land ready to place.
4. **Reorder points on fast movers** — part edit form → reorder point +
   quantity. This switches on the reorder banner on the Parts page (it's
   built and waiting; it just has nothing to say until these exist).
5. **The 5 parts without an HS code** — the Ananda motor/cable variants
   and two small parts. Ask DA Custom Brokers before copying their
   "for cycle manufacture" TARIC splits — those dodge the 48.5 %
   anti-dumping and must match what they actually file.
6. **Invoice header details** — send Nazar the company CVR, bank account
   and address for the invoice header (this one is a code change). The
   invoice print page shows a warning until it's in.

## Weekly rhythm suggestions

- **Inbox once or twice a week**: review what the phone pipeline caught on
  the test number. Mark spam as spam (it learns nothing by magic, but the
  fold keeps the queue clean), use "Save this caller" when it recognises
  the company but not the number — that permanently improves matching.
- **Glance at the money band daily** — that's what it's for.

## Safe to explore

Everything. Creating parts, POs, tickets, templates, test customers —
all reversible, and the database is backed up nightly (plus drive backups).
The only genuinely consequential buttons are behind the switches below,
and those are all still off.

## Switches to leave alone (we flip them together mid-August)

- **Email test mode** (Admin → Settings → Communication) — while on, all
  supplier emails reroute to our test inboxes. Go-live also needs the
  orders@valent.dk mailbox to exist first.
- **Phone pipeline shadow mode** — and moving your company number onto
  the pipeline (it currently rides a US test number).
- **e-conomic production cutover** — needs the production token (expected
  end of July) + revisor confirmation of journal/account/VAT numbers.
- **Danish UI** (`app_language` / `worker_language`) — fully ready, one
  click. If pages suddenly render Danish, this got flipped — it's a
  setting, not a bug.

## Mid-August agenda (Dennis + Nazar)

Old-system data migration · invoicing-parity workshop → the first real
invoice · e-conomic production cutover · supplier-email go-live · your
company number onto the phone pipeline + graduation out of shadow mode ·
role passwords for the team (Admin → People & roles) + who-does-what
refinement · voice commands (dictate an order → drafted in the system).

## If something looks wrong

1. Screenshot the page (include the address bar).
2. Note what you clicked just before.
3. Send both to Nazar (nazar@valent.dk). Include the bike/order number if
   there is one.
Nothing you click can destroy data; worst case we restore last night's
backup.

## Login notes

- The shared password works as always and gives full access.
- Per-role passwords (workshop sees only the floor, accountant everything
  but admin, etc.) are built but **not armed** — no role has a password
  set. We set them together with the team in August.
- If you ever end up on a login screen that won't accept the password,
  that's the outer Vercel SSO layer — log in there with your Vercel
  account, then the normal password screen follows.

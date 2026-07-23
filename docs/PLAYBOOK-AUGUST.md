# August playbook — for Dennis

Two pages for the solo stretch (Aug 3 → mid-August, until Nazar is back).
Dev/ops detail lives in `docs/OPERATIONS.md`; this is what to *do*.

## First day back — 10-minute orientation

What shipped while you were away, in one breath: the whole app now speaks
Danish (switch not flipped yet — your call, see switches below); phone
calls to the test number become transcribed, pre-filled tickets waiting in
**Inbox** (shadow mode — a human always reviews); paint became a general
"services" model with your price lists in admin; the dashboard got the
money band + trend charts; and there's a new **Admin → People & roles**
where each role (workshop, accountant, sales…) can get its own login that
only shows their part of the app.

Nothing about your daily flow changed: bikes, orders, tickets, invoicing
all work exactly as before, same password.

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

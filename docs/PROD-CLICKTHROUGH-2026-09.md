# Production click-through — the 27–28 September features

**For Nazar, 29 September 2026.** Everything below was tested on the local copy
only. This is the first run in production (`jensen-fms.vercel.app`), about 20
minutes. Each step says what to do and what you should see. Tick the box, or
note what went wrong.

## Before you start

- ☐ **Log in as yourself.** A session from before 28 Sep picks up the new
  permissions by itself (no need to log out).
- ☐ **Check that email test mode is ON:** *Admin → Settings → Communication →*
  "Test mode — reroute all outbound email". With it off, a TEST paint order
  emailed from the app goes to the real painter, and Dennis gets real notices.
  If it has to stay off, use *Mark as sent* instead of *E-mail til lakerer*.
- ☐ **Everything you create gets TEST** at the front of its name, or in the
  notes for a numbered document, so it can be cleaned up with a query.

## 1 · Scheduled jobs — `/admin/jobs`

- ☐ *Admin* → *System* → **Planlagte job**. **Expect:** four jobs, each with a
  next run in Danish time.
- ☐ *Paint drop-offs* → **Kør nu** → confirm. **Expect:** "Nothing due today",
  recorded as run by you.
- ☐ **Tomorrow after 06:00:** the paint job shows a *scheduled* run. If it
  doesn't, check Vercel → *Settings → Cron Jobs*.

## 2 · A part created from the picker

- ☐ Open a sales order in draft → *Add line* → *Part / accessory* → **Ny del**.
- ☐ Create `TEST-BAT-PROD`, category *Batterier*, unit *pcs*.
  **Expect:** the new part selected at once, the line dialog still open.

## 3 · Parts-only order → delivery by signature

- ☐ **New sales order** for a TEST customer, notes "TEST", one line:
  `TEST-BAT-PROD` × 1.
- ☐ Confirm it, then *Flyt til*. **Expect:** **Klar** offered directly — no
  "in production" step for an order without bikes.
- ☐ Fill in the **Levering** panel: recipient, phone, address → *Gem*.
- ☐ `/work` → **Leveringer (1)** → the order. **Expect:** the delivery note
  with the battery and **no prices**.
- ☐ Type a name, sign on the pad, **Underskriv og lever**. **Expect:** the
  order *delivered*; the note shows the signature; `TEST-BAT-PROD`'s
  movements show a **Solgt** line.

## 4 · Paint order → Lakture

- ☐ *Ordrer → Lakordrer* → **Ny lakordre**, notes "TEST", one line, drop-off
  date = tomorrow.
- ☐ **Mark as sent** (or *E-mail til lakerer* with test mode on).
  **Expect:** status **Bekræftet**; any bikes on it are *not* at the painter.
- ☐ `/work` → **Lakture** → the order under *Skal afleveres*.
  **Expect:** what is in the boxes, no prices.
- ☐ **Afleveret nu**. **Expect:** it moves to *Hos lakereren*.
- ☐ **Lakereren siger, den er klar**, and set a pickup date.
  **Expect:** on the paint order's own page, status *Klar til afhentning*
  with the pickup date.
- ☐ **Hentet** → **Ja — hentet**. **Expect:** *Modtaget retur*.

## 5 · Finn's repair flow

- ☐ **Ny cykel** (`/bikes/new`): frame `TEST-WCK-PROD-001`, *in service*, a
  TEST customer. Add a recognition code, e.g. `TST01`.
- ☐ `/work` → search **tst 1**. **Expect:** the bike under *Cykler uden åbent
  arbejdskort* ("tst 1" finds TST01).
- ☐ **Nyt arbejdskort**. **Expect:** it opens the work order directly.
- ☐ **Start arbejdet** → **+15 min** → **Gem** → **Meld færdig**.
  **Expect:** the confirm step shows the time spent → **Bekræft — afslut**.

## 6 · Identifiers move, they don't duplicate

- ☐ A second TEST bike, `TEST-WCK-PROD-002`.
- ☐ Battery number `TEST-BAT-111` on bike 001, then the same number on 002.
  **Expect:** "*registered on bike TEST-WCK-PROD-001 — move it here?*".
- ☐ **Flyt det hertil**. **Expect:** on bike 001 the battery number shows as
  deactivated, with a note saying where it went.

## 7 · Two quick checks

- ☐ A template, opened as yourself: *Redigér*, *Dupliker* and *Slet* are there.
- ☐ A paint order's own page: the drop-off and pickup dates are editable in
  place.

## Not testable yet

- **Finn's "no prices" view** — Finn and Glenn get passwords today. As Admin you
  see money everywhere, so check the floor screens (`/work`, *Lakture*,
  *Leveringer*, a work order, a bike) once Finn is logged in.
- **An SO moving to *ready* when its last MO completes** — needs a built bike;
  leave it for the first real order.

## Afterwards: cleanup

Tell Claude the test is done. It dry-runs a delete of the rows marked TEST in
production, shows you the counts, and deletes only after you confirm.

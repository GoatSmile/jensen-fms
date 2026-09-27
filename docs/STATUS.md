# Status — Jensen FMS

**Last updated: 2026-09-27 (session end, the Sunday-afternoon sitting).** Five
slices from the go-live list shipped, all without Dennis's input and none with a
migration: **paint orders** now take the recipe, each bike's colour and one job
per sales order; the **build screen** stops stalling and opens with its parts;
**offers** get DK VAT, *Duplicate* and dictation; **Tuesday's Relatel kit**
(Finn's one-page PDF + a probe script); and the **bikes list pages** past the
1000-row cap, with the **recognition code** on the bike and customer pages.
Decided: DECISIONS 2026-09-27 (paint seeding). **Next: the Tuesday 29 Sep
visit** — plan §1.

This is the session-death recovery file: a fresh session (human or LLM) resumes
from `CLAUDE.md` + this file. **Overwrite it at session end — never append.**
History belongs in `docs/archive/`, decisions in `docs/DECISIONS.md`, parked
ideas in `docs/BACKLOG.md`.

## The frame
The 31 August cutover did not happen. **Parallel running** (DECISIONS
2026-09-01): the old system stays the system of record while the workshop does
small things in the FMS. Targets: **core functionality by October; Dennis wants
the system fully in use by 1 January** (15 Sep, 02:52) — money is tight and he
needs "something proven" for investors. Weekly Tuesday check-ins; Dennis's app
is Danish (person language).

## Where we are
- **v0.11.0** (tagged 2026-07-29), deployed on Vercel (push-to-`main` → prod).
- **Migration 103 is the latest; production verified at it** (`npm run
  check:prod`, 27 Sep, 15:11). Nothing this sitting needed a migration.
- **Production with `supabase db query --linked`** (writes pre-approved, owner
  2026-09-04; `-f` takes a whole file). **The local copy: `docker exec -i
  supabase_db_jensen-fms psql …`** — `--local` takes one statement per call.
- **Shipped 27 Sep (all verified locally in the browser, smoke 89/20/9/0):**
  - *Paint:* lines from the MO's recipe (declaration fills gaps), each bike in
    its own colour, a planned order takes more bikes, the spawn prompt waits for
    the last line (and could never show before), "no bikes" says why, receiving
    warns on part-less lines, preview link in the email dialog.
  - *Build:* one POST per workbench action (was two full renders), recipe copies
    on first open, one identifier rule everywhere (`requiredIdentifierProgress`),
    bike notes, empty-recipe MO notice + copy, *Ready for production /
    Klar til produktion* (was "Released").
  - *Offers:* DK_STANDARD default VAT (all 533 customers had none), *Duplicate
    offer*, Dictate in the offer / paint / PO send dialogs, template paintwork
    hints.
  - *Fleet-ready:* `/bikes` paged via `fetchAllRows`; recognition code on bike
    header + customer bikes panel; prefix editable on the customer form; call
    extraction knows the code's shape.
- **Relatel (read 27 Sep):** *Ny medarbejder* is locked until the company is
  MitID-validated (Dennis, MitID Erhverv); an existing employee can be made
  admin directly (pencil → *Indstillinger → Rettigheder*). Two-factor login is
  off. Details in OPERATIONS. Nothing was changed there.
- **Fleet register review files** (no database written):
  `~/Documents/1-Projects/Jensen/Fleet/import-review-2026-09-26/`. Re-run:
  `python3 scripts/import_fleet.py review`.
- **Finn Nysom and Glenn exist in production** — Danish, role *Workshop*, no
  password yet. Finn's email is `service@jensenproduction.dk` (his Relatel login).

## In flight — waiting on someone
- **Nazar:** click through the 27 Sep changes in production (a paint order from
  a real SO, a build screen, an offer line's VAT, and a few saves after the
  refresh sweep — any page that no longer updates after a save is a missed
  revalidation) — only local was checked, and
  no production session can be minted from here. Also still: Dennis-level
  logins see prices and *Adjust stock*. The Google calendar is started; it gets
  set up on Tuesday (Calendar ID + `GOOGLE_CALENDAR_SA_KEY` in Vercel +
  `.env.local` — secret, never in chat).
- **Dennis:** answers to `FLEET-IMPORT-DENNIS-2026-09.pdf` (asked; waiting — the
  missing-customer questions). `QUESTIONS-DENNIS-2026-09-24.pdf` is updated for
  Relatel but not sent; its section C mentions a guide that was never sent.
  MitID validation in Relatel if a second admin *user* is wanted.
- **Owner decisions, escalate:** service agreements per bike (plan §2A); paint
  lifecycle rework vs "emailing IS the send" (plan §2C); identifier overwrite
  and quantity-driven identifier counts (plan §2D).

## Landmines
- **Docker Desktop is running; the local stack and dev server are stopped.**
  `supabase start` brings the copy back with its data (TEST rows from 27 Sep:
  *TEST Lakflow ApS*, `SO-2026-0001`, `SO-2026-9901`, `PNT-2026-0009`,
  `OFF-2026-9901`/`0001` — all marked TEST). The local document counters lag
  production's.
- **With the browser pane hidden, streamed sections never reveal** — a button
  inside one looks broken. `window.$RV(window.$RB)` (CLAUDE.md caveats).
- **The `router.refresh()` sweep is done (27 Sep, evening):** about 100 redundant
  refreshes removed app-wide; four actions now revalidate the page they are
  used on (work-order details → `/work/<wo>`, locations → `/admin/lists`,
  supplier and people/role edit pages). Local browser check only.
- **Charger "numbers" on newer bikes are model codes** (`FY2010001` on dozens of
  bikes) — never import them as unique identifiers.
- **Version-1 sessions get `costs` if they hold `invoices`**
  (`src/lib/auth/session.ts`). Delete after 2026-10-27 (BACKLOG).
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — worked around on `:root` (DECISIONS 2026-09-13).
- **The local Supabase can never transcribe** (the provider fetches the signed
  URL) — end-to-end dictation means `use-db.sh prod`.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.

## Next actions — `docs/plan-go-live.md` §1 (before Tuesday 29 Sep, 13:00)
1. **Tuesday:** Finn's Relatel steps (`docs/RELATEL-FINN-2026-09.pdf` — print
   it); run `RELATEL_TOKEN=… node scripts/relatel-probe.mjs --watch=20` during
   the four test calls, then `--download`; delete the downloaded audio after.
   Passwords for Finn and Glenn; Finn walks one repair on his phone; set up the
   calendar; walk `PNT-2026-0012` with Dennis (the receive warning now exists).
2. **Fleet import** once Dennis answers: build `import_fleet.py sql` → a data
   migration (bikes on the customer, identifiers incl. recognition codes,
   delivered date → `assigned_at`); the list and search are ready for it.
3. Finn's Danish user guide (PDF); calendar slice 0 once the ID + key exist.
4. Next from the meeting (plan §2): delivery process (Dennis's "number one",
   §2B) — SO delivery contact, delivery note, finger signature.

## Checks — the baselines to match
- **Smoke, local (2026-09-27): 89 pass · 20 redirect · 9 skip · 0 fail.** Up from
  87/19/12 because the local copy now holds an offer and TEST orders; the skips
  are invoices, tickets, work orders, agreements and `/work/[woId]` (no rows).
- **Invariant audit** (not re-run this session): two standing hits — check 17
  (`JP-BasJen`, 500 units with no known cost) and check 18 (legacy
  `unit_cost_basis = 'none'`, 9 rows; can only shrink).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` (planning, no owner,
  no TEST marker) — real or test? One answer from Dennis.
- **Recognition prefixes per customer** (BK, GK, …) — now editable on the
  customer form; the register implies most; Dennis confirms.
- Glenn's surname, email, phone; whether Dennis's Trello export replaces the
  register; the service-agreement papers.

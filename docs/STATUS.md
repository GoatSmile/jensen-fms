# Status — Jensen FMS

**Last updated: 2026-09-27 (session end, the 26 Sep sitting).** Two migrations
and three slices shipped, and every open to-do now lives in one ordered list:
**`docs/plan-go-live.md`**. Shipped: **migration 102** (import provenance +
the recognition code; *Imported bikes* in the nav), **`scripts/import_fleet.py
review`** (the fleet register as review lists, no database written), and
**migration 103** (technicians see no money; Workshop trimmed). Decided (DECISIONS
2026-09-26): **Relatel is tested before a Twilio number is bought**; imported
bikes carry a provenance column; the recognition code is Jensen's own;
technicians cannot add stock. **Next: the Tuesday 29 Sep visit** — plan §1.

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
- **Migration 103 is the latest, and BOTH databases are verified at it**
  (`npm run check:prod` / `check:local`). Ask the command, do not reason about it.
- **Production with `supabase db query --linked`** (writes pre-approved, owner
  2026-09-04; `-f` takes a whole file). **The local copy: `docker exec -i
  supabase_db_jensen-fms psql …`** — `--local` takes one statement per call
  (CLAUDE.md → Migrations).
- **The 15 Sep meeting** is extracted item by item (timestamp + quote) beside
  the transcript in `~/Documents/1-Projects/Jensen/Misc - Transcripts/`; its
  to-dos are folded into the plan.
- **Relatel, read 2026-09-26 (nothing changed there):** plan *Omstilling
  Professional* (includes the API; no webhooks); **Finn, 42 47 15 51, already has
  Mobilfeatures** (network-side recording in and out); main number 70 21 05 46,
  menu 1 → Oprettelse, **2 → Finn**, 3 → Dennis, 4 → a message. Notes in plan §1A.
  Finn's Relatel edit page shows his SIM PIN/PUK — never copy them.
- **Fleet register review files** (no database written):
  `~/Documents/1-Projects/Jensen/Fleet/import-review-2026-09-26/` — summary,
  bikes, customers/departments, frames listed twice, number conflicts, the
  renewal schedule. ~926 distinct frames on 26 customer sheets; 11 personal-data
  sheets skipped; the monthly sheets are the per-bike renewal schedule (1 704 kr
  = 142 × 12; + 480 kr GPS). Re-run: `python3 scripts/import_fleet.py review`.
- **Finn Nysom and Glenn exist in production** — Danish, role *Workshop*, no
  password yet. Finn's email is `service@jensenproduction.dk` (his Relatel
  login). Workshop now holds `work`, `scan`, `bikes`, `parts` and sees no money.

## In flight — waiting on someone
- **Nazar:** check in production that Dennis-level logins still see prices and
  *Adjust stock* (the new pages were only checked locally — no production
  session can be minted from here). Create the Google calendar from the 26 Sep
  steps; the build needs its Calendar ID and `GOOGLE_CALENDAR_SA_KEY` in Vercel
  + `.env.local` (secret — never in chat). Review fleet files 2–4 (or pass the
  doubtful rows to Dennis).
- **`QUESTIONS-DENNIS-2026-09-24` is out of date on Relatel** — it says Relatel
  cannot hand over recordings and that option 2 goes to our own number; both
  changed on 26 Sep. Do not send it as is.
- **Owner decision, escalate:** service agreements are per bike in reality; the
  app models them per customer (plan §2A). Fleet-import scope/status questions:
  plan §7.

## Landmines
- **Docker Desktop is running; the local stack and dev server are stopped.**
  `supabase start` brings the copy back with its data. `scripts/use-db.sh` says
  LOCAL whether or not the containers are up.
- **The bikes list is unpaginated and the API caps a response at 1000 rows** —
  the imported fleet will bring it close (CLAUDE.md caveat). Paginate first.
- **Charger "numbers" on newer bikes are model codes** (`FY2010001` on dozens of
  bikes) — never import them as unique identifiers; the script keeps them in
  the source row only.
- **Version-1 sessions get `costs` if they hold `invoices`** (the deploy-safety
  upgrade in `src/lib/auth/session.ts`). Delete it after 2026-10-27 (BACKLOG).
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — worked around by declaring the font variables on `:root`
  (DECISIONS 2026-09-13). If fonts look wrong, check `--font-geist-sans` first.
- **The DA/EN dictation chip is a hint, not a constraint** (one sample, 13 Sep).
- **The local Supabase can never transcribe** (the provider fetches the signed
  URL; `127.0.0.1` is unreachable) — end-to-end dictation means `use-db.sh prod`.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.
- The e-conomic trial-vs-production grant remains as previously recorded.

## Next actions — `docs/plan-go-live.md` §1 (before Tuesday 29 Sep, 13:00)
1. **Relatel test kit**: Finn's one-page Danish instruction (recording on + a
   personal access token, as himself) + a probe script for `/calls` and
   `/voice_mails`; run it on Tuesday. Consent notice on the main number.
2. **Tuesday**: passwords for Finn and Glenn; Finn logs in on his phone and
   walks one repair; the Relatel test calls; Dennis's paint order
   (`PNT-2026-0012`); collect the agreement papers and the Trello-export answer.
3. **Fleet import: Dennis sorts out the open points** — `docs/FLEET-IMPORT-DENNIS-2026-09.pdf`
   (written 27 Sep, **not yet sent**): nine sheets whose customer is unclear
   (146 bikes), five default rules to confirm, four data questions (latest list?
   *SLUT22*? price 0? each customer's code letters), frames listed twice and
   number clashes in the appendix. Load after his answers — the ~780 clear bikes
   need nothing from him but the rules. *SLUT22* in column A on the Høje-Taastrup
   sheet is a marker, not a code (the codes sit in another column): the load step
   must not import it as a recognition code.
4. Finn's Danish user guide (PDF); calendar slice 0 once the ID + key exist.
5. Carried over: click `/offers` in production; send Dennis the production
   checklist + colour lists.

## Checks — the baselines to match
- **Smoke, local (2026-09-26): 87 pass · 19 redirect · 12 skip · 0 fail** — the
  same before and after this session's code. The drop from 92 is data: the
  local copy (refreshed 15 Sep, after the purges) has no ticket, work order,
  invoice, agreement or offer to render, so those detail routes SKIP. A SKIP is
  not a pass.
- **Invariant audit** (not re-run this session): two standing hits — check 17
  (`JP-BasJen`, 500 units with no known cost) and check 18 (legacy
  `unit_cost_basis = 'none'`, 9 rows; can only shrink).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` (planning, no owner,
  no TEST marker) — real or test? One answer from Dennis.
- **Recognition prefixes per customer** (BK, GK, …) — the register implies
  most; Dennis confirms. The column exists (`organizations.recognition_prefix`).
- Glenn's surname, email, phone; whether Dennis's Trello export replaces the
  register; the service-agreement papers.

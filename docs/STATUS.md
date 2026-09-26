# Status — Jensen FMS

**Last updated: 2026-09-26 (mid-session checkpoint).** Planning plus one shipped
slice. **Every open to-do now lives in one ordered list: `docs/plan-go-live.md`**
— STATUS, BACKLOG, the live plans and the 15 Sep meeting (every item extracted
with timestamp + quote, saved beside the transcript in
`~/Documents/1-Projects/Jensen/Misc - Transcripts/`). Shipped: **migration 102**
(import provenance + the recognition code), the **Imported bikes** nav item, and
`scripts/import_fleet.py review`. Decided: **test Relatel before buying a Twilio
number** (DECISIONS 2026-09-26). **Next: the Tuesday 29 Sep visit** — plan §1.

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
- **Migration 102 is the latest, and BOTH databases are verified at it**
  (`npm run check:prod` / `check:local`). Ask the command, do not reason about it.
- **Query production with `supabase db query --linked`** (writes pre-approved,
  owner 2026-09-04; `-f` takes a whole multi-statement file). **Locally, the CLI
  takes ONE statement per call** — apply a migration to the local copy with
  `docker exec -i supabase_db_jensen-fms psql -v ON_ERROR_STOP=1 -U postgres -d postgres < migrations/NNN_x.sql`
  (there is no host `psql`).
- **Finn Nysom and Glenn exist in production as people** — Danish, role
  *Workshop*, **no password on purpose**, so neither can log in until
  technicians stop seeing costs (plan §1C). Finn's email is
  `service@jensenproduction.dk` (his Relatel login). Glenn's surname, email and
  phone: ask Dennis.
- **Relatel, read 2026-09-26 (nothing changed there):** plan *Omstilling
  Professional* (includes the API; no webhooks); **Finn, 42 47 15 51, already has
  Mobilfeatures** (network-side recording in and out); main number 70 21 05 46,
  menu 1 → Oprettelse, **2 → Finn**, 3 → Dennis, 4 → a message. Full notes in
  plan §1A. Finn's Relatel edit page shows his SIM PIN/PUK — never copy them.
- **Fleet register review files** (no database written):
  `~/Documents/1-Projects/Jensen/Fleet/import-review-2026-09-26/` — summary,
  bikes, customers/departments, frames listed twice, number conflicts, the
  renewal schedule. ~926 distinct frames on 26 customer sheets; 11 personal-data
  sheets skipped; the monthly sheets are the per-bike renewal schedule (1 704 kr =
  142 × 12; + 480 kr GPS). Re-run: `python3 scripts/import_fleet.py review`.

## In flight — decisions waiting on the owner
- **Workshop role trim + a `costs` capability** (plan §1C): keep work, scan,
  bikes, parts; drop dashboard, inbox, maintenance; one capability gates every
  money figure. Must land before Finn and Glenn get passwords.
- **Bug found, not fixed: a Workshop user cannot open the build workbench** —
  `routes.ts` gates `/manufacturing-orders/*` on `mo` (plan §1C).
- **Fleet import load** waits for the review of files 2–4 and the scope/status
  questions in plan §7. **Service agreements are per bike in reality**; the app
  models them per customer — the modelling decision is plan §2A (escalate).
- **Google calendar**: Nazar is creating it from the steps given on 26 Sep; the
  build needs the Calendar ID (not secret) and `GOOGLE_CALENDAR_SA_KEY` in
  Vercel + `.env.local` (secret — never in chat).

## Landmines
- **Docker and the local stack are RUNNING** (started 2026-09-26); `supabase
  stop` keeps the volume. `scripts/use-db.sh` says LOCAL whether or not the
  containers are up.
- **The bikes list is unpaginated and the API caps a response at 1000 rows** —
  the imported fleet will bring it close (CLAUDE.md caveat). Paginate first.
- **Charger "numbers" on newer bikes are model codes** (`FY2010001` on dozens of
  bikes) — never import them as unique charger identifiers; the script already
  keeps them in the source row only.
- **Vercel ships HTML whose `next/font` class its own stylesheet does not
  define** — worked around by declaring the font variables on `:root`
  (DECISIONS 2026-09-13). If fonts look wrong, check `--font-geist-sans` first.
- **The DA/EN dictation chip is a hint, not a constraint** (one sample, 13 Sep).
- **The local Supabase can never transcribe** (the provider fetches the signed
  URL; `127.0.0.1` is unreachable) — end-to-end dictation means `use-db.sh prod`.
- **No production session can be minted from this machine** (`SITE_PASSWORD`
  lives only in Vercel) — authenticated production pages need a human.
- The e-conomic trial-vs-production grant remains as previously recorded.

## Next actions — see `docs/plan-go-live.md` §1 (before Tuesday 29 Sep, 13:00)
1. Relatel test kit: Finn's one-page Danish instruction (recording on + a
   personal access token, as himself) + a probe script; run it on Tuesday.
2. Owner's answers on the Workshop role / costs, then build it; then passwords.
3. Fleet import: review files 2–4 with the owner/Dennis → generate the load.
4. Finn's Danish user guide (PDF); calendar slice 0 once the ID + key exist.
5. Carried over: click `/offers` in production; send Dennis the production
   checklist + colour lists; walk `PNT-2026-0012` with him.

## Checks — the baselines to match
- **Smoke, local (2026-09-26): 87 pass · 19 redirect · 12 skip · 0 fail.** The
  drop from 92 is data, not code: the local copy (refreshed 15 Sep, after the
  purges) has no ticket, work order, invoice, agreement or offer to render, so
  those detail routes SKIP. A SKIP is not a pass. Production last measured 92 · 19
  · 7 · 0 before the purges.
- **Invariant audit** (not re-run today): two standing hits — check 17
  (`JP-BasJen`, 500 units with no known cost) and check 18 (legacy
  `unit_cost_basis = 'none'`, 9 rows; can only shrink).

## Data-entry debts (owner/admin work, not code)
- **Seven unclassified bikes** `JP-2026-E_BIKE-030…037` (planning, no owner,
  no TEST marker) — real or test? One answer from Dennis.
- **Recognition prefixes per customer** (BK, GK, …) — the register implies
  most; Dennis confirms. The column exists (`organizations.recognition_prefix`).
- Glenn's surname, email, phone; Dennis's Trello export (does it replace the
  register?); the service-agreement papers.

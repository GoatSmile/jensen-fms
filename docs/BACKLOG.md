# Backlog — parked ideas & hardening

The durable home for ideas parked mid-session (session "chips" die with the
app). Add entries with enough context to act on cold; delete an entry when
the work ships or the idea is rejected. Active/sequenced work lives in
`docs/STATUS.md`; designed work has its own `docs/plan-*.md`.

## Hardening (do as it bites)
- **The dependency tree is internally inconsistent** (surfaced by CI's first
  run, 2026-07-27, pre-existing). `npm ls` reports *invalid*:
  `next-intl@4.13.2` pulls `@swc/core@1.15.43`, which wants
  `@swc/helpers >=0.5.17`, while the lock pins the `0.5.15` that `next@16.2.5`
  brought. npm 11 tolerates it (both `npm install` and `npm ci` are clean, and
  `next build` passes), npm 10's `npm ci` refuses the lock outright — which is
  why `ci.yml` pins Node 24 / npm 11. Untangling it means re-resolving a
  transitive peer range, i.e. a dependency bump on live code: worth its own
  session, not a tail-end fix. Symptom to watch: a CI failure naming
  `@swc/helpers` is this, not a code change.
- **CI Tier 2 — the runtime layer, with auth/M1.** Tier 1 (`tsc` + `lint` on
  push) shipped 2026-07-27 as `.github/workflows/ci.yml`, so the lint class no
  longer reaches prod unchecked. **The route-sweep half then shipped as a local
  script on 2026-07-29** — `npm run smoke` (`scripts/smoke-routes.mjs`) fetches
  all 103 page routes with real ids and asserts status, error-overlay markers and
  missing i18n keys. So what remains for Tier 2 is narrower than this entry used
  to say: **wire that existing script into CI** (it needs the Supabase env vars
  as repo secrets and a running server in the job, which is why it waits) and add
  the Vitest suite over the server actions, which does not exist in any form. Two lessons behind it, both the same shape: commit `fa1dbed` (a server
  component calling a `"use client"` function) and the 2026-07-27 shell bug (a
  server component *spreading* a `"use client"` export — `tsc`, `lint` and
  `next build` were all green while five create forms shipped blank defaults).
  Build it alongside auth, since auth touches every page.

  Handover note: Tier 2 is the executable half of any team handover — the
  manual browser-verification discipline the owner relies on ("I like the
  discipline") does not transfer with the repo.
- **Public-action rate limits are IP-spoofable** (perimeter audit
  2026-07-23, low sev). `submit-report.ts`, `submit-general-report.ts`,
  `find-bike.ts` key their 5/hr (reports) and 30/hr (lookup) caps off the
  leftmost `x-forwarded-for` value, which is client-controllable → an
  attacker rotating the header floods `maintenance_tickets` + the public
  bike-images bucket. Damage is spam/storage cost, no data or key exposure.
  Fix: derive the key from a trusted hop (Vercel's real client IP) instead
  of raw XFF. Do when abuse appears or with the auth milestone.
- **`/api/qr/[bikeIdExt]` is a bike-existence oracle** (perimeter audit
  2026-07-23, low sev). Unauthenticated (all `/api/*` is outside both the
  SSO layer and the middleware gate); returns 404 vs 200 by row existence
  and echoes raw Postgres error text on 500. Bounded — UUIDs are
  unguessable, output is only a QR image, no writes/key. Fix: stop echoing
  DB errors; consider a generic 400. Low priority.
- **VC-1 command actions have no capability gate or rate limit** (review
  2026-07-23, low). `createCommandFromText` / `rerunCommandAgent` /
  `applyCommandAction` (src/app/inbox/_actions/command.ts) only read the
  session to STAMP a person id — no `can()` check (consistent with the whole
  app: server actions are POST endpoints behind Vercel SSO, roles are a UX
  wall). A low-cap SSO'd user could POST directly and spin the agent loop
  (Anthropic cost) or write drafts. Fix with the auth/M1 pass (cap-gate
  server actions + a per-user rate limit on agent runs). Also:
  `applyCommandAction` trusts client-supplied open-slot ids without checking
  membership in the server-rendered vocab (only the DB FK guards them) — a
  crafted request could pick a superseded (is_current=false) template. Same
  UX-wall caveat; validate slot ids against the fetched lists when auth lands.
- **Command-plan `quantity` is not an editable open slot** (found 2026-07-26
  building the sales-lead path). `DraftSalesOrderAction.quantity` is a filled
  number, so when a caller states a total but no per-type counts ("ca. 25
  cykler… nogle få elcykler… et par ladcykler"), each proposed line lands at
  qty 1 and the reviewer has to fix it on the draft SO after applying. The
  agent does say so in the line note, so nothing is silently wrong. Fix:
  promote `quantity` to a slot the CommandPlanPanel can edit before Apply —
  worth doing the first time a real multi-quantity enquiry arrives.
- `audit_log` triggers (wait on auth for user_id).
- SQL-side pagination + stock-status filtering for the parts list at scale
  (currently in-memory in `src/app/parts/page.tsx`).
- Offline write-queue for the workshop-floor PWA.
- Whisper voice fallback for dictation.
- Bulk CSV import for parts/suppliers.
- Dashboard service-order aging card + the service-order detail page don't
  filter by service type — fix when service type #2 becomes real.

## Parked product ideas
- **Sales track: website bike-configurator + AI lead-gen agent** (parked
  2026-07-09 by the owner — "lay the bottom first"; his framing: earliest
  next year, debt down first):
  - Homepage configurator that talks to the app: customer designs a bike on
    jensenproduction.dk (phone-first), colour input → closest RAL from the
    `colors` vocab, pick paintable parts with live pricing (the per-part
    paint catalog makes this priceable), "send me an offer" → offer/quote
    in the FMS.
  - Lead-gen agent: monitor prospect signals (e.g. companies relocating to
    nearby business parks — the owner's DXC/Nordhavn example), identify the
    right contact, auto-draft outreach with the configurator link.
  Both belong with the offers/quotes module below.
- **Offers/quotes module** (old "Tier 5") — the price-breakdown surface
  lives here; service-contract → auto-add to the maintenance fleet rides
  along.
- **Template retirement flag** — an `is_active` archive for a
  referenced-but-discontinued template: designed, not built; add it when
  the first real case appears (unreferenced templates can already be
  hard-deleted).
- **Category ↔ HS-code suggestion table** — deferred 2026-06-19; the
  searchable HS combobox solved the actual gripe.

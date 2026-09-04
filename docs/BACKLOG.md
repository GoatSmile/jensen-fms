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
- SQL-side pagination + stock-status filtering for the parts list at scale
  (currently in-memory in `src/app/parts/page.tsx`).
- Offline write-queue for the workshop-floor PWA.
- Whisper voice fallback for dictation.
- Bulk CSV import for parts/suppliers.
- Dashboard service-order aging card + the service-order detail page don't
  filter by service type — fix when service type #2 becomes real.

## Providers & channels (the swappable seams)

What each capability runs on today, the realistic alternative, and why it is
parked. **Doctrine reminder (CLAUDE.md):** a new provider is an adapter behind
the stable interface plus a registry entry — never a config-only switch, and
never an unbuilt integration you can select. Munin has already paid for some of
this evaluation (`~/workspace/code/munin/docs/BACKLOG.md` → *Channels &
capabilities*); borrow it rather than re-running it, but note that Munin's live
`<Gather>` conversation constraints are NOT ours.

- **Transcription** — built: `gladia` (EU-native, the default) and `azure`
  (built, needs a region, and the only one supporting dual-channel, which is how
  bridged calls get deterministic speaker attribution). Two parked options:
  - **xAI STT** — assessed by Munin 2026-07-30: a ~90-line adapter, one REST
    POST to `api.x.ai/v1/stt`, same signed-URL input, $0.10/hr, Danish native,
    diarization included. The reason it is interesting *for us* is **keyterm
    biasing, up to 100 terms** — a direct shot at the failure that costs us
    most: mangled part names, frame numbers, customer names and Danish
    toponyms. We could feed `parts.name_en`, `bike_families`, colour names and
    `organizations.legal_name`. Parked on Munin's ground: xAI's EU residency
    and zero-retention terms are an enterprise-tier conversation, so vet the
    DPA before sending customer call audio anywhere near it.
  - **ElevenLabs Scribe v2 / AssemblyAI Universal-3** — Munin defers both
    because *streaming* needs a Twilio Media Streams bridge they would have to
    own. **That constraint is not ours**: our path is record-then-transcribe, so
    a batch REST endpoint is sufficient. If Gladia's Danish accuracy on real
    workshop calls disappoints, these are reachable for us far more cheaply than
    for Munin. Do not build until Gladia is measured and found wanting on real
    traffic — which cannot happen until a Danish number is connected.
- **Extraction (text → who / what / intent)** — built: `anthropic` only.
  **Mistral is the option worth knowing about**, and not for accuracy: Claude is
  currently the ONLY hop outside the EU anywhere in the system (audio stays in
  Europe; only the transcript leaves). An EU-resident model would make the whole
  pipeline end-to-end European. Jensen's customer segments are hospitals and
  municipalities, so a tender or a DPO asking this question is not hypothetical.
  Park it as a lever we know how to pull, not as work to do now.
- **Telephony** — built: `twilio` only. Alternatives exist (Sinch, Bird,
  46elks, Telnyx) and **none has been evaluated**. Deliberately so: the pressing
  telephony question is not the vendor but connecting Dennis's own Danish number
  (three options in `docs/ARCHITECTURE-OVERVIEW.md`). Only evaluate a second
  vendor if Twilio turns out to be unable to port a Danish number on acceptable
  terms.
- **Geocoding — the one with a free win sitting on the floor.** Runtime
  geocoding is Nominatim (`src/lib/geocode/nominatim.ts`; keyless, public, and
  their policy wants a contact address in the User-Agent). But the bulk import
  already uses **DAWA** (`scripts/geocode_dawa.py` — "free, unlimited, and
  accurate on Danish addresses", with a postnr-centre fallback), and the runtime
  path never got the same treatment. Promote DAWA to the runtime geocoder with
  Nominatim kept for non-DK rows — precisely the split that script's docstring
  already describes. Small, self-contained, and strictly better for a Danish
  customer base.
- **Outbound email** — Resend, EU region, `valent.dk` verified. No reason to
  move; alternatives (Postmark, Brevo, Mailgun EU) are commodity. Revisit only
  if the free allowance stops covering us.
- **SMS** — GatewayAPI (Danish alphanumeric sender), still planned/partial.

Explicitly NOT applicable to us from Munin's list: ElevenLabs TTS and
ConversationRelay (Munin speaks back; we record and draft), per-member Google
OAuth, and the WhatsApp channel — though WhatsApp could return one day as a
*customer* channel, and Munin's research already concluded there is no ToS-safe
path to a personal inbox, so it would have to be a Jensen-owned sender.

## Parked product ideas
- **Sub-assemblies — what Dennis calls a "kit"** (escalated as a modelling
  question 2026-09-02; owner's call to escalate, not build). On the 1 Sep call
  Dennis described a kit as the frame plus the motor, cables, display and
  sensor that MUST travel together because they fit that frame — while saddle,
  handlebar, tyres and rims vary freely. That is a **sub-assembly**: a named,
  reusable group of parts inside a recipe. The app has no such concept. What it
  has instead: `kits` are colour+number sticker labels for part boxes (a floor
  picking aid, CLAUDE.md), and template reuse is "Duplicate template" / "Save
  as new version" — neither expresses "these parts belong together". Dennis's
  blocker was real: they held off building templates until "kit" was defined.
  Questions for the planning chat: (1) is a sub-assembly a **template
  fragment** (a reusable part-group that templates include by reference, so a
  motor-system change propagates) or just a **duplicate-from base template**
  (copy, then edit — no propagation, zero schema)? (2) does a sub-assembly ever
  get *built or stocked* on its own (then it is a part with its own BOM, i.e.
  a phantom/assembled part in inventory), or is it purely a recipe grouping?
  (3) does it interact with paint — the frame+fork pair already lives in
  `bike_template_service_parts`? Cheapest honest answer today: tell Dennis kits
  are box stickers and unblock with Duplicate template; decide (1)–(3) before
  anyone models it.
- **Sales track: website bike-configurator + AI lead-gen agent** (parked
  2026-07-09 by the owner — "lay the bottom first"; his framing: earliest
  next year, debt down first):
  - Homepage configurator that talks to the app. **Half of this already
    exists and is not ours**: the bike designer runs at
    `logocykler.dk/cykeldesigner` — frame, colour from a 191-entry RAL table,
    saddle, grips, box, logo. (It is NOT on jensenproduction.dk, which this
    entry used to claim; that domain just iframes jensen-cykler.dk. Survey in
    OPERATIONS.) What is missing is the link back: "send me an offer" →
    a draft offer in the FMS, with the configuration and its picture attached.
    Also unbuilt there: pick paintable parts with live pricing, which the
    per-part paint catalog now makes priceable.
  - Lead-gen agent: monitor prospect signals (e.g. companies relocating to
    nearby business parks — the owner's DXC/Nordhavn example), identify the
    right contact, auto-draft outreach with the configurator link.
  The configurator's "send me an offer" now has somewhere to land: `/offers`
  shipped 2026-09-04.
- **Price breakdown on an offer** — cost to produce (parts + paint, which the
  template box already computes) shown beside the quoted price, so the margin
  is visible while quoting rather than after. Internal only: it must never
  reach the printed or emailed document. Was bundled into the offers module
  entry; that module shipped 2026-09-04 without it.
- **Service contract on an offer → auto-add to the maintenance fleet** — the
  other rider on the old offers entry, also unbuilt. Wait for a real quote that
  includes an agreement.
- **Template retirement flag** — an `is_active` archive for a
  referenced-but-discontinued template: designed, not built; add it when
  the first real case appears (unreferenced templates can already be
  hard-deleted).
- **Category ↔ HS-code suggestion table** — deferred 2026-06-19; the
  searchable HS combobox solved the actual gripe.

# Plan — design refresh (UI / UX / IA)

**Status: BUILT AND SHIPPED 2026-07-26.** The owner promoted this to now so the
new look would be live before Dennis returns **Mon 3 Aug**. Read §14 first — it
records what actually shipped and where this document is now wrong. §§1–13 are
the original audit, kept because the diagnosis and the measurements are still
the reasoning behind the code; the *sequencing* in §10 is superseded.

## 0. Decisions locked (2026-07-26)

| Question | Decision |
|---|---|
| Look and feel | **Direction B — "Emalje"**, the colour/shading/flat-fill system |
| Direction A ("Værksted") | **Rejected.** Paper-and-hairlines is out |
| Typeface | **Keep Geist.** No display face — contrast comes from weight and size alone |
| Wordmark | **Keep** the "Ægte Jensen · KVALITETSCYKLER" lockup as set |
| Buttons | **Keep B's** pill buttons |
| Navigation | **7 groups**, not 14 flat items |
| Group open/closed state | **Remembered per person and persisted.** Independent toggles — *not* an accordion |

Consequences worth noting, because they change earlier sections:

- §5's recommendation (A as base, borrowing from B) is **superseded** — B is the
  base outright. Everything about paper grounds, Fraunces and hairline-instead-of-box
  in §5 Direction A is dead; read it as rejected-alternative history only.
- Dropping the display face means B's identity now rests **entirely** on colour,
  shading and shape. That raises the stakes on colour governance (§5's warning
  about B) rather than lowering them: there is no typographic fallback if the hue
  vocabulary drifts.
- Persisted group state **rules out the accordion.** If opening one group closed
  another, "once it's open it stays open" would be broken by the next click. See §7.

Live mock-up of the chosen direction: `docs/mockups/design-directions.html`
(toggles Current vs B, three pages, 14-flat vs 7-group nav, light and dark).

Companion: `docs/plan-cutover.md` — the 31 Aug transfer date constrains what is
safe to do before Dennis sees this version. §10 sequences against it.

---

## 1. How I looked

Ran the app locally and photographed the real surfaces at desktop and mobile:
dashboard, `/parts` list, part detail, `/admin`, `/admin/settings`, `/work`
(desktop + phone). Then counted the patterns in source rather than trusting
impressions:

| Measure | Count |
|---|---|
| Routes (`page.tsx`) | **102** |
| Top-level nav items | **14** in 4 groups |
| `rounded-* border` surface declarations | **345** across **187** files |
| Files using the shared `Section` component | **15** |
| Files hand-rolling a bordered surface instead | **159** |
| shadcn `Card` imports | **0** |
| ALL-CAPS eyebrow labels (`uppercase`) | **59** |
| Files using the pastel section tints | **18** |
| Controls on `/admin/settings` (7 domains, one page) | **~40** |
| Fields: organization form / part form / supplier form | **16 / 15 / 14** |

That last block is the story: **there is no surface abstraction.** The card look
is copy-pasted 345 times. This matters enormously for what a refresh costs, and
it drives the whole sequencing in §10.

## 2. Diagnosis — why it reads as "2015 corporate"

You are right, and it is diagnosable rather than a matter of taste. Six causes,
in order of how much they contribute:

**1. Card soup.** Every element is `rounded-md border bg-background`. The
dashboard is nine cards of identical visual weight; part detail has ~11 bordered
rectangles nested up to three deep. When every element is boxed, *nothing* is
emphasised — the eye has no entry point and the page reads as a form to be
processed. This is the single defining trait of 2010s enterprise UI (Bootstrap
panels, Salesforce Lightning cards), and it is the biggest contributor.

**2. Four-up boxed KPI tiles with ALL-CAPS eyebrows.** "STOCK ON HAND · DEFAULT
RETAIL PRICE (EXCL. VAT) · STOCK VALUE · SUPPLIERS" across the top of part
detail; "VISITS · SEND-A-MESSAGE VISITS · REPORTS SUBMITTED" on settings.
CLAUDE.md defends the caps as a design token and they *are* legible — but the
*boxed four-across metric row* is the most dated pattern in business software.
It says "executive dashboard, 2014" more loudly than anything else on screen.

**3. Pastel section tints.** `/admin` is three tinted columns (sky, amber,
emerald) containing white cards inside a white page — three levels of nesting,
and the tints read as highlighter rather than as system. The hue vocabulary is
documented in CLAUDE.md and genuinely thought through, but a convention nobody
can see without reading the docs is not doing visual work. This is the most
"corporate intranet" screen in the app.

**4. No typographic voice.** Geist for headings, body, labels and numbers.
Geist is excellent and completely neutral — it is the framework default, so the
app inherits "generic developer tool" for free. The type scale is compressed
(h1 ≈30px against 15px body), so pages are tonally flat: no display moment, no
editorial contrast, nothing that feels authored.

**5. Monochrome plus one blue.** White ground, gray hairlines, near-black text,
navy accent. The intent was restraint; the effect is clinical. Danish design is
not colourless — it is *warm neutral* (bone, oat, chalk, clay) with confident
accents. Pure `#FFFFFF` ground and neutral-gray borders are what make it feel
like software rather than like an object.

**6. Chrome-heavy.** A permanent 280px sidebar with 14 items, then breadcrumb +
h1 + subtitle + action row before any content — roughly 180px of vertical
chrome. On a 13" laptop that is a third of the viewport spent on furniture.

## 3. The finding that reframes everything: you already have a brand

`public/logo-jensen.webp` is a hand-drawn outlined script — *Ægte Jensen ·
KVALITETSCYKLER* — with "Ægte" in a black rotated tag. It is warm, irregular,
crafted, and unmistakably a heritage Danish bicycle maker. *Ægte* means
genuine.

The interface has **no relationship to it whatsoever.** The logo sits in the
sidebar like a sticker on a filing cabinet, and everything below it is a Vercel
template. That gap *is* the "feels like Salesforce" feeling — not the layout,
the absence of the company in its own software.

This is good news: you do not need a brand invented, you need the one you have
extended into the UI. Everything in §5 follows from that.

(Related bug: at mobile-header size the detailed lockup renders ~20px tall and
is illegible. `public/icon-mark.svg` already exists and is not used there.)

## 4. What is already good — do not throw it away

Being fair to the existing work, because a refresh should keep these:

- **`/work` (workshop floor) is the best-designed screen in the app.** Big
  touch targets, one job card with a coloured left rail, segmented tabs,
  generous space, no card soup. On mobile it is genuinely excellent. This
  proves the design capability is there — it appeared where the constraint was
  sharp ("one person, one task, gloves on").
- **The token layer is thoughtful.** oklch throughout, a deliberate 5-hue chart
  palette chosen for side-by-side legibility, a documented brand accent,
  15px/16px responsive body sizing with a real rationale.
- **Numeric discipline.** 84 files use `tabular-nums`; the money component
  greys the decimals. That is better than most commercial software.
- **Progressive disclosure exists** — part detail's collapsed "Details" fold is
  exactly the right pattern. It is just not applied consistently.
- **Print is properly handled** as a first-class output.

## 5. Two directions for look and feel

Genuinely different, not variations. Both keep Geist for body text and both are
implementable almost entirely in `globals.css`.

### Direction A — "Værksted" (workshop ledger)

**Thesis:** the app should feel like a well-made paper instrument — a workshop
ledger, a parts catalogue, a Danish standards document. Warm paper ground, ink
type, **hairline rules instead of boxes**, one accent used like a stamp.

Ground and surface:
```
--paper      oklch(0.978 0.006 85)   #FAF8F3   page ground (not white)
--surface    oklch(1 0 0)            #FFFFFF   raised — used rarely
--ink        oklch(0.24 0.012 60)    #322D28   warm near-black
--ink-muted  oklch(0.53 0.012 65)    #7D766D
--rule       oklch(0.905 0.008 80)   #E6E2DA   hairline
```
Accent — two options, your call:
```
petrol   oklch(0.40 0.055 195)  #1E5057   old bicycle enamel; warmer with paper
navy     oklch(0.36 0.105 255)  #1E4A7A   today's brand blue, unchanged
```
Semantic set:
```
--money   oklch(0.60 0.095 62)   #9E7340   clay/ochre
--good    oklch(0.52 0.065 148)  #4A7355   moss
--alert   oklch(0.50 0.155 28)   #A33A26   brick
```
Dark mode: warm charcoal `oklch(0.195 0.008 70)`, never pure black.

**Surface rule — the change that does most of the work:** a section is a
heading, a hairline rule, and content, separated by 32px of space. Borders
survive only on genuinely interactive tiles, table containers, and inputs.
That alone removes most of the 345 boxes.

Type: keep Geist for UI and body. Add **one display face** for page titles and
hero numbers only — my pick is **Fraunces** (variable, slightly wonky
soft-serif, industrial-vintage; the closest thing on Google Fonts to the
hand-drawn logo). Alternative if that reads too editorial: **Bricolage
Grotesque** (sans, characterful, lower risk). Push the scale:
`h1 clamp(1.75rem, 3.5vw, 2.5rem)`.

Radius: 0.625rem → **0.5rem**. Slightly crisper reads as "made", not "app".

**Feels like:** a good hardware catalogue. Quiet, warm, confident, unmistakably
not Salesforce. **Risk:** low. **Effort:** mostly tokens.

### Direction B — "Emalje" (enamel / signal)

**Thesis:** bicycles are painted objects. Use colour as *information* on a
quiet ground — flat colour blocks, no borders, large type. Closer to Danish
signage and wayfinding than to software.

```
--chalk  oklch(0.985 0.003 100)
build / blue        oklch(0.52 0.115 248)
service / green     oklch(0.52 0.095 162)
money / ochre       oklch(0.60 0.105 72)
purchasing / clay   oklch(0.53 0.125 38)
system / plum       oklch(0.48 0.115 315)
alert / red         oklch(0.52 0.165 27)
```
Each hue also gets a wash (`L 0.965 / C 0.018`) for block fills. A section is a
**flat colour block with generous padding and no border**; status is conveyed by
colour, not by a pill. Type heavier and tighter (Archivo or Bricolage at 700).
Navigation moves to a horizontal top bar with a command palette for the tail.

This is the direction that would make the app genuinely distinctive. It is also
the one that fails badly if colour governance slips — six meanings must stay
locked or it becomes a fruit salad, and it needs real accessibility work
(colour cannot be the only carrier of status).

**Feels like:** a modern Danish design studio's internal tool. **Risk:**
medium-high. **Effort:** tokens plus a real component pass plus nav rework.

### Direction C, and why I am not proposing it

The obvious third option is command-palette minimalism: kill the sidebar, ⌘K
for everything, pure typography. It is fashionable and it would look superb in
a screenshot. **It is wrong for this audience** — a workshop owner and mechanics
on tablets with dirty hands do not navigate by keyboard. It optimises for the
developer's fluency, not the user's. Worth naming so it is a decision rather
than an omission.

### My recommendation

**Direction A as the base, borrowing exactly one idea from B:** replace the
pastel *bordered* tint panels with flat colour *fills* used sparingly for
domain identity. A gets you out of "corporate" and into "crafted" at low risk
and mostly through tokens; B's colour system can be adopted later once the
surface primitives from §10 Phase 2 exist to carry it.

## 6. The structural idea that matters more than either: two modes

This applies whichever direction you pick, and it may be the highest-value item
in this document.

**The app serves two audiences through one shell.** The office (Dennis, sales,
bookkeeping — dense tables, keyboard, big screen) and the floor (mechanics —
one task, gloves, tablet, glare). `/work` was designed for the floor and is
excellent. But it still renders the full 14-item office sidebar, where a
mechanic sees Invoices, Purchase orders and Service agreements he will never
open.

Proposal: **one token system, two modes.**

| | Office mode | Floor mode |
|---|---|---|
| Applies to | everything else | `/work`, `/scan`, build workbench, batch build |
| Body size | 15px | 17–18px |
| Min touch target | 32px | 48px |
| Nav | full sidebar | 4 items max + Scan, no office nav |
| Density | tables, multi-column | one card per task, single column |
| Contrast | normal | raised (workshop glare) |

The locale layer *already does exactly this split* — `src/i18n/request.ts` maps
`WORKER_PATH` surfaces to `worker_language`. The same path predicate can drive a
`data-mode="floor"` attribute on `<html>` and a small set of token overrides. So
the mechanism is half-built and the precedent is established.

## 7. Navigation

14 top-level items exceeds comfortable scanning (~7±2), and the middle group
alone has 7. Five items are order types sitting at the same level as "Bikes".
"Bike templates" is configuration you touch once per model, ranked beside daily
work. The customer Map — which you have described as a sales and prospecting
tool — is hidden under Admin.

### The chosen shape — seven groups

```
Today
Bikes        · all bikes · templates · families
Parts        · all parts · stock value · kits
Work         · tickets · work orders · workshop floor · inbox   ← badge count
Orders       · manufacturing · purchase · sales · paint · invoices
Customers    · all customers · service agreements · map
Admin
```

Three things this buys beyond a shorter rail:

1. **Group names are concepts, not pages.** "Orders" is what Dennis calls that
   part of the job; "Purchase orders" is one route inside it.
2. **It stops the rail growing.** CLAUDE.md fixes nav as per-service-type
   permanently — so Paint becomes Paint + Wash + Prime as service types are
   added. Flat, that is a 15th, 16th, 17th line. Grouped, they are children and
   the rail stays seven.
3. **Templates, families and kits stop being Admin.** Kits are a floor picking
   aid and families group templates; neither is configuration. Moving them under
   Bikes/Parts also removes three tiles from the Admin landing.

### How groups behave — the mechanics

**Independent toggles, remembered per person.** Not an accordion. This is the
owner's call and it is the right one: an accordion closes one group when you
open another, which directly contradicts "once it's open it stays open". Each
group is its own switch and the whole set persists, so the rail fans out exactly
the way that person left it — spatial memory holds because nothing moves unless
they move it.

Click cost, honestly:

| Journey | Today | Grouped |
|---|---|---|
| Into a group you keep open | 1 | **1** |
| Sibling of where you are (group open) | 1 | **1** |
| Into a group you keep closed | 1 | 2 |

The only regression is groups you deliberately keep shut — which is a choice the
person made, and the dashboard's money band already covers the common
cross-domain entry ("Go invoice" jumps straight in).

Two rules that keep it usable:

- **Never force a group open on navigation.** If someone closed Orders and then
  follows a dashboard link into a purchase order, re-opening Orders would undo
  their setting. Respect the setting.
- **But always mark where you are.** A closed group containing the current page
  shows a dot, so closing your working group never costs you your sense of
  place. Breadcrumbs carry the group as the first crumb (*Parts › All parts*),
  which is also how the grouping teaches itself without training.

### Where the state lives — use a cookie, not localStorage

This is the one implementation detail that is easy to get wrong and expensive to
retrofit. **The sidebar renders server-side** in `src/app/layout.tsx` from
`readGate()`. With `localStorage`, the server has no idea which groups are open,
so every page load would render everything closed and then pop groups open after
hydration — **a layout shift on every single navigation**, which is precisely the
kind of jank that makes an app feel cheap.

So: a cookie, read in the server layout, same pattern as the existing `fms_auth`
and role-session cookies.

- **Encoding:** the set of OPEN group ids, comma-joined (`nav_open=bikes,orders`).
- **Absent cookie ≠ empty cookie.** No cookie means "never set" → fall back to
  code defaults (open the group containing the current page). An empty value
  means "deliberately closed everything". Collapsing those two states is the
  obvious bug here; the mock-up's logic is unit-tested against exactly this.
- **Durable, not session-scoped.** The owner said "stored in a session" but also
  "stays so until changed" — read as a lasting preference. ~1 year, not a
  session cookie.
- **New groups added later** are not in an existing cookie, so they take their
  code default rather than silently arriving closed.

Per-person rather than per-browser is a later upgrade: mirror onto `people` once
role sessions carry a person in prod (they do not yet — no role passwords are
set). Not needed for the shop today, and it does not change the cookie design.
Worth noting the shared-tablet worry resolves itself: mechanics work in floor
mode, which has its own reduced nav with no groups at all (§6).

**Sequencing:** this changes URLs and muscle memory, so it is **not** a
pre-cutover change. Phase 1 keeps the 14 routes and only restyles the rail (drop
icons, add group micro-headings, lighter weight, more spacing) — zero routing
change, one file. Groups land in Phase 3, after 31 Aug, ideally agreed with
Dennis first since he is the one with the muscle memory.

## 8. Page count — 102 is too many, and ~19 are near-duplicates

Not all 102 are a problem: the print routes are genuinely separate documents and
should stay. The real redundancy is one shape repeated:

**Six controlled vocabularies × three pages each = 18 routes that are the same
form.** `admin/categories`, `colors`, `customer-segments`, `families`,
`hs-codes`, `locations` each have list + new + `[id]`, and each edits some
subset of `{name_en, name_da, is_active, sort_order}`.

Proposal: **one `/admin/lists` page** with a vocabulary switcher and inline row
editing. 18 routes → 1. This is also the single biggest reduction in the
"settings feel overwhelming" complaint, because it collapses six tiles on the
Admin landing into one.

Secondary: seven `[id]/edit` routes (parts, organisations, templates, POs, SOs,
tickets, agreements) could become drawers over the detail page — but only for
the short forms. A 16-field organisation form in a drawer is worse, not better.
I would do this selectively, not as a rule.

Realistic target: **102 → ~80** with no capability lost.

## 9. Density: settings and forms

**Settings is one route carrying seven unrelated domains** — report URL,
language, communication, DNS, accounting, inbound, purchasing — with ~40
controls, of which the inbound block alone is 599 lines and 13 inputs. Stacking
them vertically is what makes it overwhelming.

Fix, without adding routes: **a settings sub-rail.** One page, a left list of
groups (General · Communication · Accounting · Phone & inbox · Public pages),
one panel visible at a time. Perceived weight drops by roughly 80% and no URL
changes. Within the inbound panel, each provider block collapses to a summary
row — *Transcription: Gladia ✓* — that expands on demand.

**Forms:** 16 / 15 / 14 fields on organisation, part and supplier. Apply the
pattern part detail already uses well: required fields visible, the rest behind
a "More details" fold. Most fields are filled once and never revisited.

**Tables:** every `/parts` row carries a green "In stock" pill. A badge on 100%
of rows carries zero information and costs attention — show the pill only for
*low* and *out*. Same principle for the repeated category chips.

## 10. Sequencing against the 31 Aug cutover

This is the part I would push back on if you asked for everything at once.

**The blocker: 159 files hand-roll their surfaces.** Token changes propagate
instantly through CSS variables. *Structural* changes — removing a border,
changing padding, swapping a box for a rule — require touching those 159 files,
and there is no CI (`docs/BACKLOG.md`); manual browser verification is the only
safety net. A 159-file sweep two weeks before you ask a workshop to abandon
paper is precisely the risk your own cutover plan warns about.

So:

**Phase 1 — before Dennis sees it (safe, ~1 day, one file).**
Tokens only: paper ground, warm ink, hairline colour, radius, the display face,
type scale, semantic colours. Plus the four shared components (`Section`,
`StatCard`, `PipelineCard`, `AttentionCard`) and the sidebar restyle from §7
Option 2. Every screen changes; nothing structural moves. **Fully revertable by
reverting one file.** My estimate: this alone gets ~60% of the "feels modern"
win, because it fixes causes 4, 5 and 6 from §2 outright.

**Phase 1b — the three bugs in §11.** Half an hour, do it regardless.

**Phase 2 — after the cutover settles (the real work).**
Introduce surface primitives (`Panel`, `Metric`, `Rule`) and migrate the 159
files mechanically, which is what unlocks killing card soup (cause 1) and the
boxed KPI rows (cause 2). Then the floor/office mode split from §6.

**Phase 3 — later.** Nav Option 1, the `/admin/lists` consolidation, settings
sub-rail, form folds.

**Do not** attempt Phase 2 before 31 Aug. The visual win is real but it is not
worth destabilising the surface every screen is built from in the fortnight
before go-live.

## 11. Bugs found while looking

1. **The Scan FAB overlaps the sidebar "Collapse" control** at bottom-left on
   desktop — visible in every desktop screenshot. The FAB is fixed-positioned
   without accounting for the sidebar footer.
2. **Good news renders in alarm colours.** `AttentionCard` applies its `tone`
   to the *empty* message, so "Every open MO is on schedule." shows in **red**
   and "No paint orders waiting longer than expected." in **amber** on the
   dashboard. The tone describes the card's subject; it is being applied to the
   all-clear. Confirmed in `src/components/dashboard-card.tsx`.
3. **The logo is illegible in the mobile header** (~20px tall detailed lockup).
   `public/icon-mark.svg` exists and should be used below a breakpoint.
4. **Dark-mode primary buttons are below WCAG AA — 3.07:1.**
   `--primary-foreground` stays near-white in both themes while `--primary`
   flips to a light blue. Affects every primary button, active nav item and
   filled badge in dark mode. Measured, not estimated; see §13 for the fix.

Minor: three `/parts` filter dropdowns (Supplier, Kit, Stock) render as empty
chevron buttons with no value shown, and the table overflows horizontally at
1280px.

## 12. Still open

Answered in §0: direction, typeface, wordmark, buttons, nav shape, group-state
persistence. What remains:

1. **The brand accent moves, and it needs a decision.** B as drawn uses signal
   blue **`#2E5FD1`**, noticeably brighter than today's navy `#1e4a7a`. Adopting
   it touches `themeColor` in `layout.tsx`, the PWA splash, and the generated
   icons — so it is a brand call, not a CSS one. Options: take B's blue, or
   retune B's palette around the existing navy (the other five hues still work,
   the wash set would shift slightly cooler).
2. **Colour governance.** With no display face, the six hues carry the whole
   identity. The vocabulary needs to be written down as a rule with one owner
   before Phase 2 spreads it across 159 files, or it drifts into decoration.
   CLAUDE.md already documents a four-hue section-tint vocabulary — B's set
   supersedes it, and the two must not coexist.
3. **Phase 1 before 31 Aug — confirm?** Tokens plus the four shared dashboard
   components plus the rail restyle. One day, essentially one file.
4. **Phase 3 groups — agree with Dennis first?** It changes URLs and the shape
   he will have spent a month learning. My recommendation is to ship Phase 1's
   restyled 14 now, let him live with it, and raise groups at a September
   session rather than deciding it for him.

## 13. Contrast measured — three real failures, now fixed

I measured all 24 hue pairs against WCAG AA rather than eyeballing them, because
with the display face gone colour carries the whole identity. Three failed, one
badly:

| Pair | Was | Problem |
|---|---|---|
| **white on `--accent`, dark mode** | **2.59:1** | The dark accent is a *light* blue, so the primary button, active nav item and Hero badge were white-on-light-blue — effectively unreadable |
| `--money` on its wash, light | 3.76:1 | At 12px bold uppercase a panel title is **not** WCAG "large text", so it needs the full 4.5:1 |
| `--buy` on its wash, light | 4.43:1 | Marginal miss |
| `--ink-3` hints | 3.23:1 light / 3.82:1 dark | Hint text under AA in both themes |

The dark-mode button was the one worth catching — it would have shipped as a
button nobody could read, in the theme least likely to get a careful look.

**Corrected token values (all 24 pairs now ≥ 4.5:1, both themes):**

```
light   --ink-3 #75746F   --money #8E6725   --buy #AF5029
        --on-accent #FFFFFF   --on-alert #FFFFFF
dark    --ink-3 #898983
        --on-accent #161615   --on-alert #161615      ← the flip
```

The structural lesson for Phase 1: **text sitting on a filled accent needs its
own token** (`--on-accent`), not a fixed near-white.

**And this is not hypothetical — the shipped app has the same bug.** In
`src/app/globals.css`, `--primary-foreground` is `oklch(0.985 0 0)` in *both*
themes, while `--primary` flips from `oklch(0.36 0.105 255)` to
`oklch(0.65 0.13 245)`. Converted and measured:

| Theme | Button | Ratio | |
|---|---|---|---|
| Light | `#FAFAFA` on `#0D3D72` | **10.47:1** | AA |
| Dark | `#FAFAFA` on `#3F96D9` | **3.07:1** | **fails AA** |
| Dark, fixed | `#0A0A0A` on `#3F96D9` | 6.18:1 | AA |

So every primary button, active nav item and filled badge in the app's dark
theme is currently below AA. Fix it in Phase 1 regardless of which accent wins —
it is a two-line token change (`--primary-foreground` gets a dark value under
`.dark`) and independent of the whole redesign.

Also still true, and not a contrast matter: **colour must never be the only
carrier.** Status pills keep their text labels (*Out*, *Low*); panel washes are
reinforced by the title in the matching hue and by position.

---

## 14. What actually shipped (2026-07-26) — and where §§1–13 are now wrong

Six commits on `main`, in order: `e635849` audit bugs · `ed81643` tokens +
vocabulary · `f5fbf97` brand assets · `7a0c3ee` primitives · `4445c2f` colour
sweep · `bd1c03b` grouped nav · `12e18ed` KPI row + ink ramp.

### Shipped
- **Direction B tokens** in signal blue `#2E5FD1`, hex not oklch (the values
  are contrast-measured; converting moves the ratios). B's palette lives under
  its own hue names and the shadcn tokens are remapped onto it — that remap is
  what makes 187 files inherit B untouched.
- **`Panel` / `Metric` / `Rule`** primitives. `Section` is now a re-export of
  `Panel`, so all 19 files importing it inherited the new surface with no edit.
  `StatCard` was deleted — it had no callers.
- **517 raw palette colours swept** onto the six hues across 79 files.
- **Seven grouped nav items** with `nav_open` cookie state, resolved
  server-side.
- **Part detail's boxed four-across KPI row** replaced with flat washes; 17
  `className` washes converted to `hue` so titles match their fill.
- **Three of the four §11 bugs**; pill buttons; `themeColor` + PWA splash.

### Corrections to this document
1. **§10's phasing is superseded.** "Phase 2 = a September project, do NOT
   attempt before 31 Aug" was written against the cutover date, but the sharper
   constraint was the dev being away 3 Aug → mid-Aug. The primitives landed
   anyway because they turned out to be *additive* — `Section`→`Panel` gave 19
   files the new surface without a 159-file sweep.
2. **§10's cost model missed a third category.** "Tokens propagate, structure
   doesn't" omitted 517 raw palette colours, which inherit nothing. On a
   direction whose identity is colour, that is not cosmetic.
3. **§11 bug 1 is not real.** The Scan FAB is `md:hidden`, the sidebar is
   `hidden md:flex`; measured at 1280×800 the FAB is `display:none` while
   Collapse sits at (8, 760). The audit saw the Next.js dev-tools badge.
4. **§11 bug 4 was latent, not live.** Nothing applies `.dark` — no theme
   provider, no `prefers-color-scheme` wiring — so the dark theme is
   unreachable and no user was seeing 3.07:1. Fixed regardless.
5. **§13 was necessary but not sufficient.** It measured the ink ramp on
   `--ground`/`--surface` only. On the washes `--ink-3` fell to 4.06:1, and
   darkening it alone collided with `--ink-2`, so the whole ramp moved in both
   themes. Every hue also gained an `--on-{hue}` token.
6. **§7's sequencing was too cautious.** Grouping changes no URLs — every child
   href already existed. It also uses longest-match active logic now, which
   retires §7's hand-written `/organizations` exception.
7. **§12's open questions are closed** — accent (B's blue), colour governance
   (CLAUDE.md, six hues, with the caution=`money` rule and two decorative
   exemptions), Phase 1 before 31 Aug (yes), groups (shipped now, not deferred).

### Also shipped in a second pass
- **`/admin/settings` has the §9 sub-rail.** Five sections, one panel group at a
  time, active section in `?section=`. Measured: 48 form controls rendered at
  once before, 5 on arrival now.
- **The money band's amount is a figure, not part of the eyebrow.** `Panel`
  gained a `figure` slot; the two `{amount}` message keys are gone.
- **All 78 fg/bg pairs per theme now measure ≥ 4.5:1** — the earlier matrices
  only checked each hue on its OWN wash, but a `hue` panel lets any hue's text
  land on any wash. 30 cross combinations per theme were unmeasured; three
  failed. `--money` went darker in light, `--system` lighter in dark.
- **`/admin/settings`**: its six raw `<section>`s are `Panel`s, hued by what
  each one configures. `ReportUrlCard` — the audit's other boxed metric row —
  uses `Metric` inside a `Panel`.
- **`/parts`**: the "In stock" pill is gone from rows that are in stock (a badge
  on 100% of rows carries no information), which also cleared the horizontal
  table overflow. The three blank filter dropdowns are fixed — a bare
  `<SelectValue />` cannot resolve its label while `SelectContent` is unmounted.

### Phase 2, first slice (2026-07-27) — `/inbox` + `/bike-templates`
The two screens this document's second pass skipped are now on `Panel`: both
list pages, both detail pages, and all eleven of their components (the inbound
review stages, the parts recipe, paintwork, version history, the template
form). Measured across `src/**/*.tsx`: `rounded-md border` occurrences 298 →
269, files carrying any hand-rolled bordered surface 184 → 174. (These counts
use a different method from the audit's 345/187 in §1 — occurrences of the
literal class pair, not the audit's tally — so read the delta, not the
absolute.) Three conventions were settled while doing it and are recorded in
DECISIONS 2026-07-27: no wrapper box around a table inside a panel; family
colour rides the title dot, not a header wash; suspected spam is `money`, not
`alert`. `Panel` gained `id` and `ReactNode` titles/descriptions to absorb
both screens without a second primitive.

### Phase 2, second slice (2026-07-27) — the panel-table convention, applied
The 20 files that still boxed a `Table` inside a `Panel` are done: sales-order
detail (payments, linked MOs, linked paint orders), MO bikes + parts, WO parts,
paint-order bikes + items, invoices list (4 sections) + detail, part detail
(stock, offerings, movements, purchase history, pricing history, where-used ×2),
bike detail (identifiers, parts installed, state log). Seven in-panel dashed
empty states became `bg-ground` fills at the same time. **Zero boxed tables
remain inside a panel.** Occurrences 269 → 240, dashed 44 → 37, files 174 →
159. Rationale + the hued-panel exception: DECISIONS 2026-07-27 (later).

### Phase 2, third slice (2026-07-27) — §9's form folds
Organisation (21 fields), part (15) and supplier (14) now show their required
fields and fold the rest. One shared `FormSection` (`src/components/`)
replaces the local helper four forms had each copy-pasted; a section opens on
arrival only if the record already holds something in it, and `forceOpen`
unfolds whichever section owns a failed field. Supplier's flat form gained the
two sections it never had. `CollapsibleSection` moved onto `Panel` in the same
pass, so the app has one fold rather than two that look different. Reasoning
in DECISIONS 2026-07-27 (later).

### Still not done — the honest list
- **~159 files still hand-roll `rounded-* border` surfaces.** They inherit B's
  tokens so they read as *plainer*, not broken, but card soup survives outside
  the migrated screens. This is the remaining Phase 2.

- **`/admin/lists`** consolidation (18 routes → 1): not started (§8).
- **The inbound panel's provider blocks don't collapse.** §9 also asked for each
  one to reduce to a summary row — *Transcription: Gladia ✓* — expanding on
  demand. The sub-rail got the page from 48 controls to 5 on arrival, so this is
  now a refinement of the heaviest section rather than a rescue.
- **Floor/office mode split** (§6) — the highest-value structural idea in this
  document, and untouched.
- **The repeated category chips** (§9). Form folds are done — see the third
  slice above.
- **No dark-mode toggle.** Deliberate: see DECISIONS 2026-07-26.
- **No unit test for the cookie logic.** The plan asked for one; there is no
  test runner in this project (`package.json` has dev/build/start/lint only),
  and inventing one days before a cutover is the wrong trade. The
  absent/empty/new-group cases were verified in the browser instead. CI is
  already parked in BACKLOG.md.

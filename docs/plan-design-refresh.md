# Plan — design refresh (UI / UX / IA)

**Status: proposal for discussion. No code changed.** Written 2026-07-26 after
walking the running app screen by screen.

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

### Option 1 — regroup to seven (the target)

```
Today          (was Dashboard)
Bikes          bikes · templates · families
Parts          parts · stock value · kits
Work           tickets · work orders · workshop floor · inbox   ← badge count
Orders         manufacturing · purchase · sales · paint · invoices
Customers      organisations · contacts · agreements · map
Admin
```

Each group item navigates **straight to its most-used child** and shows its
siblings as tabs — so no extra click on the common path, and the permanent rail
drops from 14 to 7. "Work" becomes the single place where a job lives, which is
also where the Inbox count belongs.

### Option 2 — keep the routes, restyle the rail (the cheap version)

Same 14 destinations, but: drop the icons (they add colour noise and no
recognition value for text labels this distinct), add uppercase micro-headings
per group (*Daily · Orders · System*), lighten the weight, increase the spacing.
Zero routing change, purely visual, done in one file.

**Recommendation: Option 2 before the cutover, Option 1 after.** Option 1
changes URLs and muscle memory, which is the last thing to do two weeks before
you ask a team to switch systems.

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

Minor: three `/parts` filter dropdowns (Supplier, Kit, Stock) render as empty
chevron buttons with no value shown, and the table overflows horizontally at
1280px.

## 12. What I need from you

1. **Direction A or B** — or A-with-B's-colour-fills, which is my
   recommendation.
2. **Accent: keep navy, or move to petrol?** Moving it touches `themeColor`,
   the PWA splash and the icons, so it is a brand decision, not a CSS one.
3. **Display face** — Fraunces, Bricolage Grotesque, or stay all-Geist and win
   the contrast through scale and weight alone. Type is the one thing I would
   not commit to from a description; see §13.
4. **Phase 1 before 31 Aug — yes?** And is Phase 2 a September project?
5. **Nav Option 1 later — agreed in principle?** It changes URLs, so it wants
   your explicit blessing before I plan it.

## 13. Before committing: see it, don't read it

Type and colour cannot honestly be judged from hex values in a document. The
cheap next step is a **static style tile** — one self-contained page showing
Direction A and Direction B side by side, rendering the real dashboard cards,
a parts table row, a part-detail header and the sidebar, in both light and dark.
No app code touched; you look, you point, and only then do we spend Phase 1 on
the winner.

That is roughly an hour of my time and it removes almost all the risk of
choosing wrong. I would do that next, on your word.

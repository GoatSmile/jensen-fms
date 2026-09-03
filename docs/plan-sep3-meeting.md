# 3 September meeting — what we actually saw, and what to do about it

**Written 2026-09-03, after the 10:32 CEST call with Dennis.** Two jobs: correct
the record (the meeting's headline finding is wrong, and the notes locked it in),
then set the work. Verified against the code, the local copy and PRODUCTION —
not against the transcript's own reasoning.

Source: `~/Documents/1-Projects/Jensen/Misc - Transcripts/status - 2026_09_03 10_32 CEST - Notes by Gemini.pdf`

---

## 1 · Corrections — five things we got wrong on the call

### 1.1 The paint order was never frames-only. It had all four lines.

The meeting's top conclusion — *"the system currently only flags frames for
painting, excluding other necessary parts like forks and mudguards"* — is false,
and it is the first bullet of the Gemini notes and a task on Nazar.

`PNT-2026-0014`, created live at 11:01 CEST from `SO-2026-0015`:

| Line | Part | Colour | Price | Painter item |
|---|---|---|---|---|
| Frame ×1 | `JP-SLFB` | Maisgleb | 365,00 kr. | J.Jensen Stel1 |
| Fork ×1 | `JP-SLFFH01B` | Maisgleb | 70,00 kr. | J.Jensen FG1 |
| Cargo bed ×1 | `JP-LS2b` | Maisgleb | 185,00 kr. | J.Jensen Lad1 |
| Mudguards + stays ×1 | `JP-SS60` | Maisgleb | 130,00 kr. | J.Jensen S1 |

Four lines, each naming its specific part, each priced off Metacoat's list, all
frozen (the order is `sent`).

**Root cause: a button label.** `messages/en.json:2072` reads
`Create paint order (1 frame)` — where `count` is the number of **bikes in the
batch**, not the number of parts to paint. One bike was selected, so it said
"1 frame". Nazar half-caught it at 00:28:57 (*"it was just telling me that it's
a frame, okay, so this is right"*), but the 00:20 verdict — *"that's not working
the right way"* — is what the notes recorded.

The seeding is fully generic and always was: `planPaintSeed`
(`src/lib/services/paint-seed.ts`) expands **every**
`bike_template_service_parts` row, and when a template declares none it
synthesises rows from the recipe's paintable parts. There is no frames-only
path anywhere in it.

### 1.2 The MO refused the removal because the row came from the template — nothing to do with orders

Dennis's diagnosis (*"that's because you already created a purchase order or
sales order"*) is wrong, and it will build a wrong mental model if it stands.

The rule is `origin = 'template'`: such a row cannot be removed. Enforced twice
— the menu item is disabled with a tooltip, and `removeMOPart`
(`manage-mo-parts.ts:290`) re-checks server-side and returns
`moCannotRemoveTemplatePart`. **Substitute** is the intended path, and it is
what preserves the trail (`origin='substituted'` + `substituted_from_part_id`,
rendered as *"replaces X"*). That trail is the reason for the rule.

Dennis's garbage can is real — it is on the **template editor**, not the MO.
Nazar guessed this correctly mid-call and dropped it.

His UX complaint survives the correction and is separate: a disabled menu item
behind a `title` tooltip does not explain itself, and he wants click-to-toggle-off
in the picker.

### 1.3 Painted stock CAN be corrected today — just not from the raw part

*"I can correct the raw stock. I cannot correct the painted stock"* was accepted
on the call. It is wrong.

A painted variant is an ordinary `parts` row (`base_part_id` + `color_id`) with
its own stock, its own detail page and its own **Adjust stock** dialog. It is
reachable from **Parts → Paint shelf** (every colour cell links to
`/parts/<variantId>`) and from the plain parts list — variants are not filtered
out. The raw part's own page already shows painted on-hand per colour,
read-only.

**The real gap is narrower, and worth stating precisely:** a painted variant can
only be *born* by a paint order reaching `received_back`.
`findOrCreatePaintedVariant` has exactly one call site — inside
`convertPaintedStock`, called only from
`paint-orders/[id]/_actions/transition-status.ts`. So for painted frames already
on the shelf in a colour that never went through the app, there is no row to
adjust and no UI to create one. That is the thing to build.

Resist the fix as Nazar phrased it (*"adjust stock should say which ones are
painted"*): raw and painted are different parts **on purpose**. What is missing
is a way to *create* the painted row, plus a pointer from the raw part's dialog
to its painted siblings.

### 1.4 The sales order did confirm

*"It's not letting me do this. Maybe because we don't have enough parts"* —
`SO-2026-0015` is `confirmed`. There is no parts guard anywhere in
`transition-so.ts`; the only guard is status adjacency. Nothing to fix, but
don't go hunting for a phantom.

### 1.5 The template screen already flags exactly what confused us — ten minutes too late for the guide

The Paintwork section has flagged unbacked declarations since commit `ee4963a`:
a per-row badge **"not marked in the recipe"** plus a note naming the types.
Opening Dennis's template on the call would have ended the confusion in five
seconds.

Dennis's guide (`54dddd2`, committed **22:02** on 2 Sep) says *"the two do not
check each other yet"*. The check shipped at **22:12** — ten minutes later. The
v2 PDF was rebuilt at 22:44, after the fix, but from unchanged markdown, so it
still carries the stale sentence. **That is the sentence Dennis read.**

---

## 2 · Live-data facts the call did not have

1. **Dennis's own new production template is the real instance of the paint
   problem.** `Svajer cargo F 350` (v1, created today 09:00 CEST, 35 recipe
   rows) declares **five** things to the painter and **two are unbacked** —
   Fork and Sign. Not because a part is unmarked: its recipe contains **no fork
   part and no sign part at all**. So the screen's advice ("mark the part") does
   not apply; he must add them. This matches his own report that parts were
   missing from the system.
2. **`Sign` has no part behind it anywhere in production** — 0 parts mapped,
   yet Jeudan declares Sign ×2, Svajer classic ×1, Svajer cargo F 350 ×1.
   Dennis said explicitly that signs get painted. Until a sign part exists,
   those lines price but never become painted stock.
3. **`Svajer C` — the template actually demoed — declares no Sign.** That is why
   the order had four lines. Dennis recalled *"frame and fork and signs and
   mudguards"*; what he got was frame, fork, **cargo bed**, mudguards. Which is
   right is a question for him.
4. **The Paint shelf is EMPTY in production.** The *"we have 11 already
   painted"* on screen was `JP-LS2b-RED`, local fixture data. Dennis opens the
   same screen and sees nothing. Tell him before he meets it.
5. **Local diverged during the demo, in a way STATUS does not list.** Saving on
   the call set `default_category_id` on **Chain guard** (→ Chainguard) and
   **Mudguards + stays** (→ Mudguards) locally. Production has both `null`, and
   STATUS records Mudguards as *deliberately* unmapped (majority-exception).
   Re-dump, or re-open the decision — but don't let the two drift silently.
6. **Dennis works in PRODUCTION.** `SO-2026-0012` (08:54) and the template
   (09:00) are production rows. Correct under parallel running, but it means
   "his testing" and "the system of record" are one database.

---

## 3 · The offer is not a missing button. It is a designed, unbuilt module.

The largest correction. Nazar's *"I swear I've seen it somewhere"* was right —
he had seen the schema.

Both databases carry a complete offers design with **zero app code**:

- `offers` — `offer_number`, status enum
  (`draft / sent / accepted / rejected / expired / converted`), issued +
  **expiry** date, currency, totals, per-document `language`,
  **`is_price_template`**
- `offer_lines` — structurally identical to `sales_order_lines`
  (`part_id`, `bike_template_id`, **`color_id`**, qty, unit_price, VAT)
- `v_offer_lines_localized`
- `sales_orders.converted_from_offer_id` → `offers(id)`
- `next_document_number('offer')` → `OFF-2026-0001`
- 0 rows. The only code reference in the repo is a delete-guard in
  `delete-template.ts`.

And it is deliberately parked: BACKLOG *"Offers/quotes module (old Tier 5)"*, and
DECISIONS 2026-07-26 rejected *"building the offers module now (still parked
behind the sales track)"*.

**Why that parking is now wrong.** It was parked *behind the website
configurator*, which the owner put at "earliest next year". But Dennis's need
sits **upstream of the whole process we are testing** — *"when I do what you
call a sales order, that is some kind of offer that I have to give to the
customer first"* — and this meeting's own scope is "sales order → paint order
first". The configurator can stay parked; the document cannot.

**The decision (owner's, escalate it):**

- **Option A — build `offers` as designed.** Matches Dennis's language exactly,
  including the clause everyone skipped on the call: *"if they decide no, it
  will just stay in the system as an offer for this customer."* A rejected offer
  stays an offer. Expiry and `is_price_template` (a standing price sheet for a
  hotel chain) are things he will want within weeks.
- **Option B — treat SO draft as the offer** and bolt on print + email. Cheaper.
  Two real costs: every quote burns a gapless `SO-2026-####` at draft creation,
  and "rejected" has to be spelled `cancelled` in the sales-order series.

**Recommended: A, scoped to the document only.** The schema is done,
`offer_lines` mirrors `sales_order_lines` so the lines UI ports across, and
`service-order-document.ts` is the pattern for a per-language document with
print + email through `sendAndRecord`.

---

## 4 · The work

### Tier 0 — corrections, today, no code
1. **Correction sheet for Dennis (PDF).** The paint order did contain all four
   parts; painted stock *can* be adjusted and here is where; here is why his new
   template flags Fork and Sign. Short — one page.
2. **Fix the guide's §6 sentence**, rebuild the PDF, and commit the v2 render
   (currently untracked).
3. **Warn him the production Paint shelf is empty.**
4. **Reconcile local vs production** on Chain guard / Mudguards defaults; extend
   STATUS's divergence list.

### Tier 1 — the meeting's real defects, all small
5. **Rename the paint-order button** (`messages/en.json:2072`) so it cannot be
   misread — count both, e.g. *"Create paint order (1 bike · 4 parts)"*. This
   one string is the entire root cause of the headline "bug".
6. **Split the two causes in the Paintwork note.** "Recipe has an unmarked
   candidate → mark the part" vs "recipe has no such part → add it to the
   recipe". Dennis's template is the second case and today's copy misdirects him.
7. **Explain the disabled Remove on the MO** inline rather than in a tooltip —
   lead with *Substitute*. Optionally: allow removing a template row by
   *recording* it (`origin='removed'`) instead of deleting, which keeps the trail
   the current rule is protecting.

### Tier 2 — the offer (what Dennis is actually waiting on)
8. **Decide A or B, then build `/offers`**: list · new · detail with lines
   (port the SO lines UI) · print + email via `sendAndRecord` · **Convert to
   sales order** writing `converted_from_offer_id`.
9. **Attach a picture to the offer.** `attachments` already does
   upload → Storage → row for parts and work orders, and a `bike-images` bucket
   exists. Extend `entity_type` to `offer`, render it in the document. Keep the
   logocykler designer integration OUT — the near-term need is "attach an image
   I already have".

### Tier 3 — painted stock the shop can correct
10. **"Record painted stock" on the base part** — colour + qty + cost, calling
    `findOrCreatePaintedVariant` and posting `paint_in`. Dennis has committed to
    a counted list, so a batch import may cover cutover and the UI can follow;
    his own fallback (a paint order marked received back) already works and
    leaves a correct cost trail.
11. **Point the raw part's Adjust stock dialog at its painted siblings** —
    *"painted: 11 in Red — adjust there"*.

### Tier 4 — Dennis's data homework, now sharper than his action list
12. **Create the Sign part(s)** and the **fork for Svajer cargo F 350**, then
    confirm that template's Paintwork section shows no "not marked in the
    recipe" badges.
13. **Resolve Svajer C** — sign, or cargo bed?
14. **Answer the three standing paint questions** in STATUS (Jeudan
    basket/sign · `JP-Ni42` / `JP-SKSA46` · Svajer F mudguards).
15. **Accessories (lights, locks).** He added them as *order lines* on the call,
    which already works. Putting them in **templates** is a different choice —
    they become BOM parts consumed at build. Make that call deliberately rather
    than doing both.

### Tier 5 — a promise with no infrastructure behind it
16. Nazar offered Dennis *"I can give you two of them, you can have your own
    test."* Nothing backs that: one Supabase project, one local copy on Nazar's
    Mac, no staging, no preview. Either stand one up (Supabase branch + Vercel
    preview) or retract the offer and lean on the TEST-prefix convention —
    which is what production testing already depends on.

---

## 5 · What worked, and should not be reopened

Deposit invoice, issue, credit note, and the outbox all behaved, and Dennis
reacted to each (*"Beautiful"*). The paint document, the email-is-the-send
freeze, MO shortfall → draft PO, and substitution provenance all did what they
were built to do. The template-as-static-recipe decision was reached
independently by both parties and is now aligned — log it.

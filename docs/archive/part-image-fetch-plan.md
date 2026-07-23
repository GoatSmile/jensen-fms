# Part image auto-fetch — runbook

**Status:** ready to run (dry run done on first 10 — see `part-image-runs/`)
**Date:** 2026-07-02
**Model:** this is a **self-contained procedure that Claude executes live,
in-session**, using its own web search + vision. **No API keys, no cron.** The
owner invokes it per batch ("run the part-image procedure on the next N"); it is
rerunnable, resumable, and parameterised. This file is the durable spec so any
future session runs it identically without re-deriving the design.

---

## 1. What it does

For each part: find the most likely real product photo on the web, judge how sure
we are it's the right one, and **either attach it or hold it** — then log the
decision. Output is (a) attachments written to the `part-images` bucket and
(b) a run report under `docs/part-image-runs/`.

---

## 2. Grounded facts (verified against live DB + code, 2026-07-02)

- Part images are **not** a `parts` column. They are `attachments` rows
  (`entity_type='part'`, `entity_id=<partId>`, `purpose` ∈ {`hero`,`gallery`}),
  bytes in the **`part-images`** bucket at `<partId>/<uuid>.<ext>`. First photo
  → `hero`. Ref: `src/app/parts/[id]/_actions/upload-image.ts`.
- `attachments` insert shape: `entity_type, entity_id, file_url, file_name,
  file_size_bytes, mime_type, purpose`.
- **176 live parts, 0 currently have any image** — clean slate.
- Best identifier is **`part_supplier_offerings.supplier_sku`** (the real brand
  article number; a part may have several offerings, one `is_preferred`) joined
  to `suppliers.name`. Parts also have `name_en/name_da`, `category`, `notes`.
- Writes use PostgREST + Storage REST with `SUPABASE_SECRET_KEY` (via the
  Supabase MCP in-session), same as the existing `scripts/*.py` jobs.

---

## 3. The run loop (per batch)

1. **Select batch** (SQL, params below) — parts + preferred `supplier_sku` +
   supplier name + category. Default: skip parts that already have a hero.
2. **For each part:**
   a. **Query ladder** (stop at first confident hit): `supplier_name +
      supplier_sku` → `supplier_sku + name_en` → `name_en + category (EN)`.
   b. **Gather candidates** — collect up to N (default 3) image/product-page
      results. Prefer manufacturer / authorised-dealer pages.
   c. **Look** — download the top candidate(s) and actually view them.
   d. **Score 0–100** with the rubric in §4.
   e. **Decide** — attach clean / attach flagged / hold (§5). Escalate before
      holding (§6).
   f. **Write** (unless `--dry-run`) — upload → insert `attachments` row,
      row-first/file-second like `upload-image.ts`.
   g. **Log** the row to the report.
3. **Emit report** to `docs/part-image-runs/run-<date>-<label>.md` (+ optional
   CSV): header (params, totals), a flagged/held section, per-part table.

**Resumable / rerunnable:** `--only-missing` (default) means re-running never
duplicates and naturally picks up where prior batches stopped. Re-run after
supplier numbers are filled in to lift the weak parts.

---

## 4. Confidence rubric — how the number is derived

Confidence = "how sure am I this image is **this specific part**", built from
factors, not vibes:

**Raises confidence**
- **Identity anchor** — brand + `supplier_sku` resolved to a canonical page
  (manufacturer or authorised dealer) and the image comes from it. *Biggest factor.*
- **Visual type match** — the photo shows the right kind of component (matches category).
- **Spec match** — visible attributes line up: teeth count (38T), colour
  (matte black), size (22-622), voltage (6-12V), variant.

**Lowers confidence**
- **Ambiguity** — two distinct real products both fit (e.g. Slyde *guard* vs its
  *bracket*) and the image can't be told apart.
- **Genericness** — a commodity where no image identifies the exact part (screws,
  washers, unbranded crankset). Even a "correct-looking" photo says little.
- **Variant uncertainty** — right family, unknown sub-variant (e.g. which H-Trace).
- **Weak source** — only marketplace listings / user photos, no clean product shot.

Rough bands: **≥ 80** identity-anchored + spec match (often vision-verified) ·
**65–79** right brand/product, minor variant/size doubt · **50–64** right *type*,
identity not pinned · **< 50** generic or unresolved.

---

## 5. The attach / hold decision (the core question)

Two tunable thresholds create three outcomes:

- **TRUST line — default 75.** Confidence ≥ 75 → **attach as `hero`, clean.**
- **HOLD floor — default 50.** Confidence between floor and trust →
  **attach but flag** (provisional). Below floor → **do NOT attach — hold.**

So:

| Confidence | Outcome | In the DB |
|---|---|---|
| ≥ 75 | attach, confident | `attachments` row, `purpose='hero'` |
| 50–74 | attach, **flagged** for a human glance | `hero` (default) — flag lives in the report; **stricter option:** write as `gallery` so it isn't the headline thumbnail until promoted |
| < 50 | **hold** — no image written | nothing; logged with the reason + best runner-up URL |

This matches your "attach and flag" call — we lean toward giving every part a
picture — **but there's still a floor** below which we deliberately don't attach,
because a wrong or meaningless image is worse than none.

**A part is "not confident enough" (→ hold) when any of these is true:**
1. The code/name resolved to **no branded source** *and* the part isn't a
   visually-obvious commodity (nothing trustworthy to show).
2. **Genuine ambiguity** between two real products I can't visually resolve.
3. **Generic hardware** (screws/nuts/washers) — off by default; a stock fastener
   photo adds ~nothing. (Toggle `--include-hardware` to attach anyway.)
4. Only low-trust sources (marketplace thumbnails, dubious user photos).

Everything above is tunable per run — raise the floor to 65 for "good images
only", set it to 0 to attach every best-guess, raise/lower the trust line, etc.

---

## 6. Escalate before holding

Don't hold on the first miss. If the best candidate is below the trust line:
try the **next query in the ladder**, and/or pull **more candidates** (up to 5)
and view the top 2. Only hold once the ladder is exhausted. Always record the
**runner-up URL** so a human can one-click swap later.

---

## 7. Parameters

```
run part-image procedure [params]
  --limit N              batch size (e.g. next 30)
  --skus a,b,c           only these internal_skus
  --category NAME        only this category
  --only-missing         skip parts that already have a hero (default: on)
  --overwrite            replace an existing hero
  --candidates N         candidates to gather/score per part (default 3, max 5)
  --trust N              hero-clean threshold (default 75)
  --floor N              attach floor; below = hold (default 50)
  --provisional hero|gallery   how to store 50–74 hits (default hero)
  --include-hardware     attach generic fasteners too (default: hold them)
  --dry-run              search + score + report, no upload/DB write
```

Typical: dry-run a batch first → review the report → re-run same params without
`--dry-run` to commit. Re-run `--only-missing` after supplier numbers improve.

---

## 8. Report format

`docs/part-image-runs/run-<date>-<label>.md` — header (params, engine, totals:
attempted / hero / flagged / held / no-candidate), a "held + flagged" section up
top for quick action, then a per-part table: SKU · name · category · outcome ·
confidence · basis (vision-verified vs search-inferred) · source URL · runner-up.
See `run-2026-07-02-dryrun-first10.md` for the worked example.

---

## 9. Open decisions to confirm
1. Default **trust=75 / floor=50** ok, or different?
2. Provisional (50–74) → **hero** (give it a picture now) or **gallery** (don't
   let an unsure image be the headline until reviewed)? Default: hero.
3. **Generic hardware** — hold by default (my rec) or attach representative photos?
4. Batch size for the first real (non-dry) run?
